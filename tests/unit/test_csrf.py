from __future__ import annotations

from types import SimpleNamespace
import unittest

from apps.api.agriscope_api.core.csrf import (
    CSRF_COOKIE_NAME,
    CSRF_TTL_SECONDS,
    delete_csrf_cookie,
    new_csrf_token,
    normalized_origin,
    set_csrf_cookie,
    validate_csrf,
)
from apps.api.agriscope_api.core.errors import ApiException


class HeaderBag:
    def __init__(self, values: dict[str, str | list[str]] | None = None) -> None:
        self.values = {key.lower(): value for key, value in (values or {}).items()}

    def getlist(self, name: str) -> list[str]:
        value = self.values.get(name.lower(), [])
        return value if isinstance(value, list) else [value]


class FakeRequest:
    def __init__(
        self,
        *,
        method: str = "POST",
        origin: str | list[str] | None = "http://localhost:3000",
        cookies: dict[str, str] | None = None,
        csrf_header: str | list[str] | None = None,
        app_url: str = "http://localhost:3000",
    ) -> None:
        headers: dict[str, str | list[str]] = {}
        if origin is not None:
            headers["origin"] = origin
        if csrf_header is not None:
            headers["x-csrf-token"] = csrf_header
        self.method = method
        self.headers = HeaderBag(headers)
        self.cookies = cookies or {}
        self.app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(app_url=app_url)))


class CapturingResponse:
    def __init__(self) -> None:
        self.set_calls: list[tuple[str, str, dict]] = []
        self.delete_calls: list[tuple[str, dict]] = []

    def set_cookie(self, name: str, value: str, **kwargs) -> None:
        self.set_calls.append((name, value, kwargs))

    def delete_cookie(self, name: str, **kwargs) -> None:
        self.delete_calls.append((name, kwargs))


class CsrfTests(unittest.TestCase):
    def test_bootstrap_tokens_are_random_and_cookie_attributes_are_exact(self):
        first = new_csrf_token()
        second = new_csrf_token()
        self.assertNotEqual(first, second)
        self.assertGreaterEqual(len(first), 32)

        settings = SimpleNamespace(cookie_secure=True, cookie_samesite="strict")
        response = CapturingResponse()
        set_csrf_cookie(response, settings, first)
        delete_csrf_cookie(response, settings)

        self.assertEqual(
            response.set_calls,
            [
                (
                    CSRF_COOKIE_NAME,
                    first,
                    {
                        "httponly": False,
                        "secure": True,
                        "samesite": "strict",
                        "max_age": CSRF_TTL_SECONDS,
                        "path": "/",
                    },
                )
            ],
        )
        self.assertEqual(
            response.delete_calls,
            [
                (
                    CSRF_COOKIE_NAME,
                    {
                        "path": "/",
                        "secure": True,
                        "httponly": False,
                        "samesite": "strict",
                    },
                )
            ],
        )

    def test_exact_origin_and_matching_double_submit_token_are_accepted(self):
        request = FakeRequest(
            origin="HTTP://LOCALHOST:3000",
            cookies={"agriscope_access": "access", CSRF_COOKIE_NAME: "opaque"},
            csrf_header="opaque",
        )
        validate_csrf(request)
        self.assertEqual(normalized_origin("https://Example.COM"), "https://example.com:443")
        self.assertEqual(normalized_origin("http://[::1]"), "http://[::1]:80")

    def test_origin_and_token_rejection_matrix(self):
        invalid_origins: list[str | list[str] | None] = [
            None,
            "null",
            "not-an-origin",
            ["http://localhost:3000", "http://localhost:3000"],
            "https://localhost:3000",
            "http://example.com:3000",
            "http://localhost:3001",
            "http://localhost:3000/path",
        ]
        for origin in invalid_origins:
            with self.subTest(origin=origin), self.assertRaises(ApiException) as caught:
                validate_csrf(
                    FakeRequest(
                        origin=origin,
                        cookies={"agriscope_access": "access", CSRF_COOKIE_NAME: "same"},
                        csrf_header="same",
                    )
                )
            self.assertEqual(caught.exception.code, "csrf_failed")

        invalid_tokens = [
            ({"agriscope_access": "access"}, "same"),
            ({"agriscope_refresh": "refresh", CSRF_COOKIE_NAME: "same"}, None),
            ({"agriscope_access": "access", CSRF_COOKIE_NAME: "one"}, "two"),
            (
                {"agriscope_access": "access", CSRF_COOKIE_NAME: "same"},
                ["same", "same"],
            ),
        ]
        for cookies, header in invalid_tokens:
            with self.subTest(cookies=cookies, header=header), self.assertRaises(ApiException):
                validate_csrf(FakeRequest(cookies=cookies, csrf_header=header))

    def test_bearer_only_without_auth_cookies_skips_but_cookie_presence_enforces(self):
        validate_csrf(FakeRequest(origin=None, cookies={}), always=False)
        with self.assertRaises(ApiException):
            validate_csrf(
                FakeRequest(origin=None, cookies={"agriscope_access": "present"}),
                always=False,
            )
        with self.assertRaises(ApiException):
            validate_csrf(FakeRequest(origin=None, cookies={}), always=True)

    def test_safe_methods_do_not_require_csrf(self):
        validate_csrf(FakeRequest(method="GET", origin=None, cookies={"agriscope_access": "x"}))


if __name__ == "__main__":
    unittest.main()
