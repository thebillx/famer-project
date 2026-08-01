"""Organization API contracts."""

from __future__ import annotations

try:
    from fastapi import APIRouter, Depends, Request, status
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Depends = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]
    status = None  # type: ignore[assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class OrganizationCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    status: str


class MemberResponse(BaseModel):
    id: str
    user_id: str
    role: str
    status: str


router = APIRouter(prefix="/organizations", tags=["organizations"]) if APIRouter else None


if router:
    from uuid import UUID
    from apps.api.agriscope_api.core.security import Role
    from apps.api.agriscope_api.dependencies.auth import (
        get_active_membership,
        get_current_user,
        require_minimum_role,
    )
    from apps.api.agriscope_api.dependencies.runtime import get_db_session
    from apps.api.agriscope_api.services.organizations import OrganizationService

    def _organization_response(organization) -> OrganizationResponse:
        return OrganizationResponse(
            id=str(organization.id),
            name=organization.name,
            slug=organization.slug,
            status=organization.status,
        )

    @router.post("", status_code=status.HTTP_201_CREATED, response_model=OrganizationResponse)
    async def create_organization(
        payload: OrganizationCreateRequest,
        request: Request,
        session=Depends(get_db_session),
    ) -> OrganizationResponse:
        user = await get_current_user(request, session)
        organization = await OrganizationService(session).create_organization(
            user_id=user.id, name=payload.name
        )
        return _organization_response(organization)

    @router.get("", response_model=list[OrganizationResponse])
    async def list_organizations(
        request: Request,
        session=Depends(get_db_session),
    ) -> list[OrganizationResponse]:
        user = await get_current_user(request, session)
        organizations = await OrganizationService(session).list_organizations(user_id=user.id)
        return [_organization_response(organization) for organization in organizations]

    @router.get("/{organization_id}", response_model=OrganizationResponse)
    async def get_organization(
        organization_id: UUID,
        request: Request,
        session=Depends(get_db_session),
    ) -> OrganizationResponse:
        user = await get_current_user(request, session)
        organization = await OrganizationService(session).get_organization(
            user_id=user.id, organization_id=organization_id
        )
        return _organization_response(organization)

    @router.get("/{organization_id}/members", response_model=list[MemberResponse])
    async def list_members(
        organization_id: UUID,
        request: Request,
        session=Depends(get_db_session),
    ) -> list[MemberResponse]:
        user = await get_current_user(request, session)
        membership = await get_active_membership(session, user, organization_id)
        require_minimum_role(membership, Role.VIEWER)
        members = await OrganizationService(session).list_members(
            user_id=user.id, organization_id=organization_id
        )
        return [
            MemberResponse(
                id=str(member.id),
                user_id=str(member.user_id),
                role=member.role,
                status=member.status,
            )
            for member in members
        ]
