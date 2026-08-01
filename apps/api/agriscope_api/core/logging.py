"""Structured logging helpers with sensitive-field redaction."""

from __future__ import annotations

import json
import logging
from typing import Any

SENSITIVE_LOG_KEYS = {
    "password",
    "password_hash",
    "cookie",
    "authorization",
    "access_token",
    "refresh_token",
    "session_secret",
    "database_url",
    "cdse_client_secret",
    "object_storage_secret_key",
}


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: ("********" if key.lower() in SENSITIVE_LOG_KEYS else redact(inner))
            for key, inner in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def log_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    payload = {"event": event, **redact(fields)}
    logger.log(level, json.dumps(payload, ensure_ascii=False, sort_keys=True))
