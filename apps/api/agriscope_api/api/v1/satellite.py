"""Satellite metadata API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, TypeAlias

try:
    from fastapi import APIRouter, Depends, Request, Response
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Depends = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]
    Response = object  # type: ignore[assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*args, **kwargs):  # type: ignore[no-untyped-def]
        return None


class SatelliteAcquisitionResponse(BaseModel):
    provider: str
    collection: str
    item_id: str
    acquired_at: datetime
    cloud_cover_percent: float | None


class SatelliteAvailableResponse(BaseModel):
    field_id: str
    status: Literal["available"]
    acquisition: SatelliteAcquisitionResponse
    searched_at: datetime
    message_th: str


class SatelliteNotSearchedResponse(BaseModel):
    field_id: str
    status: Literal["not_searched"]
    acquisition: None
    searched_at: None
    message_th: str


class SatelliteEmptySearchResponse(BaseModel):
    field_id: str
    status: Literal["no_data", "temporarily_unavailable"]
    acquisition: None
    searched_at: datetime
    message_th: str


class SatelliteNdviSummaryResponse(BaseModel):
    field_id: str
    acquired_at: datetime
    period_basis: Literal["utc_day"] = "utc_day"
    algorithm_version: Literal["agriscope-ndvi-summary-v1"]
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    ndvi_stddev: float
    sample_count: int
    valid_sample_count: int
    valid_pixel_ratio: float


class ObservationResponse(BaseModel):
    observation_id: str
    field_id: str
    acquired_at: datetime
    cloud_percent: float | None
    source: str
    status: Literal["USABLE", "POOR_QUALITY", "UNAVAILABLE"]
    imagery_available: bool
    ndvi_available: bool


class ObservationNdviSummaryResponse(BaseModel):
    observation_id: str
    field_id: str
    acquired_at: datetime
    algorithm_version: str
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    ndvi_stddev: float
    sample_count: int
    valid_sample_count: int
    valid_pixel_ratio: float


class ObservationRasterResponse(BaseModel):
    observation_id: str
    acquired_at: datetime
    crs: str
    bounds: list[float]
    width: int
    height: int
    nodata: float
    value_min: float
    value_max: float
    valid_pixel_ratio: float
    image_url: str


class ChangeResponse(BaseModel):
    field_id: str
    before_observation_id: str
    after_observation_id: str
    before_ndvi: float
    after_ndvi: float
    ndvi_delta: float
    changed_area_sqm: float
    changed_area_rai: float
    threshold: float
    status: Literal["USABLE"]
    geometry: dict[str, Any]


SatelliteLatestResponse: TypeAlias = Annotated[
    SatelliteAvailableResponse | SatelliteNotSearchedResponse | SatelliteEmptySearchResponse,
    Field(discriminator="status"),
]
SatelliteSearchResponse: TypeAlias = Annotated[
    SatelliteAvailableResponse | SatelliteEmptySearchResponse,
    Field(discriminator="status"),
]


router = APIRouter(prefix="/fields", tags=["satellite"]) if APIRouter else None


if router:
    from uuid import UUID

    from apps.api.agriscope_api.core.csrf import validate_csrf
    from apps.api.agriscope_api.core.rate_limit import RateLimitBucket, enforce_rate_limit
    from apps.api.agriscope_api.dependencies.auth import get_current_user
    from apps.api.agriscope_api.dependencies.runtime import get_db_session, get_settings
    from apps.api.agriscope_api.services.satellite import SatelliteService, cloud_decimal_to_float

    def _satellite_limits(request: Request, user_id, field_id, settings) -> None:
        enforce_rate_limit(request, [
            RateLimitBucket("satellite-subject", str(user_id), settings.rate_limit_satellite_subject),
            RateLimitBucket("satellite-field", f"{user_id}:{field_id}", settings.rate_limit_satellite_field),
        ])

    @router.get("/{field_id}/observations", response_model=list[ObservationResponse])
    async def list_observations(field_id: UUID, request: Request,
        session=Depends(get_db_session), settings=Depends(get_settings)) -> list[ObservationResponse]:
        user = await get_current_user(request, session)
        rows = await SatelliteService(session, settings).list_observations(user_id=user.id, field_id=field_id)
        return [ObservationResponse(**{**row.__dict__, "observation_id": str(row.observation_id), "field_id": str(row.field_id)}) for row in rows]

    @router.get("/{field_id}/observations/{observation_id}/preview", response_class=Response,
        responses={200: {"content": {"image/png": {}}}})
    async def get_observation_preview(field_id: UUID, observation_id: UUID, request: Request,
        session=Depends(get_db_session), settings=Depends(get_settings)) -> Response:
        user = await get_current_user(request, session)
        service = SatelliteService(session, settings, process_provider=getattr(request.app.state, "cdse_process_provider", None))
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        _satellite_limits(request, user.id, field.id, settings)
        value = await service.get_observation_preview(user_id=user.id, field_id=field_id, observation_id=observation_id, authorized_field=field)
        return Response(content=value.image_png, media_type="image/png", headers={"Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="observation-preview.png"', "X-Content-Type-Options": "nosniff"})

    @router.get("/{field_id}/observations/{observation_id}/ndvi-summary", response_model=ObservationNdviSummaryResponse)
    async def get_observation_ndvi(field_id: UUID, observation_id: UUID, request: Request,
        response: Response, session=Depends(get_db_session), settings=Depends(get_settings)) -> ObservationNdviSummaryResponse:
        user = await get_current_user(request, session)
        service = SatelliteService(session, settings, process_provider=getattr(request.app.state, "cdse_process_provider", None))
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        _satellite_limits(request, user.id, field.id, settings)
        value = await service.get_observation_analysis(user_id=user.id, field_id=field_id, observation_id=observation_id, authorized_field=field)
        response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
        return ObservationNdviSummaryResponse(observation_id=str(value.observation_id), field_id=str(value.field_id), acquired_at=value.acquired_at, algorithm_version=value.algorithm_version, ndvi_mean=float(value.ndvi_mean), ndvi_min=float(value.ndvi_min), ndvi_max=float(value.ndvi_max), ndvi_stddev=float(value.ndvi_stddev), sample_count=value.sample_count, valid_sample_count=value.valid_sample_count, valid_pixel_ratio=float(value.valid_pixel_ratio))

    @router.get("/{field_id}/observations/{observation_id}/ndvi-raster", response_model=ObservationRasterResponse)
    async def get_observation_raster(field_id: UUID, observation_id: UUID, request: Request,
        response: Response, session=Depends(get_db_session), settings=Depends(get_settings)) -> ObservationRasterResponse:
        user = await get_current_user(request, session)
        service = SatelliteService(session, settings, process_provider=getattr(request.app.state, "cdse_process_provider", None))
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        _satellite_limits(request, user.id, field.id, settings)
        value = await service.get_observation_raster(user_id=user.id, field_id=field_id, observation_id=observation_id, authorized_field=field)
        response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
        return ObservationRasterResponse(**{key: value.__dict__[key] for key in ("acquired_at", "crs", "bounds", "width", "height", "nodata", "value_min", "value_max", "valid_pixel_ratio")}, observation_id=str(value.observation_id), image_url=f"/api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster/image")

    @router.get("/{field_id}/observations/{observation_id}/ndvi-raster/image", response_class=Response,
        responses={200: {"content": {"image/png": {}}}})
    async def get_observation_raster_image(field_id: UUID, observation_id: UUID, request: Request,
        session=Depends(get_db_session), settings=Depends(get_settings)) -> Response:
        user = await get_current_user(request, session)
        service = SatelliteService(session, settings, process_provider=getattr(request.app.state, "cdse_process_provider", None))
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        _satellite_limits(request, user.id, field.id, settings)
        value = await service.get_observation_raster(user_id=user.id, field_id=field_id, observation_id=observation_id, authorized_field=field)
        return Response(content=value.image_png, media_type="image/png", headers={"Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="ndvi-raster.png"', "X-Content-Type-Options": "nosniff"})

    @router.get("/{field_id}/change", response_model=ChangeResponse)
    async def get_change(field_id: UUID, before: UUID, after: UUID, request: Request,
        response: Response, session=Depends(get_db_session), settings=Depends(get_settings)) -> ChangeResponse:
        user = await get_current_user(request, session)
        service = SatelliteService(session, settings, process_provider=getattr(request.app.state, "cdse_process_provider", None))
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        _satellite_limits(request, user.id, field.id, settings)
        value = await service.compare(user_id=user.id, field_id=field_id, before=before, after=after)
        response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
        return ChangeResponse(**{**value.__dict__, "field_id": str(value.field_id), "before_observation_id": str(value.before_observation_id), "after_observation_id": str(value.after_observation_id)})

    def _response(result) -> SatelliteLatestResponse:
        field_id = str(result.field_id)
        if (
            result.status == "available"
            and result.acquisition is not None
            and result.searched_at is not None
        ):
            acquisition = SatelliteAcquisitionResponse(
                provider=result.acquisition.provider,
                collection=result.acquisition.collection,
                item_id=result.acquisition.provider_item_id,
                acquired_at=result.acquisition.acquired_at,
                cloud_cover_percent=cloud_decimal_to_float(result.acquisition.cloud_cover_percent),
            )
            return SatelliteAvailableResponse(
                field_id=field_id,
                status="available",
                acquisition=acquisition,
                searched_at=result.searched_at,
                message_th=result.message_th,
            )
        if (
            result.status == "not_searched"
            and result.acquisition is None
            and result.searched_at is None
        ):
            return SatelliteNotSearchedResponse(
                field_id=field_id,
                status="not_searched",
                acquisition=None,
                searched_at=None,
                message_th=result.message_th,
            )
        if (
            result.status in {"no_data", "temporarily_unavailable"}
            and result.acquisition is None
            and result.searched_at is not None
        ):
            return SatelliteEmptySearchResponse(
                field_id=field_id,
                status=result.status,
                acquisition=None,
                searched_at=result.searched_at,
                message_th=result.message_th,
            )
        raise ValueError("satellite response invariant violated")

    def _search_response(result) -> SatelliteSearchResponse:
        response = _response(result)
        if isinstance(response, SatelliteNotSearchedResponse):
            raise ValueError("satellite search cannot return not_searched")
        return response

    @router.post("/{field_id}/satellite/search-latest", response_model=SatelliteSearchResponse)
    async def search_latest(
        field_id: UUID,
        request: Request,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> SatelliteSearchResponse:
        user = await get_current_user(request, session)
        validate_csrf(request)
        provider = getattr(request.app.state, "cdse_stac_provider", None)
        service = SatelliteService(session, settings, provider=provider)
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        enforce_rate_limit(
            request,
            [
                RateLimitBucket(
                    "satellite-subject",
                    str(user.id),
                    settings.rate_limit_satellite_subject,
                ),
                RateLimitBucket(
                    "satellite-field",
                    f"{user.id}:{field.id}",
                    settings.rate_limit_satellite_field,
                ),
            ],
        )
        result = await service.search_latest(
            user_id=user.id,
            field_id=field_id,
            authorized_field=field,
        )
        return _search_response(result)

    @router.get("/{field_id}/satellite/latest", response_model=SatelliteLatestResponse)
    async def get_latest(
        field_id: UUID,
        request: Request,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> SatelliteLatestResponse:
        user = await get_current_user(request, session)
        result = await SatelliteService(session, settings).get_latest(
            user_id=user.id, field_id=field_id
        )
        return _response(result)

    @router.get(
        "/{field_id}/satellite/preview",
        response_class=Response,
        responses={200: {"content": {"image/png": {}}}},
    )
    async def get_preview(
        field_id: UUID,
        request: Request,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> Response:
        user = await get_current_user(request, session)
        process_provider = getattr(request.app.state, "cdse_process_provider", None)
        service = SatelliteService(session, settings, process_provider=process_provider)
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        enforce_rate_limit(
            request,
            [
                RateLimitBucket(
                    "satellite-subject",
                    str(user.id),
                    settings.rate_limit_satellite_subject,
                ),
                RateLimitBucket(
                    "satellite-field",
                    f"{user.id}:{field.id}",
                    settings.rate_limit_satellite_field,
                ),
            ],
        )
        preview = await service.get_preview(
            user_id=user.id,
            field_id=field_id,
            authorized_field=field,
        )
        return Response(
            content=preview.image_png,
            media_type="image/png",
            headers={
                "Cache-Control": "private, no-store",
                "Content-Disposition": 'inline; filename="satellite-preview.png"',
                "X-Content-Type-Options": "nosniff",
            },
        )

    @router.get(
        "/{field_id}/satellite/ndvi-summary",
        response_model=SatelliteNdviSummaryResponse,
    )
    async def get_ndvi_summary(
        field_id: UUID,
        request: Request,
        response: Response,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> SatelliteNdviSummaryResponse:
        user = await get_current_user(request, session)
        process_provider = getattr(request.app.state, "cdse_process_provider", None)
        service = SatelliteService(session, settings, process_provider=process_provider)
        field = await service.get_authorized_field(user_id=user.id, field_id=field_id)
        enforce_rate_limit(
            request,
            [
                RateLimitBucket(
                    "satellite-subject",
                    str(user.id),
                    settings.rate_limit_satellite_subject,
                ),
                RateLimitBucket(
                    "satellite-field",
                    f"{user.id}:{field.id}",
                    settings.rate_limit_satellite_field,
                ),
            ],
        )
        summary = await service.get_ndvi_summary(
            user_id=user.id,
            field_id=field_id,
            authorized_field=field,
        )
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return SatelliteNdviSummaryResponse(
            field_id=str(summary.field_id),
            acquired_at=summary.acquired_at,
            algorithm_version="agriscope-ndvi-summary-v1",
            ndvi_mean=summary.ndvi_mean,
            ndvi_min=summary.ndvi_min,
            ndvi_max=summary.ndvi_max,
            ndvi_stddev=summary.ndvi_stddev,
            sample_count=summary.sample_count,
            valid_sample_count=summary.valid_sample_count,
            valid_pixel_ratio=summary.valid_pixel_ratio,
        )
