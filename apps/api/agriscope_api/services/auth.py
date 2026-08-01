"""Authentication service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from apps.api.agriscope_api.core.config import SettingsSnapshot
from apps.api.agriscope_api.core.security import (
    PasswordHasher,
    Role,
    TokenClaims,
    TokenType,
    create_token,
    new_refresh_token,
    normalize_email,
)


def derive_slug(name: str, suffix: str | None = None) -> str:
    base = "".join(ch.lower() if ch.isalnum() else "-" for ch in name).strip("-")
    base = "-".join(part for part in base.split("-") if part) or "organization"
    return f"{base}-{suffix}" if suffix else base


class AuthService:
    def __init__(self, settings: SettingsSnapshot, password_hasher: PasswordHasher | None = None) -> None:
        self.settings = settings
        self.password_hasher = password_hasher or PasswordHasher()

    def issue_access_token(self, user_id: str) -> str:
        return create_token(
            TokenClaims(
                subject=user_id,
                token_type=TokenType.ACCESS,
                expires_at=datetime.now(UTC) + timedelta(minutes=self.settings.access_token_ttl_minutes),
            ),
            self.settings.session_secret,
        )

    def issue_refresh_token(self, user_id: str, session_id: str) -> str:
        return create_token(
            TokenClaims(
                subject=user_id,
                token_type=TokenType.REFRESH,
                expires_at=datetime.now(UTC) + timedelta(days=self.settings.refresh_token_ttl_days),
                session_id=session_id,
            ),
            self.settings.session_secret,
        )

    def prepare_registration(self, email: str, password: str, organization_name: str) -> dict[str, str]:
        normalized = normalize_email(email)
        password_hash = self.password_hasher.hash(password)
        slug = derive_slug(organization_name, suffix=uuid4().hex[:8])
        return {
            "email": normalized,
            "password_hash": password_hash,
            "organization_slug": slug,
            "owner_role": Role.ORGANIZATION_OWNER.value,
        }
