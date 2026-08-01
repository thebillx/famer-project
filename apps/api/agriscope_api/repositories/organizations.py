"""Organization repository with tenant-safe query patterns."""

from __future__ import annotations

from uuid import UUID

from apps.api.agriscope_api.repositories.base import TenantScopedRepository


class OrganizationRepository(TenantScopedRepository):
    async def list_for_current_user(self):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import Membership, Organization

        result = await self.session.execute(
            select(Organization)
            .join(Membership, Membership.organization_id == Organization.id)
            .where(Membership.user_id == self.scope.user_id)
            .where(Membership.status == "active")
            .where(Organization.status == "active")
        )
        return result.scalars().all()

    async def get_scoped(self, organization_id: UUID):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import Membership, Organization

        result = await self.session.execute(
            select(Organization)
            .join(Membership, Membership.organization_id == Organization.id)
            .where(Organization.id == organization_id)
            .where(Membership.user_id == self.scope.user_id)
            .where(Membership.status == "active")
            .where(Organization.status == "active")
        )
        return result.scalar_one_or_none()
