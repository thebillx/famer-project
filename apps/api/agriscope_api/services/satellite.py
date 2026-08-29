"""Satellite metadata discovery service."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from apps.api.agriscope_api.core.config import SettingsSnapshot
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.providers.cdse_process import (
    NDVI_SUMMARY_EVALSCRIPT_VERSION,
    NDVI_RASTER_EVALSCRIPT_VERSION,
    CdseProcessClient,
    CdseProcessNoData,
    CdseProcessRateLimited,
    CdseProcessRequestTooLarge,
    CdseProcessUnavailable,
)
from apps.api.agriscope_api.providers.cdse_stac import CdseStacClient, CdseStacUnavailable
from apps.api.agriscope_api.repositories.base import TenantScope
from apps.api.agriscope_api.repositories.farms import FieldRecord, FarmRepository
from apps.api.agriscope_api.repositories.satellite import AcquisitionRecord, ObservationAnalysisRecord, SatelliteRepository

OBSERVATION_ANALYSIS_VERSION = f"{NDVI_SUMMARY_EVALSCRIPT_VERSION}+{NDVI_RASTER_EVALSCRIPT_VERSION}"
CHANGE_THRESHOLD = -0.10


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


@dataclass(frozen=True)
class ObservationResponse:
    observation_id: UUID
    field_id: UUID
    acquired_at: datetime
    cloud_percent: float | None
    source: str
    status: Literal["USABLE", "POOR_QUALITY", "UNAVAILABLE"]
    imagery_available: bool
    ndvi_available: bool


@dataclass(frozen=True)
class ObservationRasterResponse:
    observation_id: UUID
    acquired_at: datetime
    crs: str
    bounds: list[float]
    width: int
    height: int
    nodata: float
    value_min: float
    value_max: float
    valid_pixel_ratio: float
    image_png: bytes


@dataclass(frozen=True)
class ChangeResponse:
    field_id: UUID
    before_observation_id: UUID
    after_observation_id: UUID
    before_ndvi: float
    after_ndvi: float
    ndvi_delta: float
    changed_area_sqm: float
    changed_area_rai: float
    threshold: float
    status: Literal["USABLE"]
    geometry: dict[str, Any]


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

    async def list_observations(self, *, user_id: UUID, field_id: UUID) -> list[ObservationResponse]:
        field = await self.get_authorized_field(user_id=user_id, field_id=field_id)
        repository = SatelliteRepository(self.session, TenantScope(field.organization_id, user_id, "viewer"))
        rows = await repository.list_observations(field.id)
        cached_ids = await repository.list_cached_observation_ids(field.id, OBSERVATION_ANALYSIS_VERSION)
        result: list[ObservationResponse] = []
        for row in rows:
            cloud = cloud_decimal_to_float(row.cloud_cover_percent)
            status: Literal["USABLE", "POOR_QUALITY", "UNAVAILABLE"]
            if row.search_status != "available":
                status = "UNAVAILABLE"
            elif cloud is not None and cloud > self.settings.satellite_max_cloud_cover_percent:
                status = "POOR_QUALITY"
            else:
                status = "USABLE"
            result.append(ObservationResponse(row.id, row.field_id, row.acquired_at, cloud,
                "Sentinel-2", status, row.search_status == "available", row.id in cached_ids))
        return result

    async def get_observation_preview(self, *, user_id: UUID, field_id: UUID,
        observation_id: UUID, authorized_field: FieldRecord | None = None) -> SatellitePreviewResponse:
        field, observation, _ = await self._observation_context(user_id, field_id, observation_id, authorized_field)
        provider = self._process_provider()
        try:
            preview = await provider.render_true_color(field.geometry, acquired_at=observation.acquired_at, exact_observation=True)
        except CdseProcessNoData as exc:
            raise ApiException("satellite_no_data", "No preview pixels are available for this observation", 422) from exc
        except CdseProcessRateLimited as exc:
            raise ApiException("rate_limited", "Too many requests", 429, {"retry_after": 60}) from exc
        except CdseProcessUnavailable as exc:
            raise ApiException("satellite_temporarily_unavailable", "Satellite preview is temporarily unavailable", 503) from exc
        if preview.valid_pixel_ratio < self.settings.satellite_preview_min_valid_ratio:
            raise ApiException("satellite_insufficient_quality", "Satellite preview coverage is insufficient", 422)
        return SatellitePreviewResponse(field.id, preview.image_png, preview.valid_pixel_ratio, observation.acquired_at)

    async def get_observation_analysis(self, *, user_id: UUID, field_id: UUID,
        observation_id: UUID, authorized_field: FieldRecord | None = None) -> ObservationAnalysisRecord:
        field, observation, repository = await self._observation_context(user_id, field_id, observation_id, authorized_field)
        cached = await repository.get_analysis(observation.id, OBSERVATION_ANALYSIS_VERSION)
        if cached is not None:
            return cached
        cloud = cloud_decimal_to_float(observation.cloud_cover_percent)
        if cloud is not None and cloud > self.settings.satellite_max_cloud_cover_percent:
            raise ApiException("satellite_insufficient_quality", "Observation cloud coverage is too high", 422)
        provider = self._process_provider()
        try:
            summary = await provider.summarize_ndvi(field.geometry, acquired_at=observation.acquired_at, exact_observation=True)
            raster = await provider.render_ndvi_raster(field.geometry, acquired_at=observation.acquired_at)
        except CdseProcessNoData as exc:
            raise ApiException("satellite_no_data", "No valid NDVI data are available for this observation", 422) from exc
        except CdseProcessRateLimited as exc:
            raise ApiException("rate_limited", "Too many requests", 429, {"retry_after": 60}) from exc
        except CdseProcessRequestTooLarge as exc:
            raise ApiException("satellite_request_too_large", "Field extent exceeds the analysis limit", 422) from exc
        except CdseProcessUnavailable as exc:
            raise ApiException("satellite_temporarily_unavailable", "Satellite analysis is temporarily unavailable", 503) from exc
        valid_ratio = min(summary.valid_pixel_ratio, raster.valid_pixel_ratio)
        if valid_ratio < self.settings.satellite_analysis_min_valid_ratio:
            raise ApiException("satellite_insufficient_quality", "Satellite analysis coverage is insufficient", 422,
                {"valid_pixel_ratio": valid_ratio, "minimum_required_ratio": self.settings.satellite_analysis_min_valid_ratio})
        return await repository.upsert_analysis(observation=observation,
            algorithm_version=OBSERVATION_ANALYSIS_VERSION, ndvi_mean=summary.mean,
            ndvi_min=summary.minimum, ndvi_max=summary.maximum,
            ndvi_stddev=summary.standard_deviation, sample_count=summary.sample_count,
            valid_sample_count=summary.valid_sample_count, valid_pixel_ratio=valid_ratio,
            raster_tiff=raster.geotiff, raster_crs=raster.crs,
            raster_bounds=list(raster.bounds), raster_width=raster.width, raster_height=raster.height)

    async def get_observation_raster(self, **kwargs) -> ObservationRasterResponse:
        analysis = await self.get_observation_analysis(**kwargs)
        return ObservationRasterResponse(analysis.observation_id, analysis.acquired_at,
            analysis.raster_crs, analysis.raster_bounds, analysis.raster_width,
            analysis.raster_height, -9999.0, -1.0, 1.0,
            float(analysis.valid_pixel_ratio), _render_ndvi_png(analysis.raster_tiff))

    async def compare(self, *, user_id: UUID, field_id: UUID, before: UUID, after: UUID) -> ChangeResponse:
        if before == after:
            raise ApiException("invalid_observation_order", "Before and after observations must differ", 422)
        before_context = await self._observation_context(user_id, field_id, before)
        after_context = await self._observation_context(user_id, field_id, after, before_context[0])
        if before_context[1].acquired_at >= after_context[1].acquired_at:
            raise ApiException("invalid_observation_order", "Before observation must be earlier than after observation", 422)
        before_analysis = await self.get_observation_analysis(user_id=user_id, field_id=field_id, observation_id=before, authorized_field=before_context[0])
        after_analysis = await self.get_observation_analysis(user_id=user_id, field_id=field_id, observation_id=after, authorized_field=before_context[0])
        geometry, area_sqm = _change_geometry(before_analysis.raster_tiff, after_analysis.raster_tiff, before_context[0].geometry)
        return ChangeResponse(field_id, before, after, float(before_analysis.ndvi_mean),
            float(after_analysis.ndvi_mean), float(after_analysis.ndvi_mean-before_analysis.ndvi_mean),
            area_sqm, round(area_sqm/1600, 4), CHANGE_THRESHOLD, "USABLE", geometry)

    async def _observation_context(self, user_id: UUID, field_id: UUID, observation_id: UUID,
        authorized_field: FieldRecord | None = None) -> tuple[FieldRecord, AcquisitionRecord, SatelliteRepository]:
        field = authorized_field or await self.get_authorized_field(user_id=user_id, field_id=field_id)
        if field.id != field_id:
            raise ValueError("authorized field does not match requested field")
        repository = SatelliteRepository(self.session, TenantScope(field.organization_id, user_id, "viewer"))
        observation = await repository.get_observation(field.id, observation_id)
        if observation is None:
            raise ApiException("not_found", "Resource not found", 404)
        if observation.search_status != "available":
            raise ApiException("observation_unavailable", "Observation is not available for analysis", 422)
        return field, observation, repository

    def _process_provider(self) -> CdseProcessClient:
        return self.process_provider or CdseProcessClient(client_id=self.settings.cdse_client_id,
            client_secret=self.settings.cdse_client_secret, token_url=self.settings.cdse_token_url,
            process_url=self.settings.cdse_process_url, statistics_url=self.settings.cdse_statistical_url,
            timeout_seconds=self.settings.satellite_search_timeout_seconds,
            max_cloud_cover_percent=self.settings.satellite_max_cloud_cover_percent)

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


def _read_ndvi(tiff: bytes):
    from rasterio.io import MemoryFile
    with MemoryFile(tiff) as memory:
        with memory.open() as dataset:
            return dataset.read(1), dataset.read(2) > 0.5, dataset.transform, dataset.crs


def _render_ndvi_png(tiff: bytes) -> bytes:
    import numpy as np
    from rasterio.io import MemoryFile
    values, valid, _, _ = _read_ndvi(tiff)
    stops = np.array([[-1, 112, 91, 65], [0.2, 151, 130, 74], [0.4, 178, 166, 82],
        [0.6, 104, 137, 67], [0.8, 50, 100, 55], [1, 31, 75, 45]], dtype=float)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    for channel in range(3):
        rgba[..., channel] = np.interp(values, stops[:, 0], stops[:, channel+1]).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 190, 0).astype(np.uint8)
    profile = {"driver": "PNG", "width": values.shape[1], "height": values.shape[0], "count": 4, "dtype": "uint8"}
    with MemoryFile() as memory:
        with memory.open(**profile) as dataset:
            dataset.write(np.moveaxis(rgba, 2, 0))
        return memory.read()


def _change_geometry(before_tiff: bytes, after_tiff: bytes, field_geojson: dict[str, Any]) -> tuple[dict[str, Any], float]:
    import numpy as np
    from rasterio.features import shapes
    from rasterio.warp import transform_geom
    from shapely.geometry import GeometryCollection, MultiPolygon, mapping, shape
    from shapely.ops import unary_union
    before, before_valid, before_transform, before_crs = _read_ndvi(before_tiff)
    after, after_valid, after_transform, after_crs = _read_ndvi(after_tiff)
    if before.shape != after.shape or before_transform != after_transform or before_crs != after_crs:
        raise ApiException("incompatible_observations", "Observation rasters are not spatially aligned", 422)
    mask = before_valid & after_valid & np.isfinite(before) & np.isfinite(after) & ((after-before) <= CHANGE_THRESHOLD)
    polygons = [shape(geometry) for geometry, value in shapes(mask.astype("uint8"), mask=mask, transform=after_transform) if value == 1]
    changed = unary_union(polygons).intersection(shape(field_geojson)) if polygons else GeometryCollection()
    if changed.is_empty:
        geometry = {"type": "MultiPolygon", "coordinates": []}
        return geometry, 0.0
    if changed.geom_type == "Polygon":
        changed = MultiPolygon([changed])
    centroid_longitude = changed.centroid.x
    utm_zone = max(1, min(60, int((centroid_longitude + 180) // 6) + 1))
    projected = shape(transform_geom("EPSG:4326", f"EPSG:326{utm_zone:02d}", mapping(changed), precision=-1))
    area_sqm = float(projected.area)
    return mapping(changed), area_sqm
