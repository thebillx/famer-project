"""Satellite metadata discovery service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from apps.api.agriscope_api.core.config import SettingsSnapshot
from apps.api.agriscope_api.providers.cdse_stac import (
    CdseStacClient,
    CdseStacUnavailable,
)
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.farms import FieldRecord, FarmRepository
from apps.api.agriscope_api.repositories.satellite import AcquisitionRecord, SatelliteRepository


@dataclass(frozen=True)
class SatelliteResponse:
    field_id: UUID
    status: str
    acquisition: AcquisitionRecord | None
    searched_at: datetime
    message_th: str


class SatelliteService:
    def __init__(self, session, settings: SettingsSnapshot, provider: CdseStacClient | None = None) -> None:
        self.session = session
        self.settings = settings
        self.provider = provider or CdseStacClient(
            stac_url=settings.cdse_stac_url,
            timeout_seconds=settings.satellite_search_timeout_seconds,
            lookback_days=settings.satellite_search_lookback_days,
            max_cloud_cover_percent=settings.satellite_max_cloud_cover_percent,
        )

    async def search_latest(self, *, user_id: UUID, field_id: UUID) -> SatelliteResponse:
        field = await self._get_field(user_id=user_id, field_id=field_id)
        searched_at = datetime.now(UTC)
        try:
            provider_result = await self.provider.search_latest(field.geometry, now=searched_at)
        except CdseStacUnavailable:
            return SatelliteResponse(
                field_id=field.id,
                status="temporarily_unavailable",
                acquisition=None,
                searched_at=searched_at,
                message_th="ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง",
            )
        if provider_result.item is None:
            return SatelliteResponse(
                field_id=field.id,
                status="no_data",
                acquisition=None,
                searched_at=provider_result.searched_at,
                message_th="ยังไม่พบภาพ Sentinel-2 ที่ตรงกับเงื่อนไขในช่วงเวลาที่ค้นหา",
            )
        acquisition = await SatelliteRepository(
            self.session,
            TenantScope(
                organization_id=field.organization_id,
                user_id=user_id,
                role="viewer",
            ),
        ).upsert_acquisition(
            field_id=field.id,
            provider=provider_result.item.provider,
            collection=provider_result.item.collection,
            provider_item_id=provider_result.item.item_id,
            acquired_at=provider_result.item.acquired_at,
            cloud_cover_percent=provider_result.item.cloud_cover_percent,
            searched_at=provider_result.searched_at,
        )
        return SatelliteResponse(
            field_id=field.id,
            status="available",
            acquisition=acquisition,
            searched_at=provider_result.searched_at,
            message_th="พบภาพดาวเทียมล่าสุด",
        )

    async def get_latest(self, *, user_id: UUID, field_id: UUID) -> SatelliteResponse:
        field = await self._get_field(user_id=user_id, field_id=field_id)
        acquisition = await SatelliteRepository(
            self.session,
            TenantScope(organization_id=field.organization_id, user_id=user_id, role="viewer"),
        ).get_latest_acquisition(field.id)
        searched_at = acquisition.searched_at if acquisition else datetime.now(UTC)
        return SatelliteResponse(
            field_id=field.id,
            status="available" if acquisition else "no_data",
            acquisition=acquisition,
            searched_at=searched_at,
            message_th="พบภาพดาวเทียมล่าสุด"
            if acquisition
            else "ยังไม่พบข้อมูลในช่วงเวลาที่ค้นหา",
        )

    async def _get_field(self, *, user_id: UUID, field_id: UUID) -> FieldRecord:
        field = await FarmRepository(
            self.session,
            TenantScope(organization_id=UUID(int=0), user_id=user_id, role="viewer"),
        ).get_field(field_id)
        if field is None:
            from apps.api.agriscope_api.core.errors import ApiException

            raise ApiException("not_found", "Resource not found", 404)
        return field


def cloud_decimal_to_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None
