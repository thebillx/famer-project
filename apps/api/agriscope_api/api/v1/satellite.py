"""Satellite metadata API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, TypeAlias

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
