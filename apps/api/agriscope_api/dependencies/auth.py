"""Authentication and tenant-scope dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.core.security import Role, TokenType, parse_token, require_role
from apps.api.agriscope_api.repositories.auth import AuthRepository


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
    display_name: str
    status: str = "active"


@dataclass(frozen=True)
class CurrentMembership:
    organization_id: UUID
    user_id: UUID
    role: Role
    status: str = "active"

    def assert_active(self) -> None:
        if self.status != "active":
            raise PermissionError("inactive membership")

    def require(self, role: Role) -> None:
        self.assert_active()
        require_role(self.role, role)


ACCESS_COOKIE_NAME = "agriscope_access"
REFRESH_COOKIE_NAME = "agriscope_refresh"


async def get_current_user(request, session) -> CurrentUser:
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    authorization = request.headers.get("authorization", "")
    if not token and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    if not token:
        raise ApiException("authentication_required", "Authentication required", 401)
    try:
        claims = parse_token(token, request.app.state.settings.session_secret, TokenType.ACCESS)
    except ValueError as exc:
        raise ApiException("authentication_required", "Authentication required", 401) from exc
    try:
        user_id = UUID(claims.subject)
    except ValueError as exc:
        raise ApiException("authentication_required", "Authentication required", 401) from exc
    user = await AuthRepository(session).get_user_by_id(user_id)
    if user is None or user.status != "active":
        raise ApiException("authentication_required", "Authentication required", 401)
    return CurrentUser(id=user.id, email=user.email, display_name=user.display_name, status=user.status)


async def get_active_membership(session, user: CurrentUser, organization_id: UUID) -> CurrentMembership:
    from sqlalchemy import select
    from apps.api.agriscope_api.db.models import Membership

    result = await session.execute(
        select(Membership)
        .where(Membership.organization_id == organization_id)
        .where(Membership.user_id == user.id)
        .where(Membership.status == "active")
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise ApiException("not_found", "Resource not found", 404)
    return CurrentMembership(
        organization_id=membership.organization_id,
        user_id=membership.user_id,
        role=Role(membership.role),
        status=membership.status,
    )


def require_minimum_role(membership: CurrentMembership, role: Role) -> None:
    try:
        membership.require(role)
    except PermissionError as exc:
        raise ApiException("forbidden", "Insufficient permission", 403) from exc
