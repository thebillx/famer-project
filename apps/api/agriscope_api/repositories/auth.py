"""Authentication repository contract."""

from __future__ import annotations

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

    async def create_refresh_session(self, user_id: UUID, raw_refresh_token: str, expires_at):
        from apps.api.agriscope_api.db.models import RefreshSession

        session = RefreshSession(
            user_id=user_id,
            token_hash=hash_token(raw_refresh_token),
            expires_at=expires_at,
            status="active",
        )
        self.session.add(session)
        return session
