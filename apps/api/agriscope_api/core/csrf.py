"""Explicit double-submit CSRF protection for browser cookie sessions."""

from __future__ import annotations

import hmac
import secrets
from urllib.parse import urlsplit

from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.dependencies.auth import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME


CSRF_COOKIE_NAME = "agriscope_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_TTL_SECONDS = 15 * 60
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def new_csrf_token() -> str:
    """Return an opaque token with enough entropy for double-submit validation."""

    return secrets.token_urlsafe(32)


def normalized_origin(value: str) -> str:
    """Normalize an HTTP origin, including its effective port, or reject it."""

    if not value or value == "null" or "," in value or any(character.isspace() for character in value):
        raise ValueError("invalid origin")
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.hostname is None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("invalid origin")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("invalid origin") from exc
    effective_port = port or (443 if parsed.scheme == "https" else 80)
    hostname = parsed.hostname.lower()
    host = f"[{hostname}]" if ":" in hostname else hostname
    return f"{parsed.scheme.lower()}://{host}:{effective_port}"


def request_uses_auth_cookies(request) -> bool:
    return ACCESS_COOKIE_NAME in request.cookies or REFRESH_COOKIE_NAME in request.cookies


def validate_csrf(request, *, always: bool = False) -> None:
    """Validate exact Origin and double-submit values before an unsafe side effect."""

    if request.method.upper() not in UNSAFE_METHODS:
        return
    if not always and not request_uses_auth_cookies(request):
        return

    origins = request.headers.getlist("origin")
    try:
        actual_origin = normalized_origin(origins[0]) if len(origins) == 1 else ""
        expected_origin = normalized_origin(request.app.state.settings.app_url)
    except ValueError as exc:
        raise ApiException("csrf_failed", "CSRF validation failed", 403) from exc
    if not actual_origin or not hmac.compare_digest(actual_origin, expected_origin):
        raise ApiException("csrf_failed", "CSRF validation failed", 403)

    cookie_token = request.cookies.get(CSRF_COOKIE_NAME, "")
    header_values = request.headers.getlist(CSRF_HEADER_NAME)
    header_token = header_values[0] if len(header_values) == 1 else ""
    if (
        not cookie_token
        or not header_token
        or not hmac.compare_digest(cookie_token.encode("utf-8"), header_token.encode("utf-8"))
    ):
        raise ApiException("csrf_failed", "CSRF validation failed", 403)


def set_csrf_cookie(response, settings, token: str) -> None:
    response.set_cookie(
        CSRF_COOKIE_NAME,
        token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=CSRF_TTL_SECONDS,
        path="/",
    )


def delete_csrf_cookie(response, settings) -> None:
    response.delete_cookie(
        CSRF_COOKIE_NAME,
        path="/",
        secure=settings.cookie_secure,
        httponly=False,
        samesite=settings.cookie_samesite,
    )
