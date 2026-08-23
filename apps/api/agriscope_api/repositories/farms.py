"""Tenant-scoped farm and field repository."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import json
from typing import Any
from uuid import UUID

from sqlalchemy import text

from apps.api.agriscope_api.repositories.base import TenantScopedRepository


@dataclass(frozen=True)
class FarmRecord:
    id: UUID
    organization_id: UUID
    name: str
    province: str | None
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class FieldRecord:
    id: UUID
    farm_id: UUID
    organization_id: UUID
    name: str
    geometry: dict[str, Any]
    area_sqm: Decimal
    area_rai: Decimal
    status: str
    created_at: datetime
    updated_at: datetime


def _farm(row: Any) -> FarmRecord:
    return FarmRecord(
        id=row["id"],
        organization_id=row["organization_id"],
        name=row["name"],
        province=row["province"],
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _field(row: Any) -> FieldRecord:
    geometry = row["geometry"]
    if isinstance(geometry, str):
        geometry = json.loads(geometry)
    return FieldRecord(
        id=row["id"],
        farm_id=row["farm_id"],
        organization_id=row["organization_id"],
        name=row["name"],
        geometry=geometry,
        area_sqm=row["area_sqm"],
        area_rai=row["area_rai"],
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class FarmRepository(TenantScopedRepository):
    async def create_farm(self, *, name: str, province: str | None) -> FarmRecord:
        result = await self.session.execute(
            text(
                """
                INSERT INTO farms (organization_id, owner_user_id, name, province, status)
                VALUES (:organization_id, :user_id, :name, :province, 'active')
                RETURNING id, organization_id, name, province, status, created_at, updated_at
                """
            ),
            {
                "organization_id": self.scope.organization_id,
                "user_id": self.scope.user_id,
                "name": name,
                "province": province,
            },
        )
        return _farm(result.mappings().one())

    async def list_farms(self, *, organization_id: UUID | None) -> list[FarmRecord]:
        organization_filter = ""
        params: dict[str, Any] = {"user_id": self.scope.user_id}
        if organization_id is not None:
            organization_filter = "AND f.organization_id = :organization_id"
            params["organization_id"] = organization_id
        result = await self.session.execute(
            text(
                f"""
                SELECT f.id, f.organization_id, f.name, f.province, f.status, f.created_at, f.updated_at
                FROM farms f
                JOIN memberships m ON m.organization_id = f.organization_id
                WHERE m.user_id = :user_id
                  AND m.status = 'active'
                  AND f.status = 'active'
                  AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                  {organization_filter}
                ORDER BY f.created_at DESC
                """
            ),
            params,
        )
        return [_farm(row) for row in result.mappings().all()]

    async def get_farm(self, farm_id: UUID) -> FarmRecord | None:
        result = await self.session.execute(
            text(
                """
                SELECT f.id, f.organization_id, f.name, f.province, f.status, f.created_at, f.updated_at
                FROM farms f
                JOIN memberships m ON m.organization_id = f.organization_id
                WHERE f.id = :farm_id
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                  AND f.status = 'active'
                  AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                """
            ),
            {"farm_id": farm_id, "user_id": self.scope.user_id},
        )
        row = result.mappings().one_or_none()
        return _farm(row) if row else None

    async def update_farm(
        self, *, farm_id: UUID, name: str | None, province: str | None, update_province: bool
    ) -> FarmRecord | None:
        result = await self.session.execute(
            text(
                """
                UPDATE farms f
                SET name = COALESCE(:name, f.name),
                    province = CASE WHEN :update_province THEN :province ELSE f.province END,
                    updated_at = now()
                FROM memberships m
                WHERE f.id = :farm_id
                  AND m.organization_id = f.organization_id
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                  AND f.status = 'active'
                  AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                RETURNING f.id, f.organization_id, f.name, f.province, f.status, f.created_at, f.updated_at
                """
            ),
            {
                "farm_id": farm_id,
                "user_id": self.scope.user_id,
                "name": name,
                "province": province,
                "update_province": update_province,
            },
        )
        row = result.mappings().one_or_none()
        return _farm(row) if row else None

    async def delete_farm(self, farm_id: UUID) -> bool:
        result = await self.session.execute(
            text(
                """
                UPDATE farms f
                SET status = 'deleted', updated_at = now()
                FROM memberships m
                WHERE f.id = :farm_id
                  AND m.organization_id = f.organization_id
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                  AND f.status = 'active'
                  AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                """
            ),
            {"farm_id": farm_id, "user_id": self.scope.user_id},
        )
        return result.rowcount == 1

    async def create_field(
        self, *, farm_id: UUID, name: str, geometry: dict[str, Any]
    ) -> FieldRecord | None:
        geometry_json = json.dumps(geometry, separators=(",", ":"))
        result = await self.session.execute(
            text(
                """
                WITH scoped_farm AS (
                    SELECT f.id, f.organization_id
                    FROM farms f
                    JOIN memberships m ON m.organization_id = f.organization_id
                    WHERE f.id = :farm_id
                      AND m.user_id = :user_id
                      AND m.status = 'active'
                      AND f.status = 'active'
                      AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                ),
                prepared AS (
                    SELECT
                      ST_SetSRID(ST_GeomFromGeoJSON(:geometry_json), 4326)::geometry(Polygon, 4326) AS geom,
                      id AS farm_id,
                      organization_id
                    FROM scoped_farm
                )
                INSERT INTO fields (farm_id, organization_id, name, geometry, area_sqm, area_rai, status)
                SELECT
                  farm_id,
                  organization_id,
                  :name,
                  geom,
                  ROUND(ST_Area(geom::geography)::numeric, 2),
                  ROUND((ST_Area(geom::geography) / 1600.0)::numeric, 4),
                  'active'
                FROM prepared
                RETURNING id, farm_id, organization_id, name, ST_AsGeoJSON(geometry)::json AS geometry,
                          area_sqm, area_rai, status, created_at, updated_at
                """
            ),
            {
                "farm_id": farm_id,
                "user_id": self.scope.user_id,
                "name": name,
                "geometry_json": geometry_json,
            },
        )
        row = result.mappings().one_or_none()
        return _field(row) if row else None

    async def list_fields(self, farm_id: UUID) -> list[FieldRecord] | None:
        farm = await self.get_farm(farm_id)
        if farm is None:
            return None
        result = await self.session.execute(
            text(
                """
                SELECT id, farm_id, organization_id, name, ST_AsGeoJSON(geometry)::json AS geometry,
                       area_sqm, area_rai, status, created_at, updated_at
                FROM fields
                WHERE farm_id = :farm_id
                  AND organization_id = :organization_id
                  AND status = 'active'
                ORDER BY created_at DESC
                """
            ),
            {"farm_id": farm_id, "organization_id": farm.organization_id},
        )
        return [_field(row) for row in result.mappings().all()]

    async def get_field(self, field_id: UUID) -> FieldRecord | None:
        result = await self.session.execute(
            text(
                """
                SELECT field.id, field.farm_id, field.organization_id, field.name,
                       ST_AsGeoJSON(field.geometry)::json AS geometry,
                       field.area_sqm, field.area_rai, field.status, field.created_at, field.updated_at
                FROM fields field
                JOIN farms f
                  ON f.id = field.farm_id
                 AND f.organization_id = field.organization_id
                JOIN memberships m ON m.organization_id = field.organization_id
                WHERE field.id = :field_id
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                  AND field.status = 'active'
                  AND f.status = 'active'
                  AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                """
            ),
            {"field_id": field_id, "user_id": self.scope.user_id},
        )
        row = result.mappings().one_or_none()
        return _field(row) if row else None

    async def update_field(
        self, *, field_id: UUID, name: str | None, geometry: dict[str, Any] | None
    ) -> FieldRecord | None:
        if geometry is None:
            result = await self.session.execute(
                text(
                    """
                    UPDATE fields field
                    SET name = COALESCE(:name, field.name),
                        updated_at = now()
                    FROM memberships m, farms f
                    WHERE field.id = :field_id
                      AND m.organization_id = field.organization_id
                      AND f.id = field.farm_id
                      AND f.organization_id = field.organization_id
                      AND m.user_id = :user_id
                      AND m.status = 'active'
                      AND field.status = 'active'
                      AND f.status = 'active'
                      AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                    RETURNING field.id, field.farm_id, field.organization_id, field.name,
                              ST_AsGeoJSON(field.geometry)::json AS geometry,
                              field.area_sqm, field.area_rai, field.status, field.created_at, field.updated_at
                    """
                ),
                {"field_id": field_id, "user_id": self.scope.user_id, "name": name},
            )
            row = result.mappings().one_or_none()
            return _field(row) if row else None

        geometry_json = json.dumps(geometry, separators=(",", ":"))
        result = await self.session.execute(
            text(
                """
                WITH scoped_field AS (
                    SELECT field.id
                    FROM fields field
                    JOIN farms f
                      ON f.id = field.farm_id
                     AND f.organization_id = field.organization_id
                    JOIN memberships m ON m.organization_id = field.organization_id
                    WHERE field.id = :field_id
                      AND m.user_id = :user_id
                      AND m.status = 'active'
                      AND field.status = 'active'
                      AND f.status = 'active'
                      AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                ),
                prepared AS (
                    SELECT
                      ST_SetSRID(ST_GeomFromGeoJSON(:geometry_json), 4326)::geometry(Polygon, 4326) AS geom
                )
                UPDATE fields field
                SET name = COALESCE(:name, field.name),
                    geometry = prepared.geom,
                    area_sqm = ROUND(ST_Area(prepared.geom::geography)::numeric, 2),
                    area_rai = ROUND((ST_Area(prepared.geom::geography) / 1600.0)::numeric, 4),
                    updated_at = now()
                FROM scoped_field, prepared
                WHERE field.id = scoped_field.id
                RETURNING field.id, field.farm_id, field.organization_id, field.name,
                          ST_AsGeoJSON(field.geometry)::json AS geometry,
                          field.area_sqm, field.area_rai, field.status, field.created_at, field.updated_at
                """
            ),
            {
                "field_id": field_id,
                "user_id": self.scope.user_id,
                "name": name,
                "geometry_json": geometry_json,
            },
        )
        row = result.mappings().one_or_none()
        return _field(row) if row else None

    async def delete_field(self, field_id: UUID) -> bool:
        result = await self.session.execute(
            text(
                """
                UPDATE fields field
                SET status = 'deleted', updated_at = now()
                FROM memberships m, farms f
                WHERE field.id = :field_id
                  AND m.organization_id = field.organization_id
                  AND f.id = field.farm_id
                  AND f.organization_id = field.organization_id
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                  AND field.status = 'active'
                  AND f.status = 'active'
                  AND (m.role = 'organization_owner' OR f.owner_user_id = :user_id)
                """
            ),
            {"field_id": field_id, "user_id": self.scope.user_id},
        )
        return result.rowcount == 1
