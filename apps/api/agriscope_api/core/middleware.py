"""HTTP middleware for request IDs, security headers, and logging."""

from __future__ import annotations

import time
from uuid import uuid4

REQUEST_ID_HEADER = "x-request-id"


def get_or_create_request_id(headers: dict[str, str] | None = None) -> str:
    headers = headers or {}
    incoming = headers.get(REQUEST_ID_HEADER) or headers.get(REQUEST_ID_HEADER.title())
    return incoming or str(uuid4())


SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
}


def request_duration_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000.0, 3)
