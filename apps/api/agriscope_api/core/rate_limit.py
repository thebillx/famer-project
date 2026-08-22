"""Bounded, concurrency-safe fixed-window rate limiting for one API process."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import ipaddress
import math
from threading import Lock
import time
from typing import Callable, Iterable

from apps.api.agriscope_api.core.errors import ApiException


@dataclass(frozen=True)
class RateLimitBucket:
    kind: str
    value: str
    limit: int


@dataclass
class _Window:
    count: int
    ends_at: float


class FixedWindowRateLimiter:
    """Atomic multi-bucket limiter with bounded active-key storage."""

    def __init__(
        self,
        *,
        secret: str,
        window_seconds: int,
        max_entries: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._secret = secret.encode("utf-8")
        self.window_seconds = window_seconds
        self.max_entries = max_entries
        self._clock = clock
        self._entries: dict[tuple[str, str], _Window] = {}
        self._lock = Lock()

    def _key(self, bucket: RateLimitBucket) -> tuple[str, str]:
        message = f"rate-limit:v1:{bucket.kind}:{bucket.value}".encode("utf-8")
        digest = hmac.new(self._secret, message, hashlib.sha256).hexdigest()
        return bucket.kind, digest

    @staticmethod
    def _retry_after(ends_at: float, now: float) -> int:
        return max(1, math.ceil(ends_at - now))

    def check(self, buckets: Iterable[RateLimitBucket]) -> None:
        requested = tuple(buckets)
        if not requested:
            return
        if any(bucket.limit <= 0 or not bucket.kind or not bucket.value for bucket in requested):
            raise ValueError("invalid rate-limit bucket")

        now = self._clock()
        keyed = tuple((self._key(bucket), bucket.limit) for bucket in requested)
        if len({key for key, _limit in keyed}) != len(keyed):
            raise ValueError("duplicate rate-limit bucket")

        with self._lock:
            expired = [key for key, window in self._entries.items() if window.ends_at <= now]
            for key in expired:
                del self._entries[key]

            rejected_until = [
                self._entries[key].ends_at
                for key, limit in keyed
                if key in self._entries and self._entries[key].count >= limit
            ]
            if rejected_until:
                raise_rate_limited(max(self._retry_after(end, now) for end in rejected_until))

            new_keys = [key for key, _limit in keyed if key not in self._entries]
            if len(self._entries) + len(new_keys) > self.max_entries:
                active_ends = [window.ends_at for window in self._entries.values()]
                retry_after = self.window_seconds
                if active_ends:
                    retry_after = min(
                        self.window_seconds,
                        max(1, min(self._retry_after(end, now) for end in active_ends)),
                    )
                raise_rate_limited(retry_after)

            for key, _limit in keyed:
                window = self._entries.get(key)
                if window is None:
                    self._entries[key] = _Window(count=1, ends_at=now + self.window_seconds)
                else:
                    window.count += 1

    def active_entry_count(self) -> int:
        with self._lock:
            return len(self._entries)

    def stored_keys(self) -> tuple[tuple[str, str], ...]:
        """Expose only domain and digest for security-focused unit assertions."""

        with self._lock:
            return tuple(sorted(self._entries))


def raise_rate_limited(retry_after: int) -> None:
    raise ApiException(
        "rate_limited",
        "Too many requests",
        429,
        {"retry_after": int(retry_after)},
    )


def trusted_client_ip(request, trusted_proxy_cidrs: tuple[str, ...]) -> str:
    peer_text = request.client.host if request.client is not None else ""
    try:
        peer = ipaddress.ip_address(peer_text)
    except ValueError:
        return "unknown"

    trusted = any(peer in ipaddress.ip_network(network) for network in trusted_proxy_cidrs)
    if not trusted:
        return str(peer)

    forwarded_values = request.headers.getlist("x-forwarded-for")
    if len(forwarded_values) != 1 or "," in forwarded_values[0]:
        return str(peer)
    try:
        return str(ipaddress.ip_address(forwarded_values[0].strip()))
    except ValueError:
        return str(peer)


def enforce_rate_limit(request, buckets: Iterable[RateLimitBucket]) -> None:
    request.app.state.rate_limiter.check(buckets)


def client_ip_bucket(request, kind: str, limit: int) -> RateLimitBucket:
    settings = request.app.state.settings
    return RateLimitBucket(
        kind=kind,
        value=trusted_client_ip(request, settings.trusted_proxy_cidrs),
        limit=limit,
    )
