"""Organization API contracts."""

from __future__ import annotations

try:
    from fastapi import APIRouter, status
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
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

    @router.post("", status_code=status.HTTP_201_CREATED, response_model=OrganizationResponse)
    async def create_organization(payload: OrganizationCreateRequest) -> OrganizationResponse:
        raise NotImplementedError("Organization service persistence is implemented in this slice")

    @router.get("", response_model=list[OrganizationResponse])
    async def list_organizations() -> list[OrganizationResponse]:
        raise NotImplementedError("Tenant-scoped repository pattern is implemented in this slice")

    @router.get("/{organization_id}", response_model=OrganizationResponse)
    async def get_organization(organization_id: str) -> OrganizationResponse:
        raise NotImplementedError("Tenant-scoped repository pattern is implemented in this slice")

    @router.get("/{organization_id}/members", response_model=list[MemberResponse])
    async def list_members(organization_id: str) -> list[MemberResponse]:
        raise NotImplementedError("Read-only membership endpoint contract is implemented in this slice")
