"""Tenant-scoped satellite acquisition repository."""

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
class NdviSnapshotRecord:
    id: UUID
    field_id: UUID
    organization_id: UUID
    acquisition_id: UUID
    acquired_at: datetime
    algorithm_version: str
    geometry_hash: str | None
    ndvi_mean: Decimal
    ndvi_min: Decimal
    ndvi_max: Decimal
    ndvi_stddev: Decimal
    sample_count: int
    valid_sample_count: int
    valid_pixel_ratio: Decimal
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ObservationAnalysisRecord:
    observation_id: UUID
    field_id: UUID
    organization_id: UUID
    acquired_at: datetime
    algorithm_version: str
    geometry_hash: str | None
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


@dataclass(frozen=True)
class BackfillReceiptRecord:
    id: UUID
    field_id: UUID
    organization_id: UUID
    geometry_hash: str
    start_at: datetime
    end_at: datetime
    status: str
    pages_discovered: int
    catalog_found_count: int
    persisted_count: int
    rejected_count: int
    no_history_reason: str | None
    started_at: datetime
    completed_at: datetime | None


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


def _ndvi_snapshot(row: Any) -> NdviSnapshotRecord:
    return NdviSnapshotRecord(
        id=row["id"],
        field_id=row["field_id"],
        organization_id=row["organization_id"],
        acquisition_id=row["acquisition_id"],
        acquired_at=row["acquired_at"],
        algorithm_version=row["algorithm_version"],
        geometry_hash=row["geometry_hash"],
        ndvi_mean=row["ndvi_mean"],
        ndvi_min=row["ndvi_min"],
        ndvi_max=row["ndvi_max"],
        ndvi_stddev=row["ndvi_stddev"],
        sample_count=row["sample_count"],
        valid_sample_count=row["valid_sample_count"],
        valid_pixel_ratio=row["valid_pixel_ratio"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _analysis(row: Any) -> ObservationAnalysisRecord:
    return ObservationAnalysisRecord(**{key: row[key] for key in ObservationAnalysisRecord.__dataclass_fields__})


def _receipt(row: Any) -> BackfillReceiptRecord:
    return BackfillReceiptRecord(
        id=row["id"],
        field_id=row["field_id"],
        organization_id=row["organization_id"],
        geometry_hash=row["geometry_hash"],
        start_at=row["start_at"],
        end_at=row["end_at"],
        status=row["status"],
        pages_discovered=row["pages_discovered"],
        catalog_found_count=row["catalog_found_count"],
        persisted_count=row["persisted_count"],
        rejected_count=row["rejected_count"],
        no_history_reason=row["no_history_reason"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


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

    async def list_cached_observation_ids(
        self, field_id: UUID, algorithm_version: str, geometry_hash: str
    ) -> set[UUID]:
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
              AND analysis.geometry_hash=:geometry_hash
              AND f.status='active' AND farm.status='active'
              AND (m.role='organization_owner' OR farm.owner_user_id=:user_id)
        """), {"field_id": field_id, "organization_id": self.scope.organization_id,
            "algorithm_version": algorithm_version, "geometry_hash": geometry_hash,
            "user_id": self.scope.user_id})
        return {row[0] for row in result.all()}

    async def get_analysis(
        self, observation_id: UUID, algorithm_version: str, geometry_hash: str
    ) -> ObservationAnalysisRecord | None:
        result = await self.session.execute(text("""
            SELECT analysis.observation_id, analysis.field_id, analysis.organization_id,
                   analysis.acquired_at, analysis.algorithm_version, analysis.ndvi_mean,
                   analysis.geometry_hash,
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
              AND analysis.geometry_hash=:geometry_hash
              AND f.status='active' AND farm.status='active'
              AND (m.role='organization_owner' OR farm.owner_user_id=:user_id)
        """), {"observation_id": observation_id, "organization_id": self.scope.organization_id,
            "algorithm_version": algorithm_version, "geometry_hash": geometry_hash,
            "user_id": self.scope.user_id})
        row = result.mappings().one_or_none()
        return _analysis(row) if row else None

    async def list_cached_analyses_for_farm(
        self,
        *,
        farm_id: UUID,
        algorithm_version: str,
        geometry_hashes: dict[UUID, str],
    ) -> list[ObservationAnalysisRecord]:
        result = await self.session.execute(
            text(
                """
                WITH ranked AS (
                  SELECT analysis.observation_id, analysis.field_id, analysis.organization_id,
                         analysis.acquired_at, analysis.algorithm_version,
                         analysis.geometry_hash, analysis.ndvi_mean, analysis.ndvi_min,
                         analysis.ndvi_max, analysis.ndvi_stddev, analysis.sample_count,
                         analysis.valid_sample_count, analysis.valid_pixel_ratio,
                         analysis.raster_tiff, analysis.raster_crs, analysis.raster_bounds,
                         analysis.raster_width, analysis.raster_height,
                         row_number() OVER (
                           PARTITION BY analysis.field_id
                           ORDER BY analysis.acquired_at DESC, analysis.observation_id DESC
                         ) AS analysis_rank
                  FROM field_observation_analyses analysis
                  JOIN fields f
                    ON f.id = analysis.field_id
                   AND f.organization_id = analysis.organization_id
                  JOIN farms farm
                    ON farm.id = f.farm_id
                   AND farm.organization_id = f.organization_id
                  JOIN memberships m
                    ON m.organization_id = f.organization_id
                   AND m.user_id = :user_id
                   AND m.status = 'active'
                  WHERE farm.id = :farm_id
                    AND analysis.organization_id = :organization_id
                    AND analysis.algorithm_version = :algorithm_version
                    AND analysis.geometry_hash = (
                      CAST(:geometry_hashes AS jsonb) ->> analysis.field_id::text
                    )
                    AND f.status = 'active'
                    AND farm.status = 'active'
                    AND (m.role = 'organization_owner' OR farm.owner_user_id = :user_id)
                )
                SELECT observation_id, field_id, organization_id, acquired_at,
                       algorithm_version, geometry_hash, ndvi_mean, ndvi_min, ndvi_max,
                       ndvi_stddev, sample_count, valid_sample_count, valid_pixel_ratio,
                       raster_tiff, raster_crs, raster_bounds, raster_width, raster_height
                FROM ranked
                WHERE analysis_rank <= 2
                ORDER BY field_id, acquired_at DESC, observation_id DESC
                """
            ),
            {
                "farm_id": farm_id,
                "organization_id": self.require_scope(),
                "algorithm_version": algorithm_version,
                "geometry_hashes": json.dumps(
                    {str(field_id): value for field_id, value in geometry_hashes.items()}
                ),
                "user_id": self.scope.user_id,
            },
        )
        return [_analysis(row) for row in result.mappings().all()]

    async def lock_observation_for_analysis(
        self, observation_id: UUID, field_id: UUID
    ) -> None:
        await self.session.execute(
            text(
                """
                SELECT id
                FROM field_acquisitions
                WHERE id = :observation_id
                  AND field_id = :field_id
                  AND organization_id = :organization_id
                FOR UPDATE
                """
            ),
            {
                "observation_id": observation_id,
                "field_id": field_id,
                "organization_id": self.scope.organization_id,
            },
        )

    async def upsert_analysis(self, *, observation: AcquisitionRecord, algorithm_version: str,
        geometry_hash: str,
        ndvi_mean: float, ndvi_min: float, ndvi_max: float, ndvi_stddev: float,
        sample_count: int, valid_sample_count: int, valid_pixel_ratio: float,
        raster_tiff: bytes, raster_crs: str, raster_bounds: list[float],
        raster_width: int, raster_height: int) -> ObservationAnalysisRecord:
        result = await self.session.execute(text("""
            INSERT INTO field_observation_analyses (
              observation_id, field_id, organization_id, acquired_at, algorithm_version, geometry_hash,
              ndvi_mean, ndvi_min, ndvi_max, ndvi_stddev, sample_count,
              valid_sample_count, valid_pixel_ratio, raster_tiff, raster_crs,
              raster_bounds, raster_width, raster_height)
            VALUES (:observation_id,:field_id,:organization_id,:acquired_at,:algorithm_version,:geometry_hash,
              :ndvi_mean,:ndvi_min,:ndvi_max,:ndvi_stddev,:sample_count,
              :valid_sample_count,:valid_pixel_ratio,:raster_tiff,:raster_crs,
              CAST(:raster_bounds AS jsonb),:raster_width,:raster_height)
            ON CONFLICT (observation_id, algorithm_version, geometry_hash) DO UPDATE SET
              ndvi_mean=EXCLUDED.ndvi_mean, ndvi_min=EXCLUDED.ndvi_min,
              ndvi_max=EXCLUDED.ndvi_max, ndvi_stddev=EXCLUDED.ndvi_stddev,
              sample_count=EXCLUDED.sample_count, valid_sample_count=EXCLUDED.valid_sample_count,
              valid_pixel_ratio=EXCLUDED.valid_pixel_ratio, raster_tiff=EXCLUDED.raster_tiff,
              raster_crs=EXCLUDED.raster_crs, raster_bounds=EXCLUDED.raster_bounds,
              raster_width=EXCLUDED.raster_width, raster_height=EXCLUDED.raster_height,
              updated_at=now()
            RETURNING observation_id,field_id,organization_id,acquired_at,algorithm_version,geometry_hash,
              ndvi_mean,ndvi_min,ndvi_max,ndvi_stddev,sample_count,valid_sample_count,
              valid_pixel_ratio,raster_tiff,raster_crs,raster_bounds,raster_width,raster_height
        """), {"observation_id": observation.id, "field_id": observation.field_id,
            "organization_id": observation.organization_id, "acquired_at": observation.acquired_at,
            "algorithm_version": algorithm_version, "geometry_hash": geometry_hash,
            "ndvi_mean": ndvi_mean, "ndvi_min": ndvi_min,
            "ndvi_max": ndvi_max, "ndvi_stddev": ndvi_stddev, "sample_count": sample_count,
            "valid_sample_count": valid_sample_count, "valid_pixel_ratio": valid_pixel_ratio,
            "raster_tiff": raster_tiff, "raster_crs": raster_crs,
            "raster_bounds": __import__('json').dumps(raster_bounds), "raster_width": raster_width,
            "raster_height": raster_height})
        return _analysis(result.mappings().one())
    async def insert_historical_observation(
        self,
        *,
        field_id: UUID,
        provider: str,
        collection: str,
        provider_item_id: str,
        acquired_at: datetime,
        cloud_cover_percent: float | None,
        discovered_at: datetime,
        geometry_hash: str,
        provider_metadata: dict[str, Any],
    ) -> tuple[AcquisitionRecord, bool]:
        """Insert one discovered item without relabeling an existing lineage."""
        result = await self.session.execute(
            text(
                """
                INSERT INTO field_acquisitions (
                  field_id, organization_id, provider, collection, provider_item_id,
                  acquired_at, cloud_cover_percent, search_status, searched_at,
                  provider_metadata
                )
                VALUES (
                  :field_id, :organization_id, :provider, :collection, :provider_item_id,
                  :acquired_at, :cloud_cover_percent, 'available', :discovered_at,
                  CAST(:provider_metadata AS jsonb)
                )
                ON CONFLICT (field_id, provider, provider_item_id) DO NOTHING
                RETURNING id, field_id, organization_id, provider, collection, provider_item_id,
                          acquired_at, cloud_cover_percent, search_status, searched_at,
                          provider_metadata, created_at, updated_at
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.require_scope(),
                "provider": provider,
                "collection": collection,
                "provider_item_id": provider_item_id,
                "acquired_at": acquired_at,
                "cloud_cover_percent": cloud_cover_percent,
                "discovered_at": discovered_at,
                "geometry_hash": geometry_hash,
                "provider_metadata": json.dumps(provider_metadata),
            },
        )
        row = result.mappings().one_or_none()
        if row is not None:
            return _acquisition(row), True
        existing = await self.get_acquisition_by_provider_item(
            field_id=field_id,
            provider=provider,
            provider_item_id=provider_item_id,
        )
        if existing is None:
            raise RuntimeError("historical observation conflict could not be read")
        return existing, False

    async def get_acquisition_by_provider_item(
        self, *, field_id: UUID, provider: str, provider_item_id: str
    ) -> AcquisitionRecord | None:
        result = await self.session.execute(
            text(
                """
                SELECT id, field_id, organization_id, provider, collection, provider_item_id,
                       acquired_at, cloud_cover_percent, search_status, searched_at,
                       provider_metadata, created_at, updated_at
                FROM field_acquisitions
                WHERE field_id = :field_id
                  AND organization_id = :organization_id
                  AND provider = :provider
                  AND provider_item_id = :provider_item_id
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.require_scope(),
                "provider": provider,
                "provider_item_id": provider_item_id,
            },
        )
        row = result.mappings().one_or_none()
        return _acquisition(row) if row else None

    async def create_or_get_backfill_receipt(
        self,
        *,
        field_id: UUID,
        geometry_hash: str,
        start_at: datetime,
        end_at: datetime,
    ) -> tuple[BackfillReceiptRecord, bool]:
        result = await self.session.execute(
            text(
                """
                INSERT INTO field_backfill_receipts (
                  field_id, organization_id, geometry_hash, start_at, end_at,
                  status, pages_discovered, catalog_found_count, persisted_count,
                  rejected_count, started_at
                )
                VALUES (
                  :field_id, :organization_id, :geometry_hash, :start_at, :end_at,
                  'COMPLETED', 0, 0, 0, 0, now()
                )
                ON CONFLICT (field_id, geometry_hash, start_at, end_at) DO NOTHING
                RETURNING id, field_id, organization_id, geometry_hash, start_at, end_at,
                          status, pages_discovered, catalog_found_count, persisted_count,
                          rejected_count, no_history_reason, started_at, completed_at
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.require_scope(),
                "geometry_hash": geometry_hash,
                "start_at": start_at,
                "end_at": end_at,
            },
        )
        row = result.mappings().one_or_none()
        if row is not None:
            return _receipt(row), True
        existing = await self.get_backfill_receipt(
            field_id=field_id,
            receipt_id=None,
            geometry_hash=geometry_hash,
            start_at=start_at,
            end_at=end_at,
        )
        if existing is None:
            raise RuntimeError("backfill receipt conflict could not be read")
        return existing, False

    async def get_backfill_receipt(
        self,
        *,
        field_id: UUID,
        receipt_id: UUID | None,
        geometry_hash: str | None = None,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> BackfillReceiptRecord | None:
        if receipt_id is None and (geometry_hash is None or start_at is None or end_at is None):
            raise ValueError("receipt ID or identity is required")
        result = await self.session.execute(
            text(
                """
                SELECT receipt.id, receipt.field_id, receipt.organization_id,
                       receipt.geometry_hash, receipt.start_at, receipt.end_at,
                       receipt.status, receipt.pages_discovered,
                       receipt.catalog_found_count, receipt.persisted_count,
                       receipt.rejected_count, receipt.no_history_reason,
                       receipt.started_at, receipt.completed_at
                FROM field_backfill_receipts receipt
                JOIN fields field
                  ON field.id = receipt.field_id
                 AND field.organization_id = receipt.organization_id
                JOIN farms farm
                  ON farm.id = field.farm_id
                 AND farm.organization_id = field.organization_id
                JOIN memberships membership
                  ON membership.organization_id = field.organization_id
                 AND membership.user_id = :user_id
                 AND membership.status = 'active'
                WHERE receipt.field_id = :field_id
                  AND receipt.organization_id = :organization_id
                  AND receipt.status = 'COMPLETED'
                  AND receipt.completed_at IS NOT NULL
                  AND (CAST(:receipt_id AS uuid) IS NULL OR receipt.id = CAST(:receipt_id AS uuid))
                  AND (CAST(:geometry_hash AS varchar) IS NULL OR receipt.geometry_hash = CAST(:geometry_hash AS varchar))
                  AND (CAST(:start_at AS timestamptz) IS NULL OR receipt.start_at = CAST(:start_at AS timestamptz))
                  AND (CAST(:end_at AS timestamptz) IS NULL OR receipt.end_at = CAST(:end_at AS timestamptz))
                  AND field.status = 'active' AND farm.status = 'active'
                  AND (membership.role = 'organization_owner' OR farm.owner_user_id = :user_id)
                ORDER BY receipt.completed_at DESC
                LIMIT 1
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.require_scope(),
                "user_id": self.scope.user_id,
                "receipt_id": receipt_id,
                "geometry_hash": geometry_hash,
                "start_at": start_at,
                "end_at": end_at,
            },
        )
        row = result.mappings().one_or_none()
        return _receipt(row) if row else None

    async def finish_backfill_receipt(
        self,
        *,
        receipt_id: UUID,
        field_id: UUID,
        geometry_hash: str,
        start_at: datetime,
        end_at: datetime,
        pages_discovered: int,
        catalog_found_count: int,
        persisted_count: int,
        rejected_count: int,
        no_history_reason: str | None,
    ) -> BackfillReceiptRecord:
        result = await self.session.execute(
            text(
                """
                UPDATE field_backfill_receipts
                SET pages_discovered = :pages_discovered,
                    catalog_found_count = :catalog_found_count,
                    persisted_count = :persisted_count,
                    rejected_count = :rejected_count,
                    no_history_reason = :no_history_reason,
                    completed_at = now(),
                    updated_at = now()
                WHERE id = :receipt_id
                  AND field_id = :field_id
                  AND organization_id = :organization_id
                  AND geometry_hash = :geometry_hash
                  AND start_at = :start_at
                  AND end_at = :end_at
                RETURNING id, field_id, organization_id, geometry_hash, start_at, end_at,
                          status, pages_discovered, catalog_found_count, persisted_count,
                          rejected_count, no_history_reason, started_at, completed_at
                """
            ),
            {
                "receipt_id": receipt_id,
                "field_id": field_id,
                "organization_id": self.require_scope(),
                "geometry_hash": geometry_hash,
                "start_at": start_at,
                "end_at": end_at,
                "pages_discovered": pages_discovered,
                "catalog_found_count": catalog_found_count,
                "persisted_count": persisted_count,
                "rejected_count": rejected_count,
                "no_history_reason": no_history_reason,
            },
        )
        row = result.mappings().one_or_none()
        if row is None:
            raise RuntimeError("backfill receipt could not be finalized")
        return _receipt(row)

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
        geometry_hash: str | None = None,
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
                  jsonb_build_object(
                    'provider_item_id', CAST(:metadata_provider_item_id AS text),
                    'geometry_hash', CAST(:geometry_hash AS text)
                  )
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
                "geometry_hash": geometry_hash,
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
                JOIN farms farm
                  ON farm.id = field.farm_id
                 AND farm.organization_id = field.organization_id
                JOIN memberships m
                  ON m.organization_id = acquisition.organization_id
                WHERE acquisition.field_id = :field_id
                  AND acquisition.organization_id = :organization_id
                  AND field.status = 'active'
                  AND farm.status = 'active'
                  AND m.user_id = :user_id
                  AND m.status = 'active'
                  AND (m.role = 'organization_owner' OR farm.owner_user_id = :user_id)
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

    async def get_ndvi_snapshot(
        self,
        *,
        field_id: UUID,
        acquisition_id: UUID,
        algorithm_version: str,
        geometry_hash: str,
    ) -> NdviSnapshotRecord | None:
        result = await self.session.execute(
            text(
                """
                SELECT snapshot.id, snapshot.field_id, snapshot.organization_id,
                       snapshot.acquisition_id, snapshot.acquired_at,
                       snapshot.algorithm_version, snapshot.geometry_hash,
                       snapshot.ndvi_mean, snapshot.ndvi_min, snapshot.ndvi_max,
                       snapshot.ndvi_stddev, snapshot.sample_count,
                       snapshot.valid_sample_count, snapshot.valid_pixel_ratio,
                       snapshot.created_at, snapshot.updated_at
                FROM field_ndvi_snapshots snapshot
                JOIN fields field
                  ON field.id = snapshot.field_id
                 AND field.organization_id = snapshot.organization_id
                JOIN farms farm
                  ON farm.id = field.farm_id
                 AND farm.organization_id = field.organization_id
                JOIN memberships membership
                  ON membership.organization_id = field.organization_id
                 AND membership.user_id = :user_id
                 AND membership.status = 'active'
                WHERE snapshot.field_id = :field_id
                  AND snapshot.acquisition_id = :acquisition_id
                  AND snapshot.organization_id = :organization_id
                  AND snapshot.algorithm_version = :algorithm_version
                  AND snapshot.geometry_hash = :geometry_hash
                  AND field.status = 'active' AND farm.status = 'active'
                  AND (membership.role = 'organization_owner' OR farm.owner_user_id = :user_id)
                """
            ),
            {
                "field_id": field_id,
                "acquisition_id": acquisition_id,
                "organization_id": self.scope.organization_id,
                "user_id": self.scope.user_id,
                "algorithm_version": algorithm_version,
                "geometry_hash": geometry_hash,
            },
        )
        row = result.mappings().one_or_none()
        return _ndvi_snapshot(row) if row else None

    async def upsert_ndvi_snapshot(
        self,
        *,
        field_id: UUID,
        acquisition_id: UUID,
        acquired_at: datetime,
        algorithm_version: str,
        geometry_hash: str,
        ndvi_mean: float,
        ndvi_min: float,
        ndvi_max: float,
        ndvi_stddev: float,
        sample_count: int,
        valid_sample_count: int,
        valid_pixel_ratio: float,
    ) -> NdviSnapshotRecord:
        result = await self.session.execute(
            text(
                """
                INSERT INTO field_ndvi_snapshots (
                  field_id, organization_id, acquisition_id, acquired_at,
                  algorithm_version, geometry_hash, ndvi_mean, ndvi_min, ndvi_max,
                  ndvi_stddev, sample_count, valid_sample_count, valid_pixel_ratio
                )
                VALUES (
                  :field_id, :organization_id, :acquisition_id, :acquired_at,
                  :algorithm_version, :geometry_hash, :ndvi_mean, :ndvi_min, :ndvi_max,
                  :ndvi_stddev, :sample_count, :valid_sample_count,
                  :valid_pixel_ratio
                )
                ON CONFLICT (field_id, acquisition_id, algorithm_version, geometry_hash)
                DO UPDATE SET
                  ndvi_mean = EXCLUDED.ndvi_mean,
                  ndvi_min = EXCLUDED.ndvi_min,
                  ndvi_max = EXCLUDED.ndvi_max,
                  ndvi_stddev = EXCLUDED.ndvi_stddev,
                  sample_count = EXCLUDED.sample_count,
                  valid_sample_count = EXCLUDED.valid_sample_count,
                  valid_pixel_ratio = EXCLUDED.valid_pixel_ratio,
                  updated_at = now()
                RETURNING id, field_id, organization_id, acquisition_id, acquired_at,
                          algorithm_version, geometry_hash, ndvi_mean, ndvi_min,
                          ndvi_max, ndvi_stddev, sample_count, valid_sample_count,
                          valid_pixel_ratio, created_at, updated_at
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.scope.organization_id,
                "acquisition_id": acquisition_id,
                "acquired_at": acquired_at,
                "algorithm_version": algorithm_version,
                "geometry_hash": geometry_hash,
                "ndvi_mean": ndvi_mean,
                "ndvi_min": ndvi_min,
                "ndvi_max": ndvi_max,
                "ndvi_stddev": ndvi_stddev,
                "sample_count": sample_count,
                "valid_sample_count": valid_sample_count,
                "valid_pixel_ratio": valid_pixel_ratio,
            },
        )
        return _ndvi_snapshot(result.mappings().one())

    async def get_previous_ndvi_snapshot(
        self,
        *,
        field_id: UUID,
        acquired_before: datetime,
        algorithm_version: str,
        geometry_hash: str,
    ) -> NdviSnapshotRecord | None:
        result = await self.session.execute(
            text(
                """
                SELECT snapshot.id, snapshot.field_id, snapshot.organization_id,
                       snapshot.acquisition_id, snapshot.acquired_at,
                       snapshot.algorithm_version, snapshot.geometry_hash,
                       snapshot.ndvi_mean, snapshot.ndvi_min, snapshot.ndvi_max,
                       snapshot.ndvi_stddev, snapshot.sample_count,
                       snapshot.valid_sample_count, snapshot.valid_pixel_ratio,
                       snapshot.created_at, snapshot.updated_at
                FROM field_ndvi_snapshots snapshot
                JOIN fields field ON field.id = snapshot.field_id
                  AND field.organization_id = snapshot.organization_id
                JOIN farms farm ON farm.id = field.farm_id
                  AND farm.organization_id = field.organization_id
                JOIN memberships membership ON membership.organization_id = field.organization_id
                  AND membership.user_id = :user_id AND membership.status = 'active'
                WHERE snapshot.field_id = :field_id
                  AND snapshot.organization_id = :organization_id
                  AND snapshot.algorithm_version = :algorithm_version
                  AND snapshot.geometry_hash = :geometry_hash
                  AND snapshot.acquired_at < :acquired_before
                  AND field.status = 'active' AND farm.status = 'active'
                  AND (membership.role = 'organization_owner' OR farm.owner_user_id = :user_id)
                ORDER BY snapshot.acquired_at DESC, snapshot.created_at DESC
                LIMIT 1
                """
            ),
            {
                "field_id": field_id,
                "organization_id": self.scope.organization_id,
                "user_id": self.scope.user_id,
                "algorithm_version": algorithm_version,
                "geometry_hash": geometry_hash,
                "acquired_before": acquired_before,
            },
        )
        row = result.mappings().one_or_none()
        return _ndvi_snapshot(row) if row else None
