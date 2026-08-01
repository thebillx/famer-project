"""Minimal CDSE STAC client for Sentinel-2 L2A discovery."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Awaitable, Callable


CDSE_STAC_PROVIDER = "cdse_stac"
SENTINEL_2_L2A_COLLECTION = "sentinel-2-l2a"


class CdseStacError(Exception):
    """Base provider error."""


class CdseStacUnavailable(CdseStacError):
    """Provider is temporarily unavailable."""


class CdseStacRateLimited(CdseStacUnavailable):
    """Provider rate limited the request."""


class CdseStacMalformedResponse(CdseStacUnavailable):
    """Provider response could not be parsed safely."""


@dataclass(frozen=True)
class CdseStacItem:
    provider: str
    collection: str
    item_id: str
    acquired_at: datetime
    cloud_cover_percent: float | None


@dataclass(frozen=True)
class CdseStacSearchResult:
    item: CdseStacItem | None
    searched_at: datetime


class CdseStacClient:
    def __init__(
        self,
        *,
        stac_url: str,
        timeout_seconds: int,
        lookback_days: int,
        max_cloud_cover_percent: float,
        post_json: Callable[[str, dict[str, Any], int], Awaitable[tuple[int, dict[str, Any]]]] | None = None,
    ) -> None:
        self.stac_url = stac_url
        self.timeout_seconds = timeout_seconds
        self.lookback_days = lookback_days
        self.max_cloud_cover_percent = max_cloud_cover_percent
        self._post_json = post_json

    async def search_latest(
        self, geometry: dict[str, Any], *, now: datetime | None = None
    ) -> CdseStacSearchResult:
        searched_at = now or datetime.now(UTC)
        start = searched_at - timedelta(days=self.lookback_days)
        payload = self.build_search_payload(geometry, start=start, end=searched_at)
        status_code, body = await self._send(payload)
        if status_code == 429:
            raise CdseStacRateLimited("cdse stac rate limited")
        if status_code >= 500:
            raise CdseStacUnavailable("cdse stac unavailable")
        if status_code >= 400:
            raise CdseStacMalformedResponse("cdse stac rejected request")
        return CdseStacSearchResult(item=self.select_latest_valid_item(body), searched_at=searched_at)

    async def _send(self, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        if self._post_json is not None:
            status_code, body = await self._post_json(self.stac_url, payload, self.timeout_seconds)
            if not isinstance(body, dict):
                raise CdseStacMalformedResponse("cdse stac response must be an object")
            return status_code, body

        try:
            import httpx
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for CDSE STAC search") from exc

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(self.stac_url, json=payload)
        except httpx.TimeoutException as exc:
            raise CdseStacUnavailable("cdse stac timeout") from exc
        except httpx.HTTPError as exc:
            raise CdseStacUnavailable("cdse stac network error") from exc

        try:
            body = response.json()
        except ValueError as exc:
            raise CdseStacMalformedResponse("cdse stac returned invalid json") from exc
        if not isinstance(body, dict):
            raise CdseStacMalformedResponse("cdse stac response must be an object")
        return response.status_code, body

    def build_search_payload(
        self, geometry: dict[str, Any], *, start: datetime, end: datetime
    ) -> dict[str, Any]:
        return {
            "collections": [SENTINEL_2_L2A_COLLECTION],
            "datetime": f"{_iso_z(start)}/{_iso_z(end)}",
            "intersects": geometry,
            "limit": 20,
            "filter-lang": "cql2-json",
            "filter": {
                "op": "or",
                "args": [
                    {
                        "op": "<=",
                        "args": [
                            {"property": "eo:cloud_cover"},
                            self.max_cloud_cover_percent,
                        ],
                    },
                    {
                        "op": "isNull",
                        "args": [{"property": "eo:cloud_cover"}],
                    },
                ],
            },
            "sortby": [{"field": "properties.datetime", "direction": "desc"}],
            "fields": {
                "include": [
                    "id",
                    "collection",
                    "properties.datetime",
                    "properties.eo:cloud_cover",
                ]
            },
        }

    def select_latest_valid_item(self, body: dict[str, Any]) -> CdseStacItem | None:
        features = body.get("features")
        if not isinstance(features, list):
            raise CdseStacMalformedResponse("cdse stac response missing features")

        selected: CdseStacItem | None = None
        for feature in features:
            item = self._parse_feature(feature)
            if item is None:
                continue
            if item.cloud_cover_percent is not None and item.cloud_cover_percent > self.max_cloud_cover_percent:
                continue
            if selected is None or item.acquired_at > selected.acquired_at:
                selected = item
        return selected

    def _parse_feature(self, feature: Any) -> CdseStacItem | None:
        if not isinstance(feature, dict):
            raise CdseStacMalformedResponse("cdse stac feature must be an object")
        item_id = feature.get("id")
        collection = feature.get("collection") or SENTINEL_2_L2A_COLLECTION
        properties = feature.get("properties")
        if not isinstance(item_id, str) or not isinstance(collection, str) or not isinstance(properties, dict):
            raise CdseStacMalformedResponse("cdse stac feature missing required fields")
        raw_datetime = properties.get("datetime")
        if not isinstance(raw_datetime, str):
            return None
        acquired_at = _parse_datetime(raw_datetime)
        raw_cloud = properties.get("eo:cloud_cover")
        cloud_cover = None
        if raw_cloud is not None:
            if not isinstance(raw_cloud, int | float):
                raise CdseStacMalformedResponse("cdse stac cloud cover must be numeric")
            cloud_cover = float(raw_cloud)
        return CdseStacItem(
            provider=CDSE_STAC_PROVIDER,
            collection=collection,
            item_id=item_id,
            acquired_at=acquired_at,
            cloud_cover_percent=cloud_cover,
        )


def _parse_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise CdseStacMalformedResponse("cdse stac datetime is invalid") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _iso_z(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
