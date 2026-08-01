"""Organization repository with tenant-safe query patterns."""

from __future__ import annotations

from uuid import UUID

from apps.api.agriscope_api.repositories.base import TenantScopedRepository


class OrganizationRepository(TenantScopedRepository):
    async def create_for_user(self, *, name: str, slug: str, user_id: UUID, role: str):
        from datetime import UTC, datetime
        from apps.api.agriscope_api.db.models import Membership, Organization

        organization = Organization(name=name, slug=slug, status="active")
        self.session.add(organization)
        await self.session.flush()
        membership = Membership(
            organization_id=organization.id,
            user_id=user_id,
            role=role,
            status="active",
            joined_at=datetime.now(UTC),
        )
        self.session.add(membership)
        await self.session.flush()
        return organization

    async def slug_exists(self, slug: str) -> bool:
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import Organization

        result = await self.session.execute(select(Organization.id).where(Organization.slug == slug))
        return result.scalar_one_or_none() is not None

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

    async def get_active_membership(self, organization_id: UUID):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import Membership

        result = await self.session.execute(
            select(Membership)
            .where(Membership.organization_id == organization_id)
            .where(Membership.user_id == self.scope.user_id)
            .where(Membership.status == "active")
        )
        return result.scalar_one_or_none()

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

    async def list_members_scoped(self, organization_id: UUID):
        from sqlalchemy import select
        from apps.api.agriscope_api.db.models import Membership

        membership = await self.get_active_membership(organization_id)
        if membership is None:
            return None
        result = await self.session.execute(
            select(Membership)
            .where(Membership.organization_id == organization_id)
            .where(Membership.status == "active")
        )
        return result.scalars().all()
