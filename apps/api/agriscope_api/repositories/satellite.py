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


@dataclass(frozen=True)
class ObservationAnalysisRecord:
    observation_id: UUID
    field_id: UUID
    organization_id: UUID
    acquired_at: datetime
    algorithm_version: str
    ndvi_mean: Decimal
    ndvi_min: Decimal
    ndvi_max: Decimal
    ndvi_stddev: Decimal
    sample_count: int
    valid_sample_count: int
    valid_pixel_ratio: Decimal
    raster_tiff: bytes
    raster_crs: str
    raster_bounds: list[float]
    raster_width: int
    raster_height: int


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


def _analysis(row: Any) -> ObservationAnalysisRecord:
    return ObservationAnalysisRecord(**{key: row[key] for key in ObservationAnalysisRecord.__dataclass_fields__})


class SatelliteRepository(TenantScopedRepository):
    async def list_observations(self, field_id: UUID) -> list[AcquisitionRecord]:
        result = await self.session.execute(text("""
            SELECT a.id, a.field_id, a.organization_id, a.provider, a.collection,
                   a.provider_item_id, a.acquired_at, a.cloud_cover_percent,
                   a.search_status, a.searched_at, a.provider_metadata,
                   a.created_at, a.updated_at
            FROM field_acquisitions a
            JOIN fields f ON f.id=a.field_id AND f.organization_id=a.organization_id
            JOIN farms farm ON farm.id=f.farm_id AND farm.organization_id=f.organization_id
            JOIN memberships m ON m.organization_id=f.organization_id
             AND m.user_id=:user_id AND m.status='active'
            WHERE a.field_id=:field_id AND a.organization_id=:organization_id
              AND f.status='active' AND farm.status='active'
              AND (m.role='organization_owner' OR farm.owner_user_id=:user_id)
            ORDER BY a.acquired_at DESC, a.id DESC
        """), {"field_id": field_id, "organization_id": self.scope.organization_id, "user_id": self.scope.user_id})
        return [_acquisition(row) for row in result.mappings().all()]

    async def get_observation(self, field_id: UUID, observation_id: UUID) -> AcquisitionRecord | None:
        result = await self.session.execute(text("""
            SELECT a.id, a.field_id, a.organization_id, a.provider, a.collection,
                   a.provider_item_id, a.acquired_at, a.cloud_cover_percent,
                   a.search_status, a.searched_at, a.provider_metadata,
                   a.created_at, a.updated_at
            FROM field_acquisitions a
            JOIN fields f ON f.id=a.field_id AND f.organization_id=a.organization_id
            JOIN farms farm ON farm.id=f.farm_id AND farm.organization_id=f.organization_id
            JOIN memberships m ON m.organization_id=f.organization_id
             AND m.user_id=:user_id AND m.status='active'
            WHERE a.id=:observation_id AND a.field_id=:field_id
              AND a.organization_id=:organization_id
              AND f.status='active' AND farm.status='active'
              AND (m.role='organization_owner' OR farm.owner_user_id=:user_id)
        """), {"observation_id": observation_id, "field_id": field_id,
            "organization_id": self.scope.organization_id, "user_id": self.scope.user_id})
        row = result.mappings().one_or_none()
        return _acquisition(row) if row else None

    async def list_cached_observation_ids(self, field_id: UUID, algorithm_version: str) -> set[UUID]:
        result = await self.session.execute(text("""
            SELECT analysis.observation_id
            FROM field_observation_analyses analysis
            JOIN field_acquisitions a ON a.id=analysis.observation_id
             AND a.field_id=analysis.field_id AND a.organization_id=analysis.organization_id
            JOIN fields f ON f.id=a.field_id AND f.organization_id=a.organization_id
            JOIN farms farm ON farm.id=f.farm_id AND farm.organization_id=f.organization_id
            JOIN memberships m ON m.organization_id=f.organization_id
             AND m.user_id=:user_id AND m.status='active'
            WHERE analysis.field_id=:field_id AND analysis.organization_id=:organization_id
              AND analysis.algorithm_version=:algorithm_version
              AND f.status='active' AND farm.status='active'
              AND (m.role='organization_owner' OR farm.owner_user_id=:user_id)
        """), {"field_id": field_id, "organization_id": self.scope.organization_id,
            "algorithm_version": algorithm_version, "user_id": self.scope.user_id})
        return {row[0] for row in result.all()}

    async def get_analysis(self, observation_id: UUID, algorithm_version: str) -> ObservationAnalysisRecord | None:
        result = await self.session.execute(text("""
            SELECT analysis.observation_id, analysis.field_id, analysis.organization_id,
                   analysis.acquired_at, analysis.algorithm_version, analysis.ndvi_mean,
                   analysis.ndvi_min, analysis.ndvi_max, analysis.ndvi_stddev,
                   analysis.sample_count, analysis.valid_sample_count,
                   analysis.valid_pixel_ratio, analysis.raster_tiff, analysis.raster_crs,
                   analysis.raster_bounds, analysis.raster_width, analysis.raster_height
            FROM field_observation_analyses analysis
            JOIN field_acquisitions a ON a.id=analysis.observation_id
             AND a.field_id=analysis.field_id AND a.organization_id=analysis.organization_id
            JOIN fields f ON f.id=a.field_id AND f.organization_id=a.organization_id
            JOIN farms farm ON farm.id=f.farm_id AND farm.organization_id=f.organization_id
            JOIN memberships m ON m.organization_id=f.organization_id
             AND m.user_id=:user_id AND m.status='active'
            WHERE analysis.observation_id=:observation_id
              AND analysis.organization_id=:organization_id
              AND analysis.algorithm_version=:algorithm_version
              AND f.status='active' AND farm.status='active'
              AND (m.role='organization_owner' OR farm.owner_user_id=:user_id)
        """), {"observation_id": observation_id, "organization_id": self.scope.organization_id, "algorithm_version": algorithm_version, "user_id": self.scope.user_id})
        row = result.mappings().one_or_none()
        return _analysis(row) if row else None

    async def upsert_analysis(self, *, observation: AcquisitionRecord, algorithm_version: str,
        ndvi_mean: float, ndvi_min: float, ndvi_max: float, ndvi_stddev: float,
        sample_count: int, valid_sample_count: int, valid_pixel_ratio: float,
        raster_tiff: bytes, raster_crs: str, raster_bounds: list[float],
        raster_width: int, raster_height: int) -> ObservationAnalysisRecord:
        result = await self.session.execute(text("""
            INSERT INTO field_observation_analyses (
              observation_id, field_id, organization_id, acquired_at, algorithm_version,
              ndvi_mean, ndvi_min, ndvi_max, ndvi_stddev, sample_count,
              valid_sample_count, valid_pixel_ratio, raster_tiff, raster_crs,
              raster_bounds, raster_width, raster_height)
            VALUES (:observation_id,:field_id,:organization_id,:acquired_at,:algorithm_version,
              :ndvi_mean,:ndvi_min,:ndvi_max,:ndvi_stddev,:sample_count,
              :valid_sample_count,:valid_pixel_ratio,:raster_tiff,:raster_crs,
              CAST(:raster_bounds AS jsonb),:raster_width,:raster_height)
            ON CONFLICT (observation_id, algorithm_version) DO UPDATE SET
              ndvi_mean=EXCLUDED.ndvi_mean, ndvi_min=EXCLUDED.ndvi_min,
              ndvi_max=EXCLUDED.ndvi_max, ndvi_stddev=EXCLUDED.ndvi_stddev,
              sample_count=EXCLUDED.sample_count, valid_sample_count=EXCLUDED.valid_sample_count,
              valid_pixel_ratio=EXCLUDED.valid_pixel_ratio, raster_tiff=EXCLUDED.raster_tiff,
              raster_crs=EXCLUDED.raster_crs, raster_bounds=EXCLUDED.raster_bounds,
              raster_width=EXCLUDED.raster_width, raster_height=EXCLUDED.raster_height,
              updated_at=now()
            RETURNING observation_id,field_id,organization_id,acquired_at,algorithm_version,
              ndvi_mean,ndvi_min,ndvi_max,ndvi_stddev,sample_count,valid_sample_count,
              valid_pixel_ratio,raster_tiff,raster_crs,raster_bounds,raster_width,raster_height
        """), {"observation_id": observation.id, "field_id": observation.field_id,
            "organization_id": observation.organization_id, "acquired_at": observation.acquired_at,
            "algorithm_version": algorithm_version, "ndvi_mean": ndvi_mean, "ndvi_min": ndvi_min,
            "ndvi_max": ndvi_max, "ndvi_stddev": ndvi_stddev, "sample_count": sample_count,
            "valid_sample_count": valid_sample_count, "valid_pixel_ratio": valid_pixel_ratio,
            "raster_tiff": raster_tiff, "raster_crs": raster_crs,
            "raster_bounds": __import__('json').dumps(raster_bounds), "raster_width": raster_width,
            "raster_height": raster_height})
        return _analysis(result.mappings().one())
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
