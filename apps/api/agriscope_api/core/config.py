"""Typed runtime settings and dependency-light validation helpers."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import ipaddress
import os
from typing import Any
from urllib.parse import urlparse


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
    "cdse_client_id",
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
    rate_limit_window_seconds: int = 900
    rate_limit_max_entries: int = 10000
    rate_limit_csrf_ip: int = 60
    rate_limit_register_ip: int = 25
    rate_limit_register_email: int = 5
    rate_limit_login_ip: int = 50
    rate_limit_login_email: int = 10
    rate_limit_session_ip: int = 60
    rate_limit_session_subject: int = 30
    rate_limit_session_token: int = 10
    rate_limit_mutation_ip: int = 300
    rate_limit_mutation_subject: int = 60
    rate_limit_satellite_subject: int = 20
    rate_limit_satellite_field: int = 10
    trusted_proxy_cidrs: tuple[str, ...] = ()
    cdse_client_id: str = ""
    cdse_client_secret: str = ""
    cdse_token_url: str = (
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    )
    cdse_catalog_url: str = "https://sh.dataspace.copernicus.eu/catalog/v1"
    cdse_process_url: str = "https://sh.dataspace.copernicus.eu/process/v1"
    cdse_statistical_url: str = "https://sh.dataspace.copernicus.eu/statistics/v1"
    cdse_stac_url: str = "https://stac.dataspace.copernicus.eu/v1/search"
    satellite_search_lookback_days: int = 90
    satellite_search_timeout_seconds: int = 15
    satellite_max_cloud_cover_percent: float = 80.0
    satellite_preview_min_valid_ratio: float = 0.4
    satellite_analysis_min_valid_ratio: float = 0.4
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
            "postgresql+psycopg://agriscope:agriscope_dev_password@localhost:5432/agriscope",
        ),
        redis_url=env.get("REDIS_URL", "redis://localhost:6379/0"),
        object_storage_endpoint=env.get("OBJECT_STORAGE_ENDPOINT", "http://localhost:9000"),
        object_storage_bucket=env.get("OBJECT_STORAGE_BUCKET", "agriscope-dev"),
        session_secret=env.get("SESSION_SECRET", "change-me-development-session-secret-32"),
        encryption_key=env.get("ENCRYPTION_KEY", "change-me-development-encryption-key-32"),
        access_token_ttl_minutes=int(env.get("ACCESS_TOKEN_TTL_MINUTES", "15")),
        refresh_token_ttl_days=int(env.get("REFRESH_TOKEN_TTL_DAYS", "30")),
        cookie_secure=_bool(env.get("COOKIE_SECURE", ""), app_env == AppEnvironment.PRODUCTION),
        cookie_samesite=env.get("COOKIE_SAMESITE", CookieSameSite.LAX.value).lower(),
        log_level=env.get("LOG_LEVEL", "INFO").upper(),
        rate_limit_window_seconds=int(env.get("RATE_LIMIT_WINDOW_SECONDS", "900")),
        rate_limit_max_entries=int(env.get("RATE_LIMIT_MAX_ENTRIES", "10000")),
        rate_limit_csrf_ip=int(env.get("RATE_LIMIT_CSRF_IP", "60")),
        rate_limit_register_ip=int(env.get("RATE_LIMIT_REGISTER_IP", "25")),
        rate_limit_register_email=int(env.get("RATE_LIMIT_REGISTER_EMAIL", "5")),
        rate_limit_login_ip=int(env.get("RATE_LIMIT_LOGIN_IP", "50")),
        rate_limit_login_email=int(env.get("RATE_LIMIT_LOGIN_EMAIL", "10")),
        rate_limit_session_ip=int(env.get("RATE_LIMIT_SESSION_IP", "60")),
        rate_limit_session_subject=int(env.get("RATE_LIMIT_SESSION_SUBJECT", "30")),
        rate_limit_session_token=int(env.get("RATE_LIMIT_SESSION_TOKEN", "10")),
        rate_limit_mutation_ip=int(env.get("RATE_LIMIT_MUTATION_IP", "300")),
        rate_limit_mutation_subject=int(env.get("RATE_LIMIT_MUTATION_SUBJECT", "60")),
        rate_limit_satellite_subject=int(env.get("RATE_LIMIT_SATELLITE_SUBJECT", "20")),
        rate_limit_satellite_field=int(env.get("RATE_LIMIT_SATELLITE_FIELD", "10")),
        trusted_proxy_cidrs=tuple(
            value.strip()
            for value in env.get("TRUSTED_PROXY_CIDRS", "").split(",")
            if value.strip()
        ),
        cdse_client_id=env.get("CDSE_CLIENT_ID", ""),
        cdse_client_secret=env.get("CDSE_CLIENT_SECRET", ""),
        cdse_token_url=env.get(
            "CDSE_TOKEN_URL",
            "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
        ),
        cdse_catalog_url=env.get(
            "CDSE_CATALOG_URL", "https://sh.dataspace.copernicus.eu/catalog/v1"
        ),
        cdse_process_url=env.get(
            "CDSE_PROCESS_URL", "https://sh.dataspace.copernicus.eu/process/v1"
        ),
        cdse_statistical_url=env.get(
            "CDSE_STATISTICAL_URL", "https://sh.dataspace.copernicus.eu/statistics/v1"
        ),
        cdse_stac_url=env.get("CDSE_STAC_URL", "https://stac.dataspace.copernicus.eu/v1/search"),
        satellite_search_lookback_days=int(env.get("SATELLITE_SEARCH_LOOKBACK_DAYS", "90")),
        satellite_search_timeout_seconds=int(env.get("SATELLITE_SEARCH_TIMEOUT_SECONDS", "15")),
        satellite_max_cloud_cover_percent=float(env.get("SATELLITE_MAX_CLOUD_COVER_PERCENT", "80")),
        satellite_preview_min_valid_ratio=float(
            env.get("SATELLITE_PREVIEW_MIN_VALID_RATIO", "0.40")
        ),
        satellite_analysis_min_valid_ratio=float(
            env.get("SATELLITE_ANALYSIS_MIN_VALID_RATIO", "0.40")
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
        issues.append(
            SettingsValidationIssue("COOKIE_SECURE", "SameSite=None requires Secure cookies")
        )
    if settings.access_token_ttl_minutes <= 0:
        issues.append(SettingsValidationIssue("ACCESS_TOKEN_TTL_MINUTES", "must be positive"))
    if settings.refresh_token_ttl_days <= 0:
        issues.append(SettingsValidationIssue("REFRESH_TOKEN_TTL_DAYS", "must be positive"))
    if not 60 <= settings.rate_limit_window_seconds <= 86400:
        issues.append(SettingsValidationIssue("RATE_LIMIT_WINDOW_SECONDS", "must be 60-86400"))
    if not 100 <= settings.rate_limit_max_entries <= 100000:
        issues.append(SettingsValidationIssue("RATE_LIMIT_MAX_ENTRIES", "must be 100-100000"))
    rate_limit_counters = (
        ("RATE_LIMIT_CSRF_IP", settings.rate_limit_csrf_ip),
        ("RATE_LIMIT_REGISTER_IP", settings.rate_limit_register_ip),
        ("RATE_LIMIT_REGISTER_EMAIL", settings.rate_limit_register_email),
        ("RATE_LIMIT_LOGIN_IP", settings.rate_limit_login_ip),
        ("RATE_LIMIT_LOGIN_EMAIL", settings.rate_limit_login_email),
        ("RATE_LIMIT_SESSION_IP", settings.rate_limit_session_ip),
        ("RATE_LIMIT_SESSION_SUBJECT", settings.rate_limit_session_subject),
        ("RATE_LIMIT_SESSION_TOKEN", settings.rate_limit_session_token),
        ("RATE_LIMIT_MUTATION_IP", settings.rate_limit_mutation_ip),
        ("RATE_LIMIT_MUTATION_SUBJECT", settings.rate_limit_mutation_subject),
        ("RATE_LIMIT_SATELLITE_SUBJECT", settings.rate_limit_satellite_subject),
        ("RATE_LIMIT_SATELLITE_FIELD", settings.rate_limit_satellite_field),
    )
    for name, value in rate_limit_counters:
        if not 1 <= value <= 10000:
            issues.append(SettingsValidationIssue(name, "must be 1-10000"))
    for network in settings.trusted_proxy_cidrs:
        try:
            ipaddress.ip_network(network)
        except ValueError:
            issues.append(
                SettingsValidationIssue("TRUSTED_PROXY_CIDRS", "must contain valid IP networks")
            )
    if settings.satellite_search_lookback_days <= 0:
        issues.append(SettingsValidationIssue("SATELLITE_SEARCH_LOOKBACK_DAYS", "must be positive"))
    if settings.satellite_search_timeout_seconds <= 0:
        issues.append(
            SettingsValidationIssue("SATELLITE_SEARCH_TIMEOUT_SECONDS", "must be positive")
        )
    if not 0 <= settings.satellite_max_cloud_cover_percent <= 100:
        issues.append(SettingsValidationIssue("SATELLITE_MAX_CLOUD_COVER_PERCENT", "must be 0-100"))
    if not 0 < settings.satellite_preview_min_valid_ratio <= 1:
        issues.append(
            SettingsValidationIssue("SATELLITE_PREVIEW_MIN_VALID_RATIO", "must be >0 and <=1")
        )
    if not 0 < settings.satellite_analysis_min_valid_ratio <= 1:
        issues.append(
            SettingsValidationIssue("SATELLITE_ANALYSIS_MIN_VALID_RATIO", "must be >0 and <=1")
        )

    for field_name in ("session_secret", "encryption_key"):
        value = getattr(settings, field_name)
        if len(value) < 32:
            issues.append(
                SettingsValidationIssue(field_name.upper(), "must be at least 32 characters")
            )
        if settings.app_env == AppEnvironment.PRODUCTION and value in KNOWN_DEVELOPMENT_SECRETS:
            issues.append(
                SettingsValidationIssue(field_name.upper(), "known development secret is forbidden")
            )

    if settings.app_env == AppEnvironment.PRODUCTION:
        required = {
            "DATABASE_URL": settings.database_url,
            "REDIS_URL": settings.redis_url,
            "SESSION_SECRET": settings.session_secret,
            "ENCRYPTION_KEY": settings.encryption_key,
            "OBJECT_STORAGE_ENDPOINT": settings.object_storage_endpoint,
            "OBJECT_STORAGE_BUCKET": settings.object_storage_bucket,
            "CDSE_CLIENT_ID": settings.cdse_client_id,
            "CDSE_CLIENT_SECRET": settings.cdse_client_secret,
            "CDSE_TOKEN_URL": settings.cdse_token_url,
            "CDSE_PROCESS_URL": settings.cdse_process_url,
            "CDSE_STATISTICAL_URL": settings.cdse_statistical_url,
        }
        for name, value in required.items():
            if not value:
                issues.append(SettingsValidationIssue(name, "required in production"))
        if not settings.cookie_secure:
            issues.append(SettingsValidationIssue("COOKIE_SECURE", "must be true in production"))
        for name, value in (
            ("CDSE_TOKEN_URL", settings.cdse_token_url),
            ("CDSE_PROCESS_URL", settings.cdse_process_url),
            ("CDSE_STATISTICAL_URL", settings.cdse_statistical_url),
        ):
            if value and urlparse(value).scheme != "https":
                issues.append(SettingsValidationIssue(name, "must use https in production"))
    return issues


def load_settings() -> SettingsSnapshot:
    settings = settings_from_env()
    issues = validate_settings(settings)
    if issues:
        formatted = ", ".join(f"{issue.field}: {issue.message}" for issue in issues)
        raise RuntimeError(f"Invalid settings: {formatted}")
    return settings
