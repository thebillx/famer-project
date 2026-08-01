"""Organization service layer."""

from __future__ import annotations

from uuid import UUID, uuid4

from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.core.security import Role
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.organizations import OrganizationRepository
from apps.api.agriscope_api.services.auth import derive_slug


class OrganizationService:
    def __init__(self, session) -> None:
        self.session = session

    async def create_organization(self, *, user_id: UUID, name: str):
        scope = TenantScope(organization_id=uuid4(), user_id=user_id, role=Role.ORGANIZATION_OWNER.value)
        repo = OrganizationRepository(self.session, scope)
        slug = derive_slug(name, suffix=uuid4().hex[:8])
        return await repo.create_for_user(
            name=name,
            slug=slug,
            user_id=user_id,
            role=Role.ORGANIZATION_OWNER.value,
        )

    async def list_organizations(self, *, user_id: UUID):
        scope = TenantScope(organization_id=uuid4(), user_id=user_id, role=Role.VIEWER.value)
        return await OrganizationRepository(self.session, scope).list_for_current_user()

    async def get_organization(self, *, user_id: UUID, organization_id: UUID):
        scope = TenantScope(organization_id=organization_id, user_id=user_id, role=Role.VIEWER.value)
        organization = await OrganizationRepository(self.session, scope).get_scoped(organization_id)
        if organization is None:
            raise ApiException("not_found", "Resource not found", 404)
        return organization

    async def list_members(self, *, user_id: UUID, organization_id: UUID):
        scope = TenantScope(organization_id=organization_id, user_id=user_id, role=Role.VIEWER.value)
        members = await OrganizationRepository(self.session, scope).list_members_scoped(organization_id)
        if members is None:
            raise ApiException("not_found", "Resource not found", 404)
        return members
