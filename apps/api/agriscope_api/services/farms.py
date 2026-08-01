"""Farm and field service layer."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.core.security import Role
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.farms import FarmRepository
from packages.geospatial.agriscope_geospatial.field_geometry import validate_field_polygon


class FarmService:
    def __init__(self, session) -> None:
        self.session = session

    def _repo(self, *, user_id: UUID, organization_id: UUID | None = None) -> FarmRepository:
        return FarmRepository(
            self.session,
            TenantScope(
                organization_id=organization_id or uuid4(),
                user_id=user_id,
                role=Role.VIEWER.value,
            ),
        )

    async def create_farm(
        self, *, user_id: UUID, organization_id: UUID, name: str, province: str | None
    ):
        return await self._repo(user_id=user_id, organization_id=organization_id).create_farm(
            name=name, province=province
        )

    async def list_farms(self, *, user_id: UUID, organization_id: UUID | None):
        return await self._repo(user_id=user_id, organization_id=organization_id).list_farms(
            organization_id=organization_id
        )

    async def get_farm(self, *, user_id: UUID, farm_id: UUID):
        farm = await self._repo(user_id=user_id).get_farm(farm_id)
        if farm is None:
            raise ApiException("not_found", "Resource not found", 404)
        return farm

    async def update_farm(
        self,
        *,
        user_id: UUID,
        farm_id: UUID,
        name: str | None,
        province: str | None,
        update_province: bool,
    ):
        if name is None and not update_province:
            raise ApiException("validation_error", "At least one field is required", 422)
        farm = await self._repo(user_id=user_id).update_farm(
            farm_id=farm_id,
            name=name,
            province=province,
            update_province=update_province,
        )
        if farm is None:
            raise ApiException("not_found", "Resource not found", 404)
        return farm

    async def delete_farm(self, *, user_id: UUID, farm_id: UUID) -> None:
        deleted = await self._repo(user_id=user_id).delete_farm(farm_id)
        if not deleted:
            raise ApiException("not_found", "Resource not found", 404)

    async def create_field(
        self, *, user_id: UUID, farm_id: UUID, name: str, geometry: dict[str, Any]
    ):
        try:
            validated = validate_field_polygon(geometry)
        except ValueError as exc:
            raise ApiException("invalid_geometry", str(exc), 422) from exc
        field = await self._repo(user_id=user_id).create_field(
            farm_id=farm_id, name=name, geometry=validated.geometry
        )
        if field is None:
            raise ApiException("not_found", "Resource not found", 404)
        return field

    async def list_fields(self, *, user_id: UUID, farm_id: UUID):
        fields = await self._repo(user_id=user_id).list_fields(farm_id)
        if fields is None:
            raise ApiException("not_found", "Resource not found", 404)
        return fields

    async def get_field(self, *, user_id: UUID, field_id: UUID):
        field = await self._repo(user_id=user_id).get_field(field_id)
        if field is None:
            raise ApiException("not_found", "Resource not found", 404)
        return field

    async def update_field(
        self,
        *,
        user_id: UUID,
        field_id: UUID,
        name: str | None,
        geometry: dict[str, Any] | None,
    ):
        if name is None and geometry is None:
            raise ApiException("validation_error", "At least one field is required", 422)
        validated_geometry = None
        if geometry is not None:
            try:
                validated_geometry = validate_field_polygon(geometry).geometry
            except ValueError as exc:
                raise ApiException("invalid_geometry", str(exc), 422) from exc
        field = await self._repo(user_id=user_id).update_field(
            field_id=field_id, name=name, geometry=validated_geometry
        )
        if field is None:
            raise ApiException("not_found", "Resource not found", 404)
        return field

    async def delete_field(self, *, user_id: UUID, field_id: UUID) -> None:
        deleted = await self._repo(user_id=user_id).delete_field(field_id)
        if not deleted:
            raise ApiException("not_found", "Resource not found", 404)
