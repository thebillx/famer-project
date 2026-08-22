"""Satellite metadata API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, TypeAlias

try:
    from fastapi import APIRouter, Depends, Request
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Depends = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]

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
        if result.status == "available" and result.acquisition is not None and result.searched_at is not None:
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
        if result.status == "not_searched" and result.acquisition is None and result.searched_at is None:
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
        result = await SatelliteService(session, settings).get_latest(user_id=user.id, field_id=field_id)
        return _response(result)
