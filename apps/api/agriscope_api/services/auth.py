"""Authentication service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError

from apps.api.agriscope_api.core.config import SettingsSnapshot
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.core.security import (
    PasswordHasher,
    Role,
    TokenClaims,
    TokenType,
    create_token,
    normalize_email,
    parse_token,
)
from apps.api.agriscope_api.repositories.auth import AuthRepository


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

    async def register(self, session, *, email: str, password: str, display_name: str, organization_name: str):
        from apps.api.agriscope_api.db.models import Membership, Organization

        repo = AuthRepository(session)
        try:
            normalized = normalize_email(email)
            password_hash = self.password_hasher.hash(password)
        except ValueError as exc:
            raise ApiException("validation_error", str(exc), 422) from exc
        if await repo.get_user_by_email(normalized) is not None:
            raise ApiException("email_already_registered", "Email is already registered", 409)

        try:
            user = await repo.create_user(
                email=normalized, password_hash=password_hash, display_name=display_name
            )
            slug = derive_slug(organization_name, suffix=uuid4().hex[:8])
            organization = Organization(name=organization_name, slug=slug, status="active")
            session.add(organization)
            await session.flush()
            membership = Membership(
                organization_id=organization.id,
                user_id=user.id,
                role=Role.ORGANIZATION_OWNER.value,
                status="active",
                joined_at=datetime.now(UTC),
            )
            session.add(membership)
            await session.flush()
        except IntegrityError as exc:
            raise ApiException("registration_conflict", "Registration could not be completed", 409) from exc

        access_token = self.issue_access_token(str(user.id))
        refresh_session_id = uuid4()
        refresh_token = self.issue_refresh_token(str(user.id), str(refresh_session_id))
        refresh_expires_at = datetime.now(UTC) + timedelta(days=self.settings.refresh_token_ttl_days)
        await repo.create_refresh_session(
            session_id=refresh_session_id,
            user_id=user.id,
            raw_refresh_token=refresh_token,
            expires_at=refresh_expires_at,
        )
        return user, organization, access_token, refresh_token

    async def login(self, session, *, email: str, password: str):
        repo = AuthRepository(session)
        try:
            normalized = normalize_email(email)
        except ValueError as exc:
            raise ApiException("invalid_credentials", "Invalid email or password", 401) from exc
        user = await repo.get_user_by_email(normalized)
        if user is None or user.status != "active":
            raise ApiException("invalid_credentials", "Invalid email or password", 401)
        if not self.password_hasher.verify(user.password_hash, password):
            raise ApiException("invalid_credentials", "Invalid email or password", 401)
        user.last_login_at = datetime.now(UTC)
        access_token = self.issue_access_token(str(user.id))
        refresh_session_id = uuid4()
        refresh_token = self.issue_refresh_token(str(user.id), str(refresh_session_id))
        refresh_expires_at = datetime.now(UTC) + timedelta(days=self.settings.refresh_token_ttl_days)
        await repo.create_refresh_session(
            session_id=refresh_session_id,
            user_id=user.id,
            raw_refresh_token=refresh_token,
            expires_at=refresh_expires_at,
        )
        return user, access_token, refresh_token

    async def refresh(self, session, raw_refresh_token: str):
        try:
            claims = parse_token(raw_refresh_token, self.settings.session_secret, TokenType.REFRESH)
        except ValueError as exc:
            raise ApiException("invalid_refresh_token", "Refresh session is invalid", 401) from exc
        if claims.session_id is None:
            raise ApiException("invalid_refresh_token", "Refresh session is invalid", 401)

        repo = AuthRepository(session)
        old_session = await repo.validate_refresh_session(UUID(claims.session_id), raw_refresh_token)
        if old_session is None:
            raise ApiException("invalid_refresh_token", "Refresh session is invalid", 401)
        user = await repo.get_user_by_id(old_session.user_id)
        if user is None or user.status != "active":
            raise ApiException("invalid_refresh_token", "Refresh session is invalid", 401)

        new_session_id = uuid4()
        new_refresh_token = self.issue_refresh_token(str(user.id), str(new_session_id))
        refresh_expires_at = datetime.now(UTC) + timedelta(days=self.settings.refresh_token_ttl_days)
        await repo.rotate_refresh_session(
            old_session_id=old_session.id,
            new_session_id=new_session_id,
            user_id=user.id,
            raw_new_refresh_token=new_refresh_token,
            expires_at=refresh_expires_at,
        )
        access_token = self.issue_access_token(str(user.id))
        return user, access_token, new_refresh_token

    async def logout(self, session, raw_refresh_token: str | None) -> None:
        if not raw_refresh_token:
            return
        try:
            claims = parse_token(raw_refresh_token, self.settings.session_secret, TokenType.REFRESH)
        except ValueError:
            return
        if claims.session_id is None:
            return
        repo = AuthRepository(session)
        await repo.revoke_refresh_session(UUID(claims.session_id))
