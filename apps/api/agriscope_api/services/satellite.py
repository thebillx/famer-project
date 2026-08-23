"""Satellite metadata discovery service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from apps.api.agriscope_api.core.config import SettingsSnapshot
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.providers.cdse_process import (
    NDVI_SUMMARY_EVALSCRIPT_VERSION,
    CdseProcessClient,
    CdseProcessNoData,
    CdseProcessRateLimited,
    CdseProcessRequestTooLarge,
    CdseProcessUnavailable,
)
from apps.api.agriscope_api.providers.cdse_stac import CdseStacClient, CdseStacUnavailable
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.farms import FieldRecord, FarmRepository
from apps.api.agriscope_api.repositories.satellite import AcquisitionRecord, SatelliteRepository


@dataclass(frozen=True)
class SatelliteResponse:
    field_id: UUID
    status: Literal["available", "not_searched", "no_data", "temporarily_unavailable"]
    acquisition: AcquisitionRecord | None
    searched_at: datetime | None
    message_th: str


@dataclass(frozen=True)
class SatellitePreviewResponse:
    field_id: UUID
    image_png: bytes
    valid_pixel_ratio: float
    acquired_at: datetime


@dataclass(frozen=True)
class SatelliteNdviSummaryResponse:
    field_id: UUID
    acquired_at: datetime
    algorithm_version: str
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    ndvi_stddev: float
    sample_count: int
    valid_sample_count: int
    valid_pixel_ratio: float


class SatelliteService:
    def __init__(
        self,
        session,
        settings: SettingsSnapshot,
        provider: CdseStacClient | None = None,
        process_provider: CdseProcessClient | None = None,
    ) -> None:
        self.session = session
        self.settings = settings
        self.provider = provider or CdseStacClient(
            stac_url=settings.cdse_stac_url,
            timeout_seconds=settings.satellite_search_timeout_seconds,
            lookback_days=settings.satellite_search_lookback_days,
            max_cloud_cover_percent=settings.satellite_max_cloud_cover_percent,
        )
        self.process_provider = process_provider

    async def search_latest(
        self,
        *,
        user_id: UUID,
        field_id: UUID,
        authorized_field: FieldRecord | None = None,
    ) -> SatelliteResponse:
        field = authorized_field or await self.get_authorized_field(
            user_id=user_id,
            field_id=field_id,
        )
        if field.id != field_id:
            raise ValueError("authorized field does not match requested field")
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
        field = await self.get_authorized_field(user_id=user_id, field_id=field_id)
        acquisition = await SatelliteRepository(
            self.session,
            TenantScope(organization_id=field.organization_id, user_id=user_id, role="viewer"),
        ).get_latest_acquisition(field.id)
        return SatelliteResponse(
            field_id=field.id,
            status="available" if acquisition else "not_searched",
            acquisition=acquisition,
            searched_at=acquisition.searched_at if acquisition else None,
            message_th="พบภาพดาวเทียมล่าสุด" if acquisition else "ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้",
        )

    async def get_preview(
        self,
        *,
        user_id: UUID,
        field_id: UUID,
        authorized_field: FieldRecord | None = None,
    ) -> SatellitePreviewResponse:
        field = authorized_field or await self.get_authorized_field(
            user_id=user_id,
            field_id=field_id,
        )
        if field.id != field_id:
            raise ValueError("authorized field does not match requested field")
        acquisition = await SatelliteRepository(
            self.session,
            TenantScope(organization_id=field.organization_id, user_id=user_id, role="viewer"),
        ).get_latest_acquisition(field.id)
        if acquisition is None:
            raise ApiException(
                "satellite_not_searched",
                "Search for satellite metadata before requesting a preview",
                409,
            )
        process_provider = self.process_provider or CdseProcessClient(
            client_id=self.settings.cdse_client_id,
            client_secret=self.settings.cdse_client_secret,
            token_url=self.settings.cdse_token_url,
            process_url=self.settings.cdse_process_url,
            statistics_url=self.settings.cdse_statistical_url,
            timeout_seconds=self.settings.satellite_search_timeout_seconds,
            max_cloud_cover_percent=self.settings.satellite_max_cloud_cover_percent,
        )
        try:
            preview = await process_provider.render_true_color(
                field.geometry,
                acquired_at=acquisition.acquired_at,
            )
        except CdseProcessRateLimited as exc:
            raise ApiException(
                "rate_limited",
                "Too many requests",
                429,
                {"retry_after": 60},
            ) from exc
        except CdseProcessNoData as exc:
            raise ApiException(
                "satellite_no_data",
                "No preview pixels are available for this acquisition",
                422,
            ) from exc
        except CdseProcessUnavailable as exc:
            raise ApiException(
                "satellite_temporarily_unavailable",
                "Satellite preview is temporarily unavailable",
                503,
            ) from exc
        if preview.valid_pixel_ratio < self.settings.satellite_preview_min_valid_ratio:
            raise ApiException(
                "satellite_insufficient_quality",
                "Satellite preview coverage is insufficient",
                422,
            )
        return SatellitePreviewResponse(
            field_id=field.id,
            image_png=preview.image_png,
            valid_pixel_ratio=preview.valid_pixel_ratio,
            acquired_at=acquisition.acquired_at,
        )

    async def get_ndvi_summary(
        self,
        *,
        user_id: UUID,
        field_id: UUID,
        authorized_field: FieldRecord | None = None,
    ) -> SatelliteNdviSummaryResponse:
        field = authorized_field or await self.get_authorized_field(
            user_id=user_id,
            field_id=field_id,
        )
        if field.id != field_id:
            raise ValueError("authorized field does not match requested field")
        acquisition = await SatelliteRepository(
            self.session,
            TenantScope(organization_id=field.organization_id, user_id=user_id, role="viewer"),
        ).get_latest_acquisition(field.id)
        if acquisition is None:
            raise ApiException(
                "satellite_not_searched",
                "Search for satellite metadata before requesting NDVI statistics",
                409,
            )
        process_provider = self.process_provider or CdseProcessClient(
            client_id=self.settings.cdse_client_id,
            client_secret=self.settings.cdse_client_secret,
            token_url=self.settings.cdse_token_url,
            process_url=self.settings.cdse_process_url,
            statistics_url=self.settings.cdse_statistical_url,
            timeout_seconds=self.settings.satellite_search_timeout_seconds,
            max_cloud_cover_percent=self.settings.satellite_max_cloud_cover_percent,
        )
        try:
            summary = await process_provider.summarize_ndvi(
                field.geometry,
                acquired_at=acquisition.acquired_at,
            )
        except CdseProcessRateLimited as exc:
            raise ApiException(
                "rate_limited",
                "Too many requests",
                429,
                {"retry_after": 60},
            ) from exc
        except CdseProcessNoData as exc:
            raise ApiException(
                "satellite_no_data",
                "No valid NDVI samples are available for this acquisition day",
                422,
            ) from exc
        except CdseProcessRequestTooLarge as exc:
            raise ApiException(
                "satellite_request_too_large",
                "Field extent exceeds the per-request satellite statistics limit",
                422,
            ) from exc
        except CdseProcessUnavailable as exc:
            raise ApiException(
                "satellite_temporarily_unavailable",
                "Satellite statistics are temporarily unavailable",
                503,
            ) from exc
        if summary.valid_pixel_ratio < self.settings.satellite_analysis_min_valid_ratio:
            raise ApiException(
                "satellite_insufficient_quality",
                "Satellite statistic coverage is insufficient",
                422,
            )
        return SatelliteNdviSummaryResponse(
            field_id=field.id,
            acquired_at=acquisition.acquired_at,
            algorithm_version=NDVI_SUMMARY_EVALSCRIPT_VERSION,
            ndvi_mean=summary.mean,
            ndvi_min=summary.minimum,
            ndvi_max=summary.maximum,
            ndvi_stddev=summary.standard_deviation,
            sample_count=summary.sample_count,
            valid_sample_count=summary.valid_sample_count,
            valid_pixel_ratio=summary.valid_pixel_ratio,
        )

    async def get_authorized_field(self, *, user_id: UUID, field_id: UUID) -> FieldRecord:
        field = await FarmRepository(
            self.session,
            TenantScope(organization_id=UUID(int=0), user_id=user_id, role="viewer"),
        ).get_field(field_id)
        if field is None:
            raise ApiException("not_found", "Resource not found", 404)
        return field


def cloud_decimal_to_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None
