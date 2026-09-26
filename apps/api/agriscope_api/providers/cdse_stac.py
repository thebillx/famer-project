"""Minimal CDSE STAC client for Sentinel-2 L2A discovery."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
import json
from typing import Any, Awaitable, Callable
from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit


CDSE_STAC_PROVIDER = "cdse_stac"
SENTINEL_2_L2A_COLLECTION = "sentinel-2-l2a"
MAX_HISTORY_PAGES = 100


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
    provider_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CdseStacSearchResult:
    item: CdseStacItem | None
    searched_at: datetime


@dataclass(frozen=True)
class CdseStacHistoryResult:
    """Bounded, de-duplicated catalog results from a historical search."""

    items: tuple[CdseStacItem, ...]
    searched_at: datetime
    page_count: int
    truncated: bool = False


class CdseStacClient:
    def __init__(
        self,
        *,
        stac_url: str,
        timeout_seconds: int,
        lookback_days: int,
        max_cloud_cover_percent: float,
        post_json: Callable[[str, dict[str, Any], int], Awaitable[tuple[int, dict[str, Any]]]]
        | None = None,
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
        return CdseStacSearchResult(
            item=self.select_latest_valid_item(body), searched_at=searched_at
        )

    async def search_history(
        self,
        geometry: dict[str, Any],
        *,
        start: datetime,
        end: datetime,
        now: datetime | None = None,
        max_pages: int = MAX_HISTORY_PAGES,
    ) -> CdseStacHistoryResult:
        """Discover catalog items in one bounded interval."""
        if start.tzinfo is None or end.tzinfo is None:
            raise ValueError("historical search bounds must be timezone-aware")
        if start > end:
            raise ValueError("historical search start must not be after end")
        if max_pages < 1:
            raise ValueError("max_pages must be positive")

        searched_at = now or datetime.now(UTC)
        original_payload = self.build_search_payload(
            geometry,
            start=start,
            end=end,
            sort_direction="asc",
            include_quality_filter=False,
        )
        payload = dict(original_payload)
        url = self.stac_url
        items: list[CdseStacItem] = []
        identities: set[tuple[str, str, str]] = set()
        seen_pages: set[tuple[str, str]] = set()
        page_count = 0

        while True:
            status_code, body = await self._send(payload, url=url)
            self._raise_for_status(status_code)
            features = body.get("features")
            if not isinstance(features, list):
                raise CdseStacMalformedResponse("cdse stac response missing features")
            for feature in features:
                item = self._parse_feature(feature)
                if item is None:
                    continue
                identity = (item.provider, item.collection, item.item_id)
                if identity not in identities:
                    identities.add(identity)
                    items.append(item)
            page_count += 1
            next_page = self._next_page(
                body,
                url=url,
                payload=payload,
                original_payload=original_payload,
            )
            if next_page is None:
                break
            if page_count >= max_pages:
                return CdseStacHistoryResult(tuple(items), searched_at, page_count, True)
            url, payload = next_page
            page_identity = (url, _stable_json(payload))
            if page_identity in seen_pages:
                raise CdseStacMalformedResponse("cdse stac pagination repeated a page")
            seen_pages.add(page_identity)

        return CdseStacHistoryResult(tuple(items), searched_at, page_count, False)

    async def _send(
        self, payload: dict[str, Any], *, url: str | None = None
    ) -> tuple[int, dict[str, Any]]:
        request_url = url or self.stac_url
        if self._post_json is not None:
            status_code, body = await self._post_json(request_url, payload, self.timeout_seconds)
            if not isinstance(body, dict):
                raise CdseStacMalformedResponse("cdse stac response must be an object")
            return status_code, body

        try:
            import httpx
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for CDSE STAC search") from exc

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(request_url, json=payload)
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

    @staticmethod
    def _raise_for_status(status_code: int) -> None:
        if status_code == 429:
            raise CdseStacRateLimited("cdse stac rate limited")
        if status_code >= 500:
            raise CdseStacUnavailable("cdse stac unavailable")
        if status_code >= 400:
            raise CdseStacMalformedResponse("cdse stac rejected request")

    def _next_page(
        self,
        body: dict[str, Any],
        *,
        url: str,
        payload: dict[str, Any],
        original_payload: dict[str, Any],
    ) -> tuple[str, dict[str, Any]] | None:
        candidate_url: str | None = None
        candidate_body: dict[str, Any] | None = None
        candidate_token: str | None = None
        candidate_method: str | None = None

        next_value = body.get("next")
        if isinstance(next_value, str) and next_value:
            candidate_token = next_value
        elif isinstance(next_value, dict):
            candidate_body = next_value.get("body") if isinstance(next_value.get("body"), dict) else None
            candidate_url = next_value.get("href") if isinstance(next_value.get("href"), str) else None
            candidate_token = next_value.get("token") if isinstance(next_value.get("token"), str) else None
            if "method" in next_value:
                candidate_method = next_value.get("method")
        else:
            links = body.get("links")
            if not isinstance(links, list):
                return None
            for link in links:
                if isinstance(link, dict) and link.get("rel") == "next":
                    candidate_url = link.get("href") if isinstance(link.get("href"), str) else None
                    candidate_body = link.get("body") if isinstance(link.get("body"), dict) else None
                    candidate_token = link.get("token") if isinstance(link.get("token"), str) else None
                    if "method" in link:
                        candidate_method = link.get("method")
                    break
            else:
                return None

        if candidate_method is not None and (
            not isinstance(candidate_method, str) or candidate_method.upper() != "POST"
        ):
            raise CdseStacMalformedResponse("cdse stac continuation method is unsafe")

        if candidate_body is not None:
            extras = set(candidate_body) - set(original_payload) - {"token"}
            if extras:
                raise CdseStacMalformedResponse("cdse stac continuation widens the query")
            for key, value in candidate_body.items():
                if key != "token" and value != original_payload.get(key):
                    raise CdseStacMalformedResponse("cdse stac continuation changes the query")
            body_token = candidate_body.get("token")
            if body_token is not None:
                if not isinstance(body_token, str) or not body_token:
                    raise CdseStacMalformedResponse("cdse stac continuation token is invalid")
                if candidate_token is not None and candidate_token != body_token:
                    raise CdseStacMalformedResponse("cdse stac continuation tokens disagree")
                candidate_token = body_token

        if candidate_url is None:
            candidate_url = url
        trusted_url, query_token = self._trusted_continuation_url(candidate_url)
        if query_token is not None:
            if candidate_token is not None and candidate_token != query_token:
                raise CdseStacMalformedResponse("cdse stac continuation tokens disagree")
            candidate_token = query_token
        if not isinstance(candidate_token, str) or not candidate_token:
            raise CdseStacMalformedResponse("cdse stac continuation token is missing")
        next_payload = dict(original_payload)
        next_payload["token"] = candidate_token
        return trusted_url, next_payload

    def _trusted_continuation_url(self, href: str) -> tuple[str, str | None]:
        resolved = urljoin(self.stac_url, href)
        configured = urlsplit(self.stac_url)
        parsed = urlsplit(resolved)
        if (
            parsed.scheme != configured.scheme
            or parsed.hostname != configured.hostname
            or parsed.port != configured.port
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
        ):
            raise CdseStacMalformedResponse("cdse stac continuation URL is unsafe")
        query = parse_qs(parsed.query, keep_blank_values=True)
        unknown = set(query) - {"token"}
        if unknown or len(query.get("token", [])) > 1:
            raise CdseStacMalformedResponse("cdse stac continuation widens the query")
        token_values = query.get("token", [])
        token = token_values[0] if token_values else None
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", "")), token

    def build_search_payload(
        self,
        geometry: dict[str, Any],
        *,
        start: datetime,
        end: datetime,
        sort_direction: str = "desc",
        include_quality_filter: bool = True,
    ) -> dict[str, Any]:
        if sort_direction not in {"asc", "desc"}:
            raise ValueError("sort_direction must be asc or desc")
        payload: dict[str, Any] = {
            "collections": [SENTINEL_2_L2A_COLLECTION],
            "datetime": f"{_iso_z(start)}/{_iso_z(end)}",
            "intersects": geometry,
            "limit": 20,
            "sortby": [{"field": "properties.datetime", "direction": sort_direction}],
            "fields": {
                "include": [
                    "id",
                    "collection",
                    "properties.datetime",
                    "properties.eo:cloud_cover",
                ]
            },
        }
        if include_quality_filter:
            payload["filter-lang"] = "cql2-json"
            payload["filter"] = {
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
            }
        return payload

    def select_latest_valid_item(self, body: dict[str, Any]) -> CdseStacItem | None:
        features = body.get("features")
        if not isinstance(features, list):
            raise CdseStacMalformedResponse("cdse stac response missing features")

        selected: CdseStacItem | None = None
        for feature in features:
            item = self._parse_feature(feature)
            if item is None:
                continue
            if (
                item.cloud_cover_percent is not None
                and item.cloud_cover_percent > self.max_cloud_cover_percent
            ):
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
        if (
            not isinstance(item_id, str)
            or not isinstance(collection, str)
            or not isinstance(properties, dict)
        ):
            raise CdseStacMalformedResponse("cdse stac feature missing required fields")
        raw_datetime = properties.get("datetime")
        if not isinstance(raw_datetime, str):
            return None
        acquired_at = _parse_datetime(raw_datetime)
        raw_cloud = properties.get("eo:cloud_cover")
        cloud_cover = None
        if raw_cloud is not None:
            if not isinstance(raw_cloud, int | float) or isinstance(raw_cloud, bool):
                raise CdseStacMalformedResponse("cdse stac cloud cover must be numeric")
            cloud_cover = float(raw_cloud)
        return CdseStacItem(
            provider=CDSE_STAC_PROVIDER,
            collection=collection,
            item_id=item_id,
            acquired_at=acquired_at,
            cloud_cover_percent=cloud_cover,
            provider_metadata={
                "provider": CDSE_STAC_PROVIDER,
                "collection": collection,
                "stac_item_id": item_id,
                "datetime": _iso_z(acquired_at),
                "eo:cloud_cover": cloud_cover,
            },
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


def _stable_json(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
