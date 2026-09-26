"""Synchronous, atomic discovery of bounded observation history."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from apps.api.agriscope_api.core.config import SettingsSnapshot
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.providers.cdse_stac import (
    MAX_HISTORY_PAGES,
    CdseStacHistoryResult,
    CdseStacItem,
    CdseStacUnavailable,
)
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.farms import FarmRepository
from apps.api.agriscope_api.repositories.satellite import (
    BackfillReceiptRecord,
    SatelliteRepository,
)


NO_HISTORY_REASON = "NO_CATALOG_RESULTS_IN_BOUNDED_RANGE"
REJECTED_CLOUD_REASON = "CLOUD_COVER_EXCEEDS_THRESHOLD"
MAX_BACKFILL_DAYS = 730


@dataclass(frozen=True)
class BackfillResult:
    receipt: BackfillReceiptRecord


class ObservationHistoryService:
    def __init__(self, session, settings: SettingsSnapshot, provider=None) -> None:
        self.session = session
        self.settings = settings
        self.provider = provider

    async def run_backfill(
        self,
        *,
        user_id: UUID,
        field_id: UUID,
        start_at: datetime,
        end_at: datetime,
    ) -> BackfillResult:
        start_at, end_at = _normalise_bounds(start_at, end_at)
        field = await FarmRepository(
            self.session,
            TenantScope(organization_id=None, user_id=user_id, role="viewer"),
        ).get_field(field_id)
        if field is None:
            raise ApiException("not_found", "Resource not found", 404)

        geometry_hash = _geometry_hash(field.geometry)
        repository = SatelliteRepository(
            self.session,
            TenantScope(field.organization_id, user_id, "viewer"),
        )
        receipt, created = await repository.create_or_get_backfill_receipt(
            field_id=field.id,
            geometry_hash=geometry_hash,
            start_at=start_at,
            end_at=end_at,
        )
        if not created:
            return BackfillResult(receipt)

        provider = self.provider or self._provider()
        try:
            result = await provider.search_history(
                field.geometry,
                start=start_at,
                end=end_at,
                max_pages=MAX_HISTORY_PAGES,
            )
        except (CdseStacUnavailable, ValueError) as exc:
            raise ApiException(
                "satellite_temporarily_unavailable",
                "ยังไม่สามารถค้นหาประวัติภาพดาวเทียมได้",
                503,
            ) from exc

        items, pages, truncated, searched_at = _history_items(result)
        if truncated:
            raise ApiException(
                "backfill_result_truncated",
                "พบผลลัพธ์มากเกินขอบเขตการค้นหา กรุณาลดช่วงวันที่แล้วลองใหม่",
                422,
                {"maximum_pages": MAX_HISTORY_PAGES},
            )

        seen: set[tuple[str, str, str]] = set()
        catalog_found_count = 0
        persisted_count = 0
        rejected_count = 0
        for item in items:
            if not _has_source_identity(item):
                # A provider result without a stable source identity cannot be
                # safely persisted or counted as a discovered acquisition.
                continue
            identity = (item.provider, item.collection, item.item_id)
            if identity in seen:
                continue
            seen.add(identity)
            catalog_found_count += 1
            rejection_reason = _rejection_reason(
                item, self.settings.satellite_max_cloud_cover_percent
            )
            if rejection_reason is not None:
                rejected_count += 1
            metadata = _source_provenance(
                item, discovered_at=searched_at, geometry_hash=geometry_hash
            )
            _observation, inserted = await repository.insert_historical_observation(
                field_id=field.id,
                provider=item.provider,
                collection=item.collection,
                provider_item_id=item.item_id,
                acquired_at=item.acquired_at,
                cloud_cover_percent=item.cloud_cover_percent,
                discovered_at=searched_at,
                geometry_hash=geometry_hash,
                provider_metadata=metadata,
            )
            if inserted:
                persisted_count += 1

        receipt = await repository.finish_backfill_receipt(
            receipt_id=receipt.id,
            field_id=field.id,
            geometry_hash=geometry_hash,
            start_at=start_at,
            end_at=end_at,
            pages_discovered=pages,
            catalog_found_count=catalog_found_count,
            persisted_count=persisted_count,
            rejected_count=rejected_count,
            no_history_reason=NO_HISTORY_REASON if catalog_found_count == 0 else None,
        )
        return BackfillResult(receipt)

    async def get_receipt(
        self, *, user_id: UUID, field_id: UUID, receipt_id: UUID
    ) -> BackfillReceiptRecord:
        field = await FarmRepository(
            self.session,
            TenantScope(organization_id=None, user_id=user_id, role="viewer"),
        ).get_field(field_id)
        if field is None:
            raise ApiException("not_found", "Resource not found", 404)
        receipt = await SatelliteRepository(
            self.session,
            TenantScope(field.organization_id, user_id, "viewer"),
        ).get_backfill_receipt(field_id=field_id, receipt_id=receipt_id)
        if receipt is None:
            raise ApiException("not_found", "Resource not found", 404)
        return receipt

    def _provider(self):
        from apps.api.agriscope_api.providers.cdse_stac import CdseStacClient

        return CdseStacClient(
            stac_url=self.settings.cdse_stac_url,
            timeout_seconds=self.settings.satellite_search_timeout_seconds,
            lookback_days=self.settings.satellite_search_lookback_days,
            max_cloud_cover_percent=self.settings.satellite_max_cloud_cover_percent,
        )


def _normalise_bounds(start_at: datetime, end_at: datetime) -> tuple[datetime, datetime]:
    if (
        start_at.tzinfo is None
        or end_at.tzinfo is None
        or start_at.utcoffset() is None
        or end_at.utcoffset() is None
    ):
        raise ApiException("invalid_backfill_range", "ช่วงเวลาต้องระบุ timezone", 422)
    start_at = start_at.astimezone(UTC)
    end_at = end_at.astimezone(UTC)
    if start_at > end_at:
        raise ApiException("invalid_backfill_range", "วันเริ่มต้นต้องไม่หลังวันสิ้นสุด", 422)
    if end_at - start_at > timedelta(days=MAX_BACKFILL_DAYS):
        raise ApiException(
            "backfill_range_too_large",
            "ช่วงเวลาย้อนหลังยาวเกินขอบเขตที่กำหนด",
            422,
            {"maximum_days": MAX_BACKFILL_DAYS},
        )
    return start_at, end_at


def _history_items(
    result: CdseStacHistoryResult | Any,
) -> tuple[list[CdseStacItem], int, bool, datetime]:
    items = getattr(result, "items", None)
    pages = getattr(result, "page_count", None)
    truncated = getattr(result, "truncated", False)
    searched_at = getattr(result, "searched_at", None)
    if (
        not isinstance(items, (list, tuple))
        or not isinstance(pages, int)
        or pages < 0
        or not isinstance(truncated, bool)
        or not isinstance(searched_at, datetime)
    ):
        raise ApiException(
            "satellite_temporarily_unavailable",
            "ยังไม่สามารถค้นหาประวัติภาพดาวเทียมได้",
            503,
        )
    return list(items), pages, truncated, searched_at.astimezone(UTC)


def _has_source_identity(item: Any) -> bool:
    return (
        all(
            isinstance(getattr(item, name, None), str) and bool(getattr(item, name))
            for name in ("provider", "collection", "item_id")
        )
        and isinstance(getattr(item, "acquired_at", None), datetime)
        and item.acquired_at.tzinfo is not None
    )


def _rejection_reason(item: CdseStacItem, maximum_cloud: float) -> str | None:
    cloud = item.cloud_cover_percent
    if cloud is not None and (
        not isinstance(cloud, int | float)
        or isinstance(cloud, bool)
        or cloud > maximum_cloud
    ):
        return REJECTED_CLOUD_REASON
    return None


def _source_provenance(
    item: CdseStacItem, *, discovered_at: datetime, geometry_hash: str
) -> dict[str, Any]:
    allowed = {"provider", "collection", "stac_item_id", "datetime", "eo:cloud_cover"}
    raw = getattr(item, "provider_metadata", {})
    metadata = {key: value for key, value in raw.items() if key in allowed}
    metadata.update(
        {
            "provider": item.provider,
            "collection": item.collection,
            "provider_item_id": item.item_id,
            "acquired_at": item.acquired_at.astimezone(UTC).isoformat(),
            "discovered_at": discovered_at.astimezone(UTC).isoformat(),
            "geometry_hash": geometry_hash,
        }
    )
    return metadata


def _geometry_hash(geometry: dict[str, Any]) -> str:
    from packages.geospatial.agriscope_geospatial.field_geometry import geometry_fingerprint

    return geometry_fingerprint(geometry)
