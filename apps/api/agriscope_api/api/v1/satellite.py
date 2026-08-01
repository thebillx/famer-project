"""Satellite metadata API routes."""

from __future__ import annotations

from datetime import datetime

try:
    from fastapi import APIRouter, Depends, Request
    from pydantic import BaseModel
except Exception:  # pragma: no cover
    APIRouter = None  # type: ignore[assignment]
    Depends = None  # type: ignore[assignment]
    Request = object  # type: ignore[assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass


class SatelliteAcquisitionResponse(BaseModel):
    provider: str
    collection: str
    item_id: str
    acquired_at: datetime
    cloud_cover_percent: float | None


class SatelliteLatestResponse(BaseModel):
    field_id: str
    status: str
    acquisition: SatelliteAcquisitionResponse | None
    searched_at: datetime
    message_th: str


router = APIRouter(prefix="/fields", tags=["satellite"]) if APIRouter else None


if router:
    from uuid import UUID

    from apps.api.agriscope_api.dependencies.auth import get_current_user
    from apps.api.agriscope_api.dependencies.runtime import get_db_session, get_settings
    from apps.api.agriscope_api.services.satellite import SatelliteService, cloud_decimal_to_float

    def _response(result) -> SatelliteLatestResponse:
        acquisition = None
        if result.acquisition is not None:
            acquisition = SatelliteAcquisitionResponse(
                provider=result.acquisition.provider,
                collection=result.acquisition.collection,
                item_id=result.acquisition.provider_item_id,
                acquired_at=result.acquisition.acquired_at,
                cloud_cover_percent=cloud_decimal_to_float(result.acquisition.cloud_cover_percent),
            )
        return SatelliteLatestResponse(
            field_id=str(result.field_id),
            status=result.status,
            acquisition=acquisition,
            searched_at=result.searched_at,
            message_th=result.message_th,
        )

    @router.post("/{field_id}/satellite/search-latest", response_model=SatelliteLatestResponse)
    async def search_latest(
        field_id: UUID,
        request: Request,
        session=Depends(get_db_session),
        settings=Depends(get_settings),
    ) -> SatelliteLatestResponse:
        user = await get_current_user(request, session)
        provider = getattr(request.app.state, "cdse_stac_provider", None)
        result = await SatelliteService(session, settings, provider=provider).search_latest(
            user_id=user.id, field_id=field_id
        )
        return _response(result)

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
