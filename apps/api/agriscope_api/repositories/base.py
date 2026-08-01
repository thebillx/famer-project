"""Tenant-safe repository base patterns."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class TenantScope:
    organization_id: UUID
    user_id: UUID
    role: str


class TenantScopedRepository:
    """Base marker for repositories that must scope by organization before lookup."""

    def __init__(self, session, scope: TenantScope) -> None:
        self.session = session
        self.scope = scope

    def require_scope(self) -> UUID:
        if not self.scope.organization_id:
            raise PermissionError("organization scope required")
        return self.scope.organization_id
