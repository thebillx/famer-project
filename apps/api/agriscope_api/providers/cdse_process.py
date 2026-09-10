"""Server-side CDSE OAuth and true-color Process API client."""

from __future__ import annotations

import asyncio
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import math
import time
from typing import Any, Awaitable, Callable
import warnings


TRUE_COLOR_EVALSCRIPT_VERSION = "agriscope-true-color-v1"
TRUE_COLOR_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  return [
    2.5 * sample.B04,
    2.5 * sample.B03,
    2.5 * sample.B02,
    sample.dataMask
  ];
}
"""

NDVI_RASTER_EVALSCRIPT_VERSION = "agriscope-ndvi-raster-v1"
NDVI_RASTER_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 2, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(sample) {
  const denominator = sample.B08 + sample.B04;
  const excludedScl = [0, 1, 3, 6, 8, 9, 10, 11].includes(sample.SCL);
  const valid = sample.dataMask === 1 && denominator !== 0 && !excludedScl;
  return [valid ? (sample.B08 - sample.B04) / denominator : -9999, valid ? 1 : 0];
}
"""

NDVI_SUMMARY_EVALSCRIPT_VERSION = "agriscope-ndvi-summary-v1"
NDVI_SUMMARY_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  const denominator = sample.B08 + sample.B04;
  const excludedScl = [0, 1, 3, 6, 8, 9, 10, 11].includes(sample.SCL);
  const valid = sample.dataMask === 1 && denominator !== 0 && !excludedScl;
  return {
    ndvi: [valid ? (sample.B08 - sample.B04) / denominator : 0],
    dataMask: [valid ? 1 : 0]
  };
}
"""

_CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
_STATISTICS_RESOLUTION_DEGREES = 0.00009
_STATISTICS_RESOLUTION_DEGREES_DECIMAL = Decimal("0.00009")
_MAX_STATISTICS_GRID_CELLS = 512 * 512
_MAX_PREVIEW_BYTES = 5 * 1024 * 1024
_MAX_RASTER_BYTES = 8 * 1024 * 1024
_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

TokenSender = Callable[
    [str, dict[str, str], int],
    Awaitable[tuple[int, dict[str, Any]]],
]
ProcessSender = Callable[
    [str, dict[str, Any], str, int],
    Awaitable[tuple[int, str, bytes]],
]
StatisticsSender = Callable[
    [str, dict[str, Any], str, int],
    Awaitable[tuple[int, dict[str, Any]]],
]


class CdseProcessError(Exception):
    """Base Process API error."""


class CdseProcessUnavailable(CdseProcessError):
    """OAuth or Process API is temporarily unavailable."""


class CdseProcessRateLimited(CdseProcessUnavailable):
    """CDSE rate limited the request."""


class CdseProcessNoData(CdseProcessError):
    """The Process API returned no raster for the requested acquisition."""


class CdseProcessRequestTooLarge(CdseProcessError):
    """The Statistical API request would exceed the per-request work budget."""


class CdseProcessMalformedResponse(CdseProcessUnavailable):
    """The provider response is unsafe to return."""


@dataclass(frozen=True)
class CdseTrueColorPreview:
    image_png: bytes
    valid_pixel_ratio: float
    evalscript_version: str = TRUE_COLOR_EVALSCRIPT_VERSION


@dataclass(frozen=True)
class CdseNdviSummary:
    mean: float
    minimum: float
    maximum: float
    standard_deviation: float
    sample_count: int
    valid_sample_count: int
    valid_pixel_ratio: float
    evalscript_version: str = NDVI_SUMMARY_EVALSCRIPT_VERSION


@dataclass(frozen=True)
class CdseNdviRaster:
    geotiff: bytes
    width: int
    height: int
    bounds: tuple[float, float, float, float]
    crs: str
    valid_pixel_ratio: float
    evalscript_version: str = NDVI_RASTER_EVALSCRIPT_VERSION


class CdseProcessClient:
    def __init__(
        self,
        *,
        client_id: str,
        client_secret: str,
        token_url: str,
        process_url: str,
        timeout_seconds: int,
        max_cloud_cover_percent: float,
        statistics_url: str = "https://sh.dataspace.copernicus.eu/statistics/v1",
        output_size_pixels: int = 768,
        send_token: TokenSender | None = None,
        send_process: ProcessSender | None = None,
        send_statistics: StatisticsSender | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.token_url = token_url
        self.process_url = process_url
        self.statistics_url = statistics_url
        self.timeout_seconds = timeout_seconds
        self.max_cloud_cover_percent = max_cloud_cover_percent
        self.output_size_pixels = output_size_pixels
        self._send_token = send_token
        self._send_process = send_process
        self._send_statistics = send_statistics
        self._clock = clock
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()

    async def render_true_color(
        self,
        geometry: dict[str, Any],
        *,
        acquired_at: datetime,
        exact_observation: bool = False,
    ) -> CdseTrueColorPreview:
        payload = self.build_process_payload(
            geometry, acquired_at=acquired_at, exact_observation=exact_observation
        )
        token = await self._access_token()
        status_code, content_type, body = await self._process(payload, token)
        if status_code == 401:
            token = await self._access_token(rejected_token=token)
            status_code, content_type, body = await self._process(payload, token)
        if status_code == 429:
            raise CdseProcessRateLimited("cdse process rate limited")
        if status_code == 204 or (status_code < 400 and not body):
            raise CdseProcessNoData("cdse process returned no data")
        if status_code >= 500:
            raise CdseProcessUnavailable("cdse process unavailable")
        if status_code >= 400:
            raise CdseProcessUnavailable("cdse process rejected request")

        normalized_content_type = content_type.partition(";")[0].strip().lower()
        if normalized_content_type != "image/png":
            raise CdseProcessMalformedResponse("cdse process returned unsupported content type")
        if len(body) > _MAX_PREVIEW_BYTES or not body.startswith(_PNG_SIGNATURE):
            raise CdseProcessMalformedResponse("cdse process returned invalid png")
        valid_pixel_ratio = _valid_pixel_ratio(body)
        if valid_pixel_ratio == 0:
            raise CdseProcessNoData("cdse process returned no valid pixels")
        return CdseTrueColorPreview(image_png=body, valid_pixel_ratio=valid_pixel_ratio)

    async def render_ndvi_raster(
        self,
        geometry: dict[str, Any],
        *,
        acquired_at: datetime,
    ) -> CdseNdviRaster:
        payload = self.build_ndvi_raster_payload(geometry, acquired_at=acquired_at)
        token = await self._access_token()
        status_code, content_type, body = await self._process(payload, token)
        if status_code == 401:
            token = await self._access_token(rejected_token=token)
            status_code, content_type, body = await self._process(payload, token)
        if status_code == 429:
            raise CdseProcessRateLimited("cdse process rate limited")
        if status_code == 204 or (status_code < 400 and not body):
            raise CdseProcessNoData("cdse process returned no ndvi raster")
        if status_code >= 400:
            raise CdseProcessUnavailable("cdse process unavailable")
        if content_type.partition(";")[0].strip().lower() not in {"image/tiff", "image/geotiff"}:
            raise CdseProcessMalformedResponse("cdse process returned unsupported raster type")
        return _validate_ndvi_geotiff(body, expected_geometry=geometry)

    def build_ndvi_raster_payload(
        self,
        geometry: dict[str, Any],
        *,
        acquired_at: datetime,
    ) -> dict[str, Any]:
        acquired_utc = acquired_at.astimezone(UTC)
        start, end = acquired_utc - timedelta(seconds=1), acquired_utc + timedelta(seconds=1)
        width, height = _raster_dimensions(geometry)
        return {
            "input": {
                "bounds": {"geometry": geometry, "properties": {"crs": _CRS84}},
                "data": [{
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": _iso_z(start), "to": _iso_z(end)},
                        "maxCloudCoverage": self.max_cloud_cover_percent,
                        "mosaickingOrder": "mostRecent",
                    },
                }],
            },
            "output": {
                "width": width,
                "height": height,
                "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}],
            },
            "evalscript": NDVI_RASTER_EVALSCRIPT,
        }

    def build_process_payload(
        self,
        geometry: dict[str, Any],
        *,
        acquired_at: datetime,
        exact_observation: bool = False,
    ) -> dict[str, Any]:
        acquired_utc = acquired_at.astimezone(UTC)
        if exact_observation:
            start, end = acquired_utc - timedelta(seconds=1), acquired_utc + timedelta(seconds=1)
        else:
            start = acquired_utc.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
        return {
            "input": {
                "bounds": {
                    "geometry": geometry,
                    "properties": {"crs": _CRS84},
                },
                "data": [
                    {
                        "type": "sentinel-2-l2a",
                        "dataFilter": {
                            "timeRange": {
                                "from": _iso_z(start),
                                "to": _iso_z(end),
                            },
                            "maxCloudCoverage": self.max_cloud_cover_percent,
                            "mosaickingOrder": "mostRecent",
                        },
                    }
                ],
            },
            "output": {
                "width": self.output_size_pixels,
                "height": self.output_size_pixels,
                "responses": [
                    {
                        "identifier": "default",
                        "format": {"type": "image/png"},
                    }
                ],
            },
            "evalscript": TRUE_COLOR_EVALSCRIPT,
        }

    async def summarize_ndvi(
        self,
        geometry: dict[str, Any],
        *,
        acquired_at: datetime,
        exact_observation: bool = False,
    ) -> CdseNdviSummary:
        payload = self.build_statistics_payload(
            geometry, acquired_at=acquired_at, exact_observation=exact_observation
        )
        token = await self._access_token()
        status_code, body = await self._statistics(payload, token)
        if status_code == 401:
            token = await self._access_token(rejected_token=token)
            status_code, body = await self._statistics(payload, token)
        if status_code == 429:
            raise CdseProcessRateLimited("cdse statistical api rate limited")
        if status_code == 204 or (status_code < 400 and not body):
            raise CdseProcessNoData("cdse statistical api returned no data")
        if status_code >= 400:
            raise CdseProcessUnavailable("cdse statistical api unavailable")
        return _parse_ndvi_summary(
            body,
            expected_interval=payload["aggregation"]["timeRange"],
        )

    def build_statistics_payload(
        self,
        geometry: dict[str, Any],
        *,
        acquired_at: datetime,
        exact_observation: bool = False,
    ) -> dict[str, Any]:
        if _statistics_grid_cells(geometry) > _MAX_STATISTICS_GRID_CELLS:
            raise CdseProcessRequestTooLarge("cdse statistical grid exceeds request budget")
        acquired_utc = acquired_at.astimezone(UTC)
        if exact_observation:
            start, end = acquired_utc - timedelta(seconds=1), acquired_utc + timedelta(seconds=1)
        else:
            start = acquired_utc.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
        return {
            "input": {
                "bounds": {
                    "geometry": geometry,
                    "properties": {"crs": _CRS84},
                },
                "data": [
                    {
                        "type": "sentinel-2-l2a",
                        "dataFilter": {
                            "maxCloudCoverage": self.max_cloud_cover_percent,
                            "mosaickingOrder": "mostRecent",
                        },
                    }
                ],
            },
            "aggregation": {
                "timeRange": {"from": _iso_z(start), "to": _iso_z(end)},
                "aggregationInterval": {"of": "P1D"},
                "evalscript": NDVI_SUMMARY_EVALSCRIPT,
                "resx": _STATISTICS_RESOLUTION_DEGREES,
                "resy": _STATISTICS_RESOLUTION_DEGREES,
            },
        }

    async def _access_token(self, *, rejected_token: str | None = None) -> str:
        if (
            self._token is not None
            and self._token != rejected_token
            and self._clock() < self._token_expires_at
        ):
            return self._token
        async with self._token_lock:
            if (
                self._token is not None
                and self._token != rejected_token
                and self._clock() < self._token_expires_at
            ):
                return self._token
            if not self.client_id or not self.client_secret or not self.token_url:
                raise CdseProcessUnavailable("cdse process credentials are not configured")
            status_code, body = await self._token_request(
                {
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                }
            )
            if status_code == 429:
                raise CdseProcessRateLimited("cdse oauth rate limited")
            if status_code >= 400:
                raise CdseProcessUnavailable("cdse oauth unavailable")
            access_token = body.get("access_token")
            expires_in = body.get("expires_in")
            if not isinstance(access_token, str) or not access_token:
                raise CdseProcessMalformedResponse("cdse oauth response missing access token")
            if not isinstance(expires_in, int | float) or expires_in <= 0:
                raise CdseProcessMalformedResponse("cdse oauth response missing expiry")
            self._token = access_token
            self._token_expires_at = self._clock() + max(1.0, float(expires_in) - 30.0)
            return access_token

    async def _token_request(self, form: dict[str, str]) -> tuple[int, dict[str, Any]]:
        if self._send_token is not None:
            status_code, body = await self._send_token(self.token_url, form, self.timeout_seconds)
            if not isinstance(body, dict):
                raise CdseProcessMalformedResponse("cdse oauth response must be an object")
            return status_code, body

        try:
            import httpx
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for CDSE Process API") from exc
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(self.token_url, data=form)
        except httpx.TimeoutException as exc:
            raise CdseProcessUnavailable("cdse oauth timeout") from exc
        except httpx.HTTPError as exc:
            raise CdseProcessUnavailable("cdse oauth network error") from exc
        try:
            body = response.json()
        except ValueError as exc:
            raise CdseProcessMalformedResponse("cdse oauth returned invalid json") from exc
        if not isinstance(body, dict):
            raise CdseProcessMalformedResponse("cdse oauth response must be an object")
        return response.status_code, body

    async def _process(
        self,
        payload: dict[str, Any],
        access_token: str,
    ) -> tuple[int, str, bytes]:
        if self._send_process is not None:
            return await self._send_process(
                self.process_url,
                payload,
                access_token,
                self.timeout_seconds,
            )

        try:
            import httpx
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for CDSE Process API") from exc
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    self.process_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "image/png",
                    },
                )
        except httpx.TimeoutException as exc:
            raise CdseProcessUnavailable("cdse process timeout") from exc
        except httpx.HTTPError as exc:
            raise CdseProcessUnavailable("cdse process network error") from exc
        return response.status_code, response.headers.get("content-type", ""), response.content

    async def _statistics(
        self,
        payload: dict[str, Any],
        access_token: str,
    ) -> tuple[int, dict[str, Any]]:
        if self._send_statistics is not None:
            status_code, body = await self._send_statistics(
                self.statistics_url,
                payload,
                access_token,
                self.timeout_seconds,
            )
            if not isinstance(body, dict):
                raise CdseProcessMalformedResponse("cdse statistical response must be an object")
            return status_code, body

        try:
            import httpx
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for CDSE Statistical API") from exc
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    self.statistics_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json",
                    },
                )
        except httpx.TimeoutException as exc:
            raise CdseProcessUnavailable("cdse statistical api timeout") from exc
        except httpx.HTTPError as exc:
            raise CdseProcessUnavailable("cdse statistical api network error") from exc
        if response.status_code == 204 or response.status_code >= 400:
            return response.status_code, {}
        try:
            body = response.json()
        except ValueError as exc:
            raise CdseProcessMalformedResponse(
                "cdse statistical api returned invalid json"
            ) from exc
        if not isinstance(body, dict):
            raise CdseProcessMalformedResponse("cdse statistical response must be an object")
        return response.status_code, body


def _valid_pixel_ratio(image_png: bytes) -> float:
    try:
        from rasterio.errors import NotGeoreferencedWarning
        from rasterio.io import MemoryFile

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", NotGeoreferencedWarning)
            with MemoryFile(image_png) as memory_file:
                with memory_file.open() as dataset:
                    if dataset.driver != "PNG" or dataset.width <= 0 or dataset.height <= 0:
                        raise CdseProcessMalformedResponse("cdse process returned invalid raster")
                    mask = dataset.dataset_mask()
    except CdseProcessMalformedResponse:
        raise
    except Exception as exc:
        raise CdseProcessMalformedResponse("cdse process returned unreadable png") from exc
    return float((mask > 0).sum() / mask.size)


def _validate_ndvi_geotiff(
    body: bytes, *, expected_geometry: dict[str, Any] | None = None
) -> CdseNdviRaster:
    if len(body) > _MAX_RASTER_BYTES:
        raise CdseProcessMalformedResponse("cdse ndvi raster exceeds size limit")
    try:
        import numpy as np
        from rasterio.io import MemoryFile

        with MemoryFile(body) as memory_file:
            with memory_file.open() as dataset:
                if dataset.driver != "GTiff" or dataset.count != 2:
                    raise CdseProcessMalformedResponse("cdse ndvi raster has invalid bands")
                if not (0 < dataset.width <= 512 and 0 < dataset.height <= 512):
                    raise CdseProcessMalformedResponse("cdse ndvi raster has invalid dimensions")
                values = dataset.read(1)
                valid = dataset.read(2) > 0.5
                if not valid.any():
                    raise CdseProcessNoData("cdse ndvi raster has no valid pixels")
                if not np.isfinite(values[valid]).all() or (values[valid] < -1).any() or (
                    values[valid] > 1
                ).any():
                    raise CdseProcessMalformedResponse("cdse ndvi raster values are invalid")
                if ((~valid) & (values != -9999)).any():
                    raise CdseProcessMalformedResponse("cdse ndvi raster nodata values are invalid")
                if dataset.crs is None or dataset.crs.to_epsg() != 4326:
                    raise CdseProcessMalformedResponse("cdse ndvi raster must use EPSG:4326")
                bounds = tuple(float(value) for value in dataset.bounds)
                if expected_geometry is not None:
                    expected_bounds = _geometry_bounds(expected_geometry)
                    tolerance = max(
                        (expected_bounds[2] - expected_bounds[0]) / dataset.width,
                        (expected_bounds[3] - expected_bounds[1]) / dataset.height,
                        1e-9,
                    )
                    if any(
                        abs(actual - expected) > tolerance
                        for actual, expected in zip(bounds, expected_bounds, strict=True)
                    ):
                        raise CdseProcessMalformedResponse(
                            "cdse ndvi raster bounds do not match requested field"
                        )
                crs = dataset.crs.to_string()
                return CdseNdviRaster(
                    geotiff=body,
                    width=dataset.width,
                    height=dataset.height,
                    bounds=bounds,  # type: ignore[arg-type]
                    crs=crs,
                    valid_pixel_ratio=float(valid.sum() / valid.size),
                )
    except (CdseProcessMalformedResponse, CdseProcessNoData):
        raise
    except Exception as exc:
        raise CdseProcessMalformedResponse("cdse ndvi raster is unreadable") from exc


def _parse_ndvi_summary(
    body: dict[str, Any],
    *,
    expected_interval: dict[str, str],
) -> CdseNdviSummary:
    data = body.get("data")
    if body.get("status") != "OK" or not isinstance(data, list):
        raise CdseProcessMalformedResponse("cdse statistical response has invalid status")
    if not data:
        raise CdseProcessNoData("cdse statistical api returned no interval")
    if len(data) != 1 or not isinstance(data[0], dict):
        raise CdseProcessMalformedResponse("cdse statistical response has invalid intervals")
    if data[0].get("interval") != expected_interval:
        raise CdseProcessMalformedResponse("cdse statistical response interval does not match")
    outputs = data[0].get("outputs")
    if not isinstance(outputs, dict) or set(outputs) != {"ndvi"}:
        raise CdseProcessMalformedResponse("cdse statistical response has invalid outputs")
    ndvi = outputs["ndvi"]
    bands = ndvi.get("bands") if isinstance(ndvi, dict) else None
    if not isinstance(bands, dict) or set(bands) != {"B0"}:
        raise CdseProcessMalformedResponse("cdse statistical response has invalid ndvi bands")
    try:
        stats = bands["B0"]["stats"]
    except (KeyError, TypeError) as exc:
        raise CdseProcessMalformedResponse("cdse statistical response missing ndvi stats") from exc
    if not isinstance(stats, dict):
        raise CdseProcessMalformedResponse("cdse statistical stats must be an object")

    sample_count = stats.get("sampleCount")
    no_data_count = stats.get("noDataCount")
    if (
        type(sample_count) is not int
        or type(no_data_count) is not int
        or sample_count < 0
        or not 0 <= no_data_count <= sample_count
    ):
        raise CdseProcessMalformedResponse("cdse statistical counts are invalid")
    valid_sample_count = sample_count - no_data_count
    if sample_count == 0 or valid_sample_count == 0:
        raise CdseProcessNoData("cdse statistical api returned no valid samples")

    values: list[float] = []
    for key in ("mean", "min", "max", "stDev"):
        raw = stats.get(key)
        if isinstance(raw, bool) or not isinstance(raw, int | float):
            raise CdseProcessMalformedResponse("cdse statistical values are invalid")
        try:
            value = float(raw)
        except (OverflowError, ValueError) as exc:
            raise CdseProcessMalformedResponse("cdse statistical values are invalid") from exc
        if not math.isfinite(value):
            raise CdseProcessMalformedResponse("cdse statistical values must be finite")
        values.append(value)
    mean, minimum, maximum, standard_deviation = values
    if not -1 <= minimum <= mean <= maximum <= 1 or not 0 <= standard_deviation <= 1:
        raise CdseProcessMalformedResponse("cdse statistical ndvi values are out of range")
    return CdseNdviSummary(
        mean=mean,
        minimum=minimum,
        maximum=maximum,
        standard_deviation=standard_deviation,
        sample_count=sample_count,
        valid_sample_count=valid_sample_count,
        valid_pixel_ratio=valid_sample_count / sample_count,
    )


def _statistics_grid_cells(geometry: dict[str, Any]) -> int:
    try:
        positions = [position for ring in geometry["coordinates"] for position in ring]
        longitudes = [Decimal(str(position[0])) for position in positions]
        latitudes = [Decimal(str(position[1])) for position in positions]
        width = _statistics_grid_axis_cells(max(longitudes) - min(longitudes))
        height = _statistics_grid_axis_cells(max(latitudes) - min(latitudes))
        return width * height
    except (
        KeyError,
        ValueError,
        TypeError,
        IndexError,
        InvalidOperation,
    ) as exc:
        raise CdseProcessMalformedResponse("cdse statistical geometry is invalid") from exc


def _raster_dimensions(geometry: dict[str, Any]) -> tuple[int, int]:
    try:
        positions = [position for ring in geometry["coordinates"] for position in ring]
        longitudes = [float(position[0]) for position in positions]
        latitudes = [float(position[1]) for position in positions]
        latitude = (min(latitudes) + max(latitudes)) / 2
        width_m = (max(longitudes) - min(longitudes)) * 111_320 * math.cos(math.radians(latitude))
        height_m = (max(latitudes) - min(latitudes)) * 110_540
        raw_width = max(1, math.ceil(width_m / 10))
        raw_height = max(1, math.ceil(height_m / 10))
        scale = min(1.0, 512 / max(raw_width, raw_height))
        return max(1, round(raw_width * scale)), max(1, round(raw_height * scale))
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise CdseProcessMalformedResponse("cdse raster geometry is invalid") from exc


def _geometry_bounds(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    try:
        positions = [position for ring in geometry["coordinates"] for position in ring]
        longitudes = [float(position[0]) for position in positions]
        latitudes = [float(position[1]) for position in positions]
        if not positions:
            raise ValueError("empty geometry")
        return min(longitudes), min(latitudes), max(longitudes), max(latitudes)
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise CdseProcessMalformedResponse("cdse raster geometry is invalid") from exc


def _statistics_grid_axis_cells(span_degrees: Decimal) -> int:
    try:
        if span_degrees <= 0:
            return 1
        return int(
            (span_degrees / _STATISTICS_RESOLUTION_DEGREES_DECIMAL).to_integral_value(
                rounding=ROUND_CEILING
            )
        )
    except InvalidOperation as exc:
        raise CdseProcessMalformedResponse("cdse statistical grid is invalid") from exc


def _iso_z(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
