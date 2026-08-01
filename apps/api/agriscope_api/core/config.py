"""Typed runtime settings and dependency-light validation helpers."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import os
from typing import Any


class AppEnvironment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class CookieSameSite(StrEnum):
    LAX = "lax"
    STRICT = "strict"
    NONE = "none"


SENSITIVE_FIELDS = {
    "database_url",
    "redis_url",
    "session_secret",
    "encryption_key",
    "cdse_client_secret",
    "object_storage_secret_key",
}

KNOWN_DEVELOPMENT_SECRETS = {
    "change-me-development-session-secret-32",
    "change-me-development-encryption-key-32",
    "dev-session-secret",
    "dev-encryption-key",
}


@dataclass(frozen=True)
class SettingsValidationIssue:
    field: str
    message: str


@dataclass(frozen=True)
class SettingsSnapshot:
    app_env: str
    app_name: str
    app_url: str
    api_v1_prefix: str
    database_url: str
    redis_url: str
    object_storage_endpoint: str
    object_storage_bucket: str
    session_secret: str
    encryption_key: str
    access_token_ttl_minutes: int
    refresh_token_ttl_days: int
    cookie_secure: bool
    cookie_samesite: str
    log_level: str
    cdse_client_id: str = ""
    cdse_client_secret: str = ""
    cdse_token_url: str = ""
    cdse_catalog_url: str = "https://sh.dataspace.copernicus.eu/catalog/v1"
    cdse_process_url: str = "https://sh.dataspace.copernicus.eu/process/v1"
    cdse_statistical_url: str = "https://sh.dataspace.copernicus.eu/statistics/v1"
    object_storage_secret_key: str = ""

    def safe_dict(self) -> dict[str, Any]:
        data = self.__dict__.copy()
        for field in SENSITIVE_FIELDS:
            if field in data and data[field]:
                data[field] = "********"
        return data

    def __repr__(self) -> str:
        return f"SettingsSnapshot({self.safe_dict()!r})"


def _bool(value: str, default: bool) -> bool:
    if value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def settings_from_env(environ: dict[str, str] | None = None) -> SettingsSnapshot:
    env = environ if environ is not None else os.environ
    app_env = env.get("APP_ENV", AppEnvironment.DEVELOPMENT.value).lower()
    return SettingsSnapshot(
        app_env=app_env,
        app_name=env.get("APP_NAME", "AgriScope Thailand"),
        app_url=env.get("APP_URL", "http://localhost:3000"),
        api_v1_prefix=env.get("API_V1_PREFIX", "/api/v1"),
        database_url=env.get(
            "DATABASE_URL",
            "postgresql+asyncpg://agriscope:agriscope_dev_password@localhost:5432/agriscope",
        ),
        redis_url=env.get("REDIS_URL", "redis://localhost:6379/0"),
        object_storage_endpoint=env.get("OBJECT_STORAGE_ENDPOINT", "http://localhost:9000"),
        object_storage_bucket=env.get("OBJECT_STORAGE_BUCKET", "agriscope-dev"),
        session_secret=env.get(
            "SESSION_SECRET", "change-me-development-session-secret-32"
        ),
        encryption_key=env.get(
            "ENCRYPTION_KEY", "change-me-development-encryption-key-32"
        ),
        access_token_ttl_minutes=int(env.get("ACCESS_TOKEN_TTL_MINUTES", "15")),
        refresh_token_ttl_days=int(env.get("REFRESH_TOKEN_TTL_DAYS", "30")),
        cookie_secure=_bool(env.get("COOKIE_SECURE", ""), app_env == AppEnvironment.PRODUCTION),
        cookie_samesite=env.get("COOKIE_SAMESITE", CookieSameSite.LAX.value).lower(),
        log_level=env.get("LOG_LEVEL", "INFO").upper(),
        cdse_client_id=env.get("CDSE_CLIENT_ID", ""),
        cdse_client_secret=env.get("CDSE_CLIENT_SECRET", ""),
        cdse_token_url=env.get("CDSE_TOKEN_URL", ""),
        cdse_catalog_url=env.get(
            "CDSE_CATALOG_URL", "https://sh.dataspace.copernicus.eu/catalog/v1"
        ),
        cdse_process_url=env.get(
            "CDSE_PROCESS_URL", "https://sh.dataspace.copernicus.eu/process/v1"
        ),
        cdse_statistical_url=env.get(
            "CDSE_STATISTICAL_URL", "https://sh.dataspace.copernicus.eu/statistics/v1"
        ),
        object_storage_secret_key=env.get("OBJECT_STORAGE_SECRET_KEY", ""),
    )


def validate_settings(settings: SettingsSnapshot) -> list[SettingsValidationIssue]:
    issues: list[SettingsValidationIssue] = []
    if settings.app_env not in {item.value for item in AppEnvironment}:
        issues.append(SettingsValidationIssue("APP_ENV", "unsupported environment"))
    if not settings.api_v1_prefix.startswith("/"):
        issues.append(SettingsValidationIssue("API_V1_PREFIX", "must start with /"))
    if settings.cookie_samesite not in {item.value for item in CookieSameSite}:
        issues.append(SettingsValidationIssue("COOKIE_SAMESITE", "unsupported SameSite policy"))
    if settings.cookie_samesite == CookieSameSite.NONE and not settings.cookie_secure:
        issues.append(SettingsValidationIssue("COOKIE_SECURE", "SameSite=None requires Secure cookies"))
    if settings.access_token_ttl_minutes <= 0:
        issues.append(SettingsValidationIssue("ACCESS_TOKEN_TTL_MINUTES", "must be positive"))
    if settings.refresh_token_ttl_days <= 0:
        issues.append(SettingsValidationIssue("REFRESH_TOKEN_TTL_DAYS", "must be positive"))

    for field_name in ("session_secret", "encryption_key"):
        value = getattr(settings, field_name)
        if len(value) < 32:
            issues.append(SettingsValidationIssue(field_name.upper(), "must be at least 32 characters"))
        if settings.app_env == AppEnvironment.PRODUCTION and value in KNOWN_DEVELOPMENT_SECRETS:
            issues.append(SettingsValidationIssue(field_name.upper(), "known development secret is forbidden"))

    if settings.app_env == AppEnvironment.PRODUCTION:
        required = {
            "DATABASE_URL": settings.database_url,
            "REDIS_URL": settings.redis_url,
            "SESSION_SECRET": settings.session_secret,
            "ENCRYPTION_KEY": settings.encryption_key,
            "OBJECT_STORAGE_ENDPOINT": settings.object_storage_endpoint,
            "OBJECT_STORAGE_BUCKET": settings.object_storage_bucket,
        }
        for name, value in required.items():
            if not value:
                issues.append(SettingsValidationIssue(name, "required in production"))
        if not settings.cookie_secure:
            issues.append(SettingsValidationIssue("COOKIE_SECURE", "must be true in production"))
    return issues


def load_settings() -> SettingsSnapshot:
    settings = settings_from_env()
    issues = validate_settings(settings)
    if issues:
        formatted = ", ".join(f"{issue.field}: {issue.message}" for issue in issues)
        raise RuntimeError(f"Invalid settings: {formatted}")
    return settings
