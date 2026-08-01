"""Authentication repository contract."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from apps.api.agriscope_api.core.security import hash_token


class AuthRepository:
    def __init__(self, session) -> None:
        self.session = session

    async def get_user_by_email(self, email: str):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import User

        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: UUID):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import User

        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def create_user(self, *, email: str, password_hash: str, display_name: str):
        from apps.api.agriscope_api.db.models import User

        user = User(email=email, password_hash=password_hash, display_name=display_name, status="active")
        self.session.add(user)
        await self.session.flush()
        return user

    async def create_refresh_session(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        raw_refresh_token: str,
        expires_at: datetime,
        rotated_from: UUID | None = None,
    ):
        from apps.api.agriscope_api.db.models import RefreshSession

        session = RefreshSession(
            id=session_id,
            user_id=user_id,
            token_hash=hash_token(raw_refresh_token),
            expires_at=expires_at,
            status="active",
            rotated_from=rotated_from,
        )
        self.session.add(session)
        await self.session.flush()
        return session

    async def get_refresh_session(self, session_id: UUID):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import RefreshSession

        result = await self.session.execute(
            select(RefreshSession).where(RefreshSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def validate_refresh_session(self, session_id: UUID, raw_refresh_token: str):
        session = await self.get_refresh_session(session_id)
        if session is None:
            return None
        if session.status != "active":
            return None
        if session.expires_at <= datetime.now(UTC):
            return None
        import hmac

        if not hmac.compare_digest(session.token_hash, hash_token(raw_refresh_token)):
            return None
        return session

    async def revoke_refresh_session(self, session_id: UUID) -> None:
        session = await self.get_refresh_session(session_id)
        if session is not None:
            session.status = "revoked"
            await self.session.flush()

    async def rotate_refresh_session(
        self,
        *,
        old_session_id: UUID,
        new_session_id: UUID,
        user_id: UUID,
        raw_new_refresh_token: str,
        expires_at: datetime,
    ):
        from apps.api.agriscope_api.db.models import RefreshSession

        old_session = await self.get_refresh_session(old_session_id)
        if old_session is None or old_session.status != "active":
            raise ValueError("invalid refresh session")
        old_session.status = "revoked"
        session = RefreshSession(
            id=new_session_id,
            user_id=user_id,
            token_hash=hash_token(raw_new_refresh_token),
            expires_at=expires_at,
            status="active",
            rotated_from=old_session_id,
        )
        self.session.add(session)
        await self.session.flush()
        return session
