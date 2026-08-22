"""Farm and field API routes."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

try:
    from fastapi import APIRouter, Depends, Request, Response, status
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Depends = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]
    Response = object  # type: ignore[assignment]
    status = None  # type: ignore[assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class FarmCreateRequest(BaseModel):
    organization_id: UUID
    name: str = Field(min_length=1, max_length=200)
    province: str | None = Field(default=None, max_length=120)


class FarmUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    province: str | None = Field(default=None, max_length=120)


class FarmResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    province: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class FieldCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    geometry: dict[str, Any]


class FieldUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    geometry: dict[str, Any] | None = None


class FieldResponse(BaseModel):
    id: str
    farm_id: str
    organization_id: str
    name: str
    geometry: dict[str, Any]
    area_sqm: Decimal
    area_rai: Decimal
    status: str
    created_at: datetime
    updated_at: datetime


router = APIRouter(tags=["farms"]) if APIRouter else None


if router:
    from apps.api.agriscope_api.core.csrf import validate_csrf
    from apps.api.agriscope_api.core.rate_limit import (
        RateLimitBucket,
        client_ip_bucket,
        enforce_rate_limit,
    )
    from apps.api.agriscope_api.core.security import Role
    from apps.api.agriscope_api.dependencies.auth import (
        get_active_membership,
        get_current_user,
        require_minimum_role,
    )
    from apps.api.agriscope_api.dependencies.runtime import get_db_session
    from apps.api.agriscope_api.services.farms import FarmService

    def _farm_response(farm) -> FarmResponse:
        return FarmResponse(
            id=str(farm.id),
            organization_id=str(farm.organization_id),
            name=farm.name,
            province=farm.province,
            status=farm.status,
            created_at=farm.created_at,
            updated_at=farm.updated_at,
        )

    def _field_response(field) -> FieldResponse:
        return FieldResponse(
            id=str(field.id),
            farm_id=str(field.farm_id),
            organization_id=str(field.organization_id),
            name=field.name,
            geometry=field.geometry,
            area_sqm=field.area_sqm,
            area_rai=field.area_rai,
            status=field.status,
            created_at=field.created_at,
            updated_at=field.updated_at,
        )

    def _enforce_mutation_limit(request: Request, user) -> None:
        settings = request.app.state.settings
        enforce_rate_limit(
            request,
            [
                client_ip_bucket(request, "mutation-ip", settings.rate_limit_mutation_ip),
                RateLimitBucket(
                    "mutation-subject",
                    str(user.id),
                    settings.rate_limit_mutation_subject,
                ),
            ],
        )

    @router.post("/farms", status_code=status.HTTP_201_CREATED, response_model=FarmResponse)
    async def create_farm(
        payload: FarmCreateRequest,
        request: Request,
        session=Depends(get_db_session),
    ) -> FarmResponse:
        user = await get_current_user(request, session)
        validate_csrf(request)
        organization_id = payload.organization_id
        membership = await get_active_membership(session, user, organization_id)
        require_minimum_role(membership, Role.FIELD_MANAGER)
        _enforce_mutation_limit(request, user)
        farm = await FarmService(session).create_farm(
            user_id=user.id,
            organization_id=organization_id,
            name=payload.name,
            province=payload.province,
        )
        return _farm_response(farm)

    @router.get("/farms", response_model=list[FarmResponse])
    async def list_farms(
        request: Request,
        organization_id: UUID | None = None,
        session=Depends(get_db_session),
    ) -> list[FarmResponse]:
        user = await get_current_user(request, session)
        if organization_id is not None:
            await get_active_membership(session, user, organization_id)
        farms = await FarmService(session).list_farms(user_id=user.id, organization_id=organization_id)
        return [_farm_response(farm) for farm in farms]

    @router.get("/farms/{farm_id}", response_model=FarmResponse)
    async def get_farm(
        farm_id: UUID,
        request: Request,
        session=Depends(get_db_session),
    ) -> FarmResponse:
        user = await get_current_user(request, session)
        farm = await FarmService(session).get_farm(user_id=user.id, farm_id=farm_id)
        return _farm_response(farm)

    @router.patch("/farms/{farm_id}", response_model=FarmResponse)
    async def update_farm(
        farm_id: UUID,
        payload: FarmUpdateRequest,
        request: Request,
        session=Depends(get_db_session),
    ) -> FarmResponse:
        user = await get_current_user(request, session)
        validate_csrf(request)
        existing = await FarmService(session).get_farm(user_id=user.id, farm_id=farm_id)
        membership = await get_active_membership(session, user, existing.organization_id)
        require_minimum_role(membership, Role.FIELD_MANAGER)
        _enforce_mutation_limit(request, user)
        farm = await FarmService(session).update_farm(
            user_id=user.id,
            farm_id=farm_id,
            name=payload.name,
            province=payload.province,
            update_province="province" in payload.model_fields_set,
        )
        return _farm_response(farm)

    @router.delete("/farms/{farm_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_farm(
        farm_id: UUID,
        request: Request,
        response: Response,
        session=Depends(get_db_session),
    ) -> Response:
        user = await get_current_user(request, session)
        validate_csrf(request)
        existing = await FarmService(session).get_farm(user_id=user.id, farm_id=farm_id)
        membership = await get_active_membership(session, user, existing.organization_id)
        require_minimum_role(membership, Role.FIELD_MANAGER)
        _enforce_mutation_limit(request, user)
        await FarmService(session).delete_farm(user_id=user.id, farm_id=farm_id)
        response.status_code = status.HTTP_204_NO_CONTENT
        return response

    @router.post(
        "/farms/{farm_id}/fields",
        status_code=status.HTTP_201_CREATED,
        response_model=FieldResponse,
    )
    async def create_field(
        farm_id: UUID,
        payload: FieldCreateRequest,
        request: Request,
        session=Depends(get_db_session),
    ) -> FieldResponse:
        user = await get_current_user(request, session)
        validate_csrf(request)
        farm = await FarmService(session).get_farm(user_id=user.id, farm_id=farm_id)
        membership = await get_active_membership(session, user, farm.organization_id)
        require_minimum_role(membership, Role.FIELD_MANAGER)
        _enforce_mutation_limit(request, user)
        field = await FarmService(session).create_field(
            user_id=user.id,
            farm_id=farm_id,
            name=payload.name,
            geometry=payload.geometry,
        )
        return _field_response(field)

    @router.get("/farms/{farm_id}/fields", response_model=list[FieldResponse])
    async def list_fields(
        farm_id: UUID,
        request: Request,
        session=Depends(get_db_session),
    ) -> list[FieldResponse]:
        user = await get_current_user(request, session)
        fields = await FarmService(session).list_fields(user_id=user.id, farm_id=farm_id)
        return [_field_response(field) for field in fields]

    @router.get("/fields/{field_id}", response_model=FieldResponse)
    async def get_field(
        field_id: UUID,
        request: Request,
        session=Depends(get_db_session),
    ) -> FieldResponse:
        user = await get_current_user(request, session)
        field = await FarmService(session).get_field(user_id=user.id, field_id=field_id)
        return _field_response(field)

    @router.patch("/fields/{field_id}", response_model=FieldResponse)
    async def update_field(
        field_id: UUID,
        payload: FieldUpdateRequest,
        request: Request,
        session=Depends(get_db_session),
    ) -> FieldResponse:
        user = await get_current_user(request, session)
        validate_csrf(request)
        existing = await FarmService(session).get_field(user_id=user.id, field_id=field_id)
        membership = await get_active_membership(session, user, existing.organization_id)
        require_minimum_role(membership, Role.FIELD_MANAGER)
        _enforce_mutation_limit(request, user)
        field = await FarmService(session).update_field(
            user_id=user.id,
            field_id=field_id,
            name=payload.name,
            geometry=payload.geometry,
        )
        return _field_response(field)

    @router.delete("/fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_field(
        field_id: UUID,
        request: Request,
        response: Response,
        session=Depends(get_db_session),
    ) -> Response:
        user = await get_current_user(request, session)
        validate_csrf(request)
        existing = await FarmService(session).get_field(user_id=user.id, field_id=field_id)
        membership = await get_active_membership(session, user, existing.organization_id)
        require_minimum_role(membership, Role.FIELD_MANAGER)
        _enforce_mutation_limit(request, user)
        await FarmService(session).delete_field(user_id=user.id, field_id=field_id)
        response.status_code = status.HTTP_204_NO_CONTENT
        return response
