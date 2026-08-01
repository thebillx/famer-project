"""Standard API error shape."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ApiError:
    code: str
    message: str
    request_id: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_response(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "request_id": self.request_id,
                "details": self.details,
            }
        }


class ApiException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
