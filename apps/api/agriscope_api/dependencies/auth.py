"""Authentication and tenant-scope dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from apps.api.agriscope_api.core.security import Role, require_role


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
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
