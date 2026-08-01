"""Tenant-scoped satellite acquisition repository."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text

from apps.api.agriscope_api.repositories.base import TenantScopedRepository


@dataclass(frozen=True)
class AcquisitionRecord:
    id: UUID
    field_id: UUID
    organization_id: UUID
    provider: str
    collection: str
    provider_item_id: str
    acquired_at: datetime
    cloud_cover_percent: Decimal | None
    search_status: str
    searched_at: datetime
    provider_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


def _acquisition(row: Any) -> AcquisitionRecord:
    return AcquisitionRecord(
        id=row["id"],
        field_id=row["field_id"],
        organization_id=row["organization_id"],
        provider=row["provider"],
        collection=row["collection"],
        provider_item_id=row["provider_item_id"],
        acquired_at=row["acquired_at"],
        cloud_cover_percent=row["cloud_cover_percent"],
        search_status=row["search_status"],
        searched_at=row["searched_at"],
        provider_metadata=row["provider_metadata"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


class SatelliteRepository(TenantScopedRepository):
    async def upsert_acquisition(
        self,
        *,
        field_id: UUID,
        provider: str,
        collection: str,
        provider_item_id: str,
        acquired_at: datetime,
        cloud_cover_percent: float | None,
        searched_at: datetime,
    ) -> AcquisitionRecord:
        result = await self.session.execute(
            text(
                """
                INSERT INTO field_acquisitions (
                  field_id,
                  organization_id,
                  provider,
                  collection,
                  provider_item_id,
                  acquired_at,
                  cloud_cover_percent,
                  search_status,
                  searched_at,
                  provider_metadata
                )
                VALUES (
                  :field_id,
                  :organization_id,
                  :provider,
                  :collection,
                  :provider_item_id,
                  :acquired_at,
                  :cloud_cover_percent,
                  'available',
                  :searched_at,
                  jsonb_build_object('provider_item_id', CAST(:metadata_provider_item_id AS text))
                )
                ON CONFLICT (field_id, provider, provider_item_id)
                DO UPDATE SET
                  cloud_cover_percent = EXCLUDED.cloud_cover_percent,
                  searched_at = EXCLUDED.searched_at,
                  search_status = 'available',
                  updated_at = now()
                RETURNING id, field_id, organization_id, provider, collection, provider_item_id,
                          acquired_at, cloud_cover_percent, search_status, searched_at,
                          provider_metadata, created_at, updated_at
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.scope.organization_id,
                "provider": provider,
                "collection": collection,
                "provider_item_id": provider_item_id,
                "metadata_provider_item_id": provider_item_id,
                "acquired_at": acquired_at,
                "cloud_cover_percent": cloud_cover_percent,
                "searched_at": searched_at,
            },
        )
        return _acquisition(result.mappings().one())

    async def get_latest_acquisition(self, field_id: UUID) -> AcquisitionRecord | None:
        result = await self.session.execute(
            text(
                """
                SELECT acquisition.id, acquisition.field_id, acquisition.organization_id,
                       acquisition.provider, acquisition.collection, acquisition.provider_item_id,
                       acquisition.acquired_at, acquisition.cloud_cover_percent,
                       acquisition.search_status, acquisition.searched_at,
                       acquisition.provider_metadata, acquisition.created_at, acquisition.updated_at
                FROM field_acquisitions acquisition
                JOIN fields field
                  ON field.id = acquisition.field_id
                 AND field.organization_id = acquisition.organization_id
                JOIN memberships m
                  ON m.organization_id = acquisition.organization_id
                WHERE acquisition.field_id = :field_id
                  AND acquisition.organization_id = :organization_id
                  AND field.status = 'active'
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                ORDER BY acquisition.acquired_at DESC, acquisition.searched_at DESC
                LIMIT 1
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.scope.organization_id,
                "user_id": self.scope.user_id,
            },
        )
        row = result.mappings().one_or_none()
        return _acquisition(row) if row else None
