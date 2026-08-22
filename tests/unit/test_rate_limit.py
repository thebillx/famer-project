from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import logging
from types import SimpleNamespace
import unittest

from apps.api.agriscope_api.core.config import settings_from_env, validate_settings
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.core.logging import log_event, redact
from apps.api.agriscope_api.core.rate_limit import (
    FixedWindowRateLimiter,
    RateLimitBucket,
    trusted_client_ip,
)
from apps.api.agriscope_api.api.v1.auth import _rate_email


class Clock:
    def __init__(self, value: float = 0.0) -> None:
        self.value = value

    def __call__(self) -> float:
        return self.value


class HeaderBag:
    def __init__(self, values: dict[str, str | list[str]] | None = None) -> None:
        self.values = {key.lower(): value for key, value in (values or {}).items()}

    def getlist(self, name: str) -> list[str]:
        value = self.values.get(name.lower(), [])
        return value if isinstance(value, list) else [value]


def request(peer: str, forwarded: str | list[str] | None = None):
    values = {} if forwarded is None else {"x-forwarded-for": forwarded}
    return SimpleNamespace(client=SimpleNamespace(host=peer), headers=HeaderBag(values))


class CapturingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


class RateLimitTests(unittest.TestCase):
    def test_fixed_window_boundary_and_retry_after_rounding(self):
        clock = Clock(100.0)
        limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=100, clock=clock)
        bucket = RateLimitBucket("login-email", "person@example.com", 2)
        limiter.check([bucket])
        limiter.check([bucket])
        clock.value = 159.01
        with self.assertRaises(ApiException) as caught:
            limiter.check([bucket])
        self.assertEqual(caught.exception.code, "rate_limited")
        self.assertEqual(caught.exception.details, {"retry_after": 1})
        clock.value = 160.0
        limiter.check([bucket])

    def test_multi_bucket_rejection_is_atomic_and_principals_are_isolated(self):
        limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=100)
        exhausted = RateLimitBucket("login-ip", "192.0.2.1", 1)
        untouched = RateLimitBucket("login-email", "one@example.com", 1)
        limiter.check([exhausted])
        with self.assertRaises(ApiException):
            limiter.check([exhausted, untouched])
        limiter.check([untouched])
        limiter.check([RateLimitBucket("login-email", "two@example.com", 1)])

    def test_storage_is_bounded_and_expired_keys_are_evicted(self):
        clock = Clock()
        limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=2, clock=clock)
        limiter.check([RateLimitBucket("one", "raw-one", 10)])
        limiter.check([RateLimitBucket("two", "raw-two", 10)])
        with self.assertRaises(ApiException) as caught:
            limiter.check([RateLimitBucket("three", "raw-three", 10)])
        self.assertEqual(caught.exception.details["retry_after"], 60)
        clock.value = 60.0
        limiter.check([RateLimitBucket("three", "raw-three", 10)])
        self.assertEqual(limiter.active_entry_count(), 1)
        rendered = repr(limiter.stored_keys())
        for raw in ("raw-one", "raw-two", "raw-three"):
            self.assertNotIn(raw, rendered)

    def test_concurrent_requests_never_exceed_limit(self):
        limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=100)
        bucket = RateLimitBucket("satellite-subject", "subject", 20)

        def attempt(_index: int) -> bool:
            try:
                limiter.check([bucket])
            except ApiException:
                return False
            return True

        with ThreadPoolExecutor(max_workers=16) as executor:
            accepted = list(executor.map(attempt, range(100)))
        self.assertEqual(sum(accepted), 20)

    def test_domain_separation_and_aggregate_buckets_resist_identity_rotation(self):
        limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=100)
        limiter.check(
            [
                RateLimitBucket("login-email", "same", 10),
                RateLimitBucket("satellite-field", "same", 10),
                RateLimitBucket("mutation-subject", "same", 10),
            ]
        )
        keys = limiter.stored_keys()
        self.assertEqual(len(keys), 3)
        self.assertEqual(len({digest for _kind, digest in keys}), 3)
        self.assertNotIn("same", repr(keys))
        expected_login_digest = hmac.new(
            ("s" * 32).encode(),
            b"rate-limit:v1:login-email:same",
            hashlib.sha256,
        ).hexdigest()
        self.assertIn(("login-email", expected_login_digest), keys)

        email_limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=100)
        email_limiter.check([RateLimitBucket("login-email", _rate_email(" Farmer@Example.COM "), 1)])
        with self.assertRaises(ApiException):
            email_limiter.check([RateLimitBucket("login-email", _rate_email("farmer@example.com"), 1)])

        satellite_limiter = FixedWindowRateLimiter(secret="s" * 32, window_seconds=60, max_entries=100)
        satellite_limiter.check(
            [
                RateLimitBucket("satellite-subject", "user", 2),
                RateLimitBucket("satellite-field", "user:field-one", 10),
            ]
        )
        satellite_limiter.check(
            [
                RateLimitBucket("satellite-subject", "user", 2),
                RateLimitBucket("satellite-field", "user:field-two", 10),
            ]
        )
        with self.assertRaises(ApiException):
            satellite_limiter.check(
                [
                    RateLimitBucket("satellite-subject", "user", 2),
                    RateLimitBucket("satellite-field", "user:field-three", 10),
                ]
            )

    def test_trusted_proxy_uses_only_one_valid_forwarded_ip(self):
        trusted = ("10.0.0.0/8", "2001:db8::/32")
        self.assertEqual(trusted_client_ip(request("192.0.2.2", "203.0.113.7"), trusted), "192.0.2.2")
        self.assertEqual(trusted_client_ip(request("10.0.0.2", "203.0.113.7"), trusted), "203.0.113.7")
        self.assertEqual(trusted_client_ip(request("10.0.0.2", "203.0.113.7, 10.0.0.1"), trusted), "10.0.0.2")
        self.assertEqual(trusted_client_ip(request("10.0.0.2", ["203.0.113.7", "198.51.100.2"]), trusted), "10.0.0.2")
        self.assertEqual(trusted_client_ip(request("10.0.0.2", "invalid"), trusted), "10.0.0.2")
        self.assertEqual(trusted_client_ip(request("invalid", "203.0.113.7"), trusted), "unknown")

    def test_rate_limit_config_ranges_and_proxy_cidrs_are_validated(self):
        settings = settings_from_env(
            {
                "RATE_LIMIT_WINDOW_SECONDS": "59",
                "RATE_LIMIT_MAX_ENTRIES": "99",
                "RATE_LIMIT_LOGIN_IP": "0",
                "TRUSTED_PROXY_CIDRS": "10.0.0.0/8,not-a-network",
            }
        )
        fields = {issue.field for issue in validate_settings(settings)}
        self.assertEqual(
            fields & {
                "RATE_LIMIT_WINDOW_SECONDS",
                "RATE_LIMIT_MAX_ENTRIES",
                "RATE_LIMIT_LOGIN_IP",
                "TRUSTED_PROXY_CIDRS",
            },
            {
                "RATE_LIMIT_WINDOW_SECONDS",
                "RATE_LIMIT_MAX_ENTRIES",
                "RATE_LIMIT_LOGIN_IP",
                "TRUSTED_PROXY_CIDRS",
            },
        )

    def test_logging_redacts_auth_csrf_password_cookie_and_rate_key_values(self):
        secret_fields = {
            "Authorization": "Bearer access-secret",
            "Cookie": "agriscope_access=cookie-secret",
            "Set-Cookie": "agriscope_refresh=refresh-secret",
            "X-CSRF-Token": "csrf-secret",
            "password": "password-secret",
            "rate-limit-key": "digest-secret",
        }
        redacted = redact(secret_fields)
        self.assertEqual(set(redacted.values()), {"********"})

        logger = logging.getLogger("agriscope.test.redaction")
        logger.propagate = False
        logger.setLevel(logging.INFO)
        handler = CapturingHandler()
        logger.addHandler(handler)
        try:
            log_event(logger, logging.INFO, "security_test", **secret_fields)
        finally:
            logger.removeHandler(handler)
        rendered = "".join(handler.messages)
        for value in secret_fields.values():
            self.assertNotIn(value, rendered)


if __name__ == "__main__":
    unittest.main()
