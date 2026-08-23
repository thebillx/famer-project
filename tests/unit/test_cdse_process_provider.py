from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import unittest
from unittest.mock import patch
import warnings

import numpy as np
from rasterio.errors import NotGeoreferencedWarning
from rasterio.io import MemoryFile

from apps.api.agriscope_api.providers.cdse_process import (
    NDVI_SUMMARY_EVALSCRIPT,
    NDVI_SUMMARY_EVALSCRIPT_VERSION,
    CdseProcessClient,
    CdseProcessMalformedResponse,
    CdseProcessNoData,
    CdseProcessRateLimited,
    CdseProcessRequestTooLarge,
    CdseProcessUnavailable,
    TRUE_COLOR_EVALSCRIPT,
    TRUE_COLOR_EVALSCRIPT_VERSION,
)


GEOMETRY = {
    "type": "Polygon",
    "coordinates": [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.80], [98.98, 18.79]]],
}
ACQUIRED_AT = datetime(2026, 7, 30, 3, 45, 41, tzinfo=UTC)
STATISTICS_RESOLUTION_DEGREES = 0.00009
MAX_SINGLE_AXIS_GRID_CELLS = 512
MAX_SINGLE_AXIS_SPAN_DEGREES = STATISTICS_RESOLUTION_DEGREES * MAX_SINGLE_AXIS_GRID_CELLS
SMALLEST_SPAN_ABOVE_GRID_LIMIT = MAX_SINGLE_AXIS_SPAN_DEGREES + 0.0000001


def square_geometry(span: float) -> dict:
    west, south = 98.0, 18.0
    east, north = west + span, south + span
    return {
        "type": "Polygon",
        "coordinates": [
            [[west, south], [east, south], [east, north], [west, north], [west, south]]
        ],
    }


def png_with_valid_pixels(valid_pixels: int) -> bytes:
    data = np.zeros((4, 2, 2), dtype="uint8")
    data[0:3, :, :] = 120
    data[3].flat[:valid_pixels] = 255
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with MemoryFile() as memory_file:
            with memory_file.open(
                driver="PNG", width=2, height=2, count=4, dtype="uint8"
            ) as dataset:
                dataset.write(data)
            return memory_file.read()


def ndvi_response(
    *,
    mean: float = 0.42,
    minimum: float = 0.1,
    maximum: float = 0.75,
    standard_deviation: float = 0.12,
    sample_count: int = 100,
    no_data_count: int = 20,
) -> dict:
    return {
        "data": [
            {
                "interval": {"from": "2026-07-30T00:00:00Z", "to": "2026-07-31T00:00:00Z"},
                "outputs": {
                    "ndvi": {
                        "bands": {
                            "B0": {
                                "stats": {
                                    "min": minimum,
                                    "max": maximum,
                                    "mean": mean,
                                    "stDev": standard_deviation,
                                    "sampleCount": sample_count,
                                    "noDataCount": no_data_count,
                                }
                            }
                        }
                    }
                },
            }
        ],
        "status": "OK",
    }


class CdseProcessClientTests(unittest.IsolatedAsyncioTestCase):
    def client(
        self,
        *,
        send_token=None,
        send_process=None,
        send_statistics=None,
        clock=lambda: 100.0,
    ):
        return CdseProcessClient(
            client_id="client-id",
            client_secret="client-secret",
            token_url="https://identity.example.test/token",
            process_url="https://process.example.test/process/v1",
            timeout_seconds=15,
            max_cloud_cover_percent=80.0,
            send_token=send_token,
            send_process=send_process,
            send_statistics=send_statistics,
            clock=clock,
        )

    def test_payload_is_fixed_to_saved_geometry_acquisition_and_true_color_v1(self):
        payload = self.client().build_process_payload(GEOMETRY, acquired_at=ACQUIRED_AT)

        self.assertEqual(payload["input"]["bounds"]["geometry"], GEOMETRY)
        self.assertEqual(
            payload["input"]["bounds"]["properties"]["crs"],
            "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
        )
        data = payload["input"]["data"][0]
        self.assertEqual(data["type"], "sentinel-2-l2a")
        self.assertEqual(
            data["dataFilter"],
            {
                "timeRange": {
                    "from": "2026-07-30T00:00:00Z",
                    "to": "2026-07-31T00:00:00Z",
                },
                "maxCloudCoverage": 80.0,
                "mosaickingOrder": "mostRecent",
            },
        )
        self.assertEqual(payload["output"]["width"], 768)
        self.assertEqual(payload["output"]["height"], 768)
        self.assertEqual(payload["evalscript"], TRUE_COLOR_EVALSCRIPT)
        self.assertEqual(TRUE_COLOR_EVALSCRIPT_VERSION, "agriscope-true-color-v1")

    async def test_token_is_server_side_and_reused_until_expiry(self):
        token_calls: list[dict[str, str]] = []
        process_tokens: list[str] = []

        async def send_token(_url, form, _timeout):
            token_calls.append(form)
            return 200, {"access_token": "private-token", "expires_in": 3600}

        async def send_process(_url, _payload, token, _timeout):
            process_tokens.append(token)
            return 200, "image/png", png_with_valid_pixels(4)

        client = self.client(send_token=send_token, send_process=send_process)
        first = await client.render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)
        second = await client.render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)

        self.assertEqual(
            token_calls,
            [
                {
                    "grant_type": "client_credentials",
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                }
            ],
        )
        self.assertEqual(process_tokens, ["private-token", "private-token"])
        self.assertEqual(first.valid_pixel_ratio, 1.0)
        self.assertEqual(second.image_png, first.image_png)

    async def test_process_401_gets_exactly_one_fresh_token_attempt(self):
        token_calls = 0
        process_calls = 0

        async def send_token(_url, _form, _timeout):
            nonlocal token_calls
            token_calls += 1
            return 200, {"access_token": f"token-{token_calls}", "expires_in": 3600}

        async def send_process(_url, _payload, token, _timeout):
            nonlocal process_calls
            process_calls += 1
            if token == "token-1":
                return 401, "application/json", b"{}"
            return 200, "image/png; charset=binary", png_with_valid_pixels(4)

        result = await self.client(
            send_token=send_token,
            send_process=send_process,
        ).render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)

        self.assertEqual(result.valid_pixel_ratio, 1.0)
        self.assertEqual((token_calls, process_calls), (2, 2))

    async def test_concurrent_401_waiters_share_one_fresh_token(self):
        token_calls = 0
        rejected_calls = 0
        both_rejected = asyncio.Event()

        async def send_token(_url, _form, _timeout):
            nonlocal token_calls
            token_calls += 1
            return 200, {"access_token": f"token-{token_calls}", "expires_in": 3600}

        async def send_process(_url, _payload, token, _timeout):
            nonlocal rejected_calls
            if token == "token-1":
                rejected_calls += 1
                if rejected_calls == 2:
                    both_rejected.set()
                await both_rejected.wait()
                return 401, "application/json", b"{}"
            return 200, "image/png", png_with_valid_pixels(4)

        client = self.client(send_token=send_token, send_process=send_process)
        previews = await asyncio.gather(
            *(client.render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT) for _ in range(2))
        )

        self.assertEqual(token_calls, 2)
        self.assertEqual([preview.valid_pixel_ratio for preview in previews], [1.0, 1.0])

    async def test_alpha_mask_produces_deterministic_valid_pixel_ratio(self):
        async def send_token(_url, _form, _timeout):
            return 200, {"access_token": "token", "expires_in": 3600}

        async def send_process(_url, _payload, _token, _timeout):
            return 200, "image/png", png_with_valid_pixels(1)

        preview = await self.client(
            send_token=send_token,
            send_process=send_process,
        ).render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)

        self.assertEqual(preview.valid_pixel_ratio, 0.25)

    async def test_all_transparent_png_is_no_data(self):
        async def send_token(_url, _form, _timeout):
            return 200, {"access_token": "token", "expires_in": 3600}

        async def send_process(_url, _payload, _token, _timeout):
            return 200, "image/png", png_with_valid_pixels(0)

        with self.assertRaises(CdseProcessNoData):
            await self.client(
                send_token=send_token,
                send_process=send_process,
            ).render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)

    async def test_ndvi_payload_and_response_are_bounded_to_acquisition_day(self):
        token_calls = 0
        statistics_payloads: list[dict] = []

        async def send_token(_url, _form, _timeout):
            nonlocal token_calls
            token_calls += 1
            return 200, {"access_token": "token", "expires_in": 3600}

        async def send_statistics(url, payload, token, timeout):
            self.assertEqual(url, "https://sh.dataspace.copernicus.eu/statistics/v1")
            self.assertEqual((token, timeout), ("token", 15))
            statistics_payloads.append(payload)
            return 200, ndvi_response()

        client = self.client(send_token=send_token, send_statistics=send_statistics)
        summary = await client.summarize_ndvi(GEOMETRY, acquired_at=ACQUIRED_AT)
        second = await client.summarize_ndvi(GEOMETRY, acquired_at=ACQUIRED_AT)

        payload = statistics_payloads[0]
        self.assertEqual(payload["input"]["bounds"]["geometry"], GEOMETRY)
        self.assertEqual(
            payload["input"]["bounds"]["properties"]["crs"],
            "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
        )
        self.assertEqual(
            payload["input"]["data"],
            [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "maxCloudCoverage": 80.0,
                        "mosaickingOrder": "mostRecent",
                    },
                }
            ],
        )
        self.assertEqual(
            payload["aggregation"],
            {
                "timeRange": {
                    "from": "2026-07-30T00:00:00Z",
                    "to": "2026-07-31T00:00:00Z",
                },
                "aggregationInterval": {"of": "P1D"},
                "evalscript": NDVI_SUMMARY_EVALSCRIPT,
                "resx": 0.00009,
                "resy": 0.00009,
            },
        )
        self.assertIn("[0, 1, 3, 6, 8, 9, 10, 11]", NDVI_SUMMARY_EVALSCRIPT)
        self.assertEqual(NDVI_SUMMARY_EVALSCRIPT_VERSION, "agriscope-ndvi-summary-v1")
        self.assertEqual(token_calls, 1)
        self.assertEqual(len(statistics_payloads), 2)
        self.assertEqual(summary.mean, 0.42)
        self.assertEqual(summary.valid_sample_count, 80)
        self.assertEqual(summary.valid_pixel_ratio, 0.8)
        self.assertEqual(second, summary)

    async def test_ndvi_grid_budget_rejects_oversize_before_oauth_or_statistics(self):
        token_calls = 0
        statistics_calls = 0

        async def send_token(_url, _form, _timeout):
            nonlocal token_calls
            token_calls += 1
            return 200, {"access_token": "token", "expires_in": 3600}

        async def send_statistics(_url, _payload, _token, _timeout):
            nonlocal statistics_calls
            statistics_calls += 1
            return 200, ndvi_response()

        boundary_client = self.client(send_token=send_token, send_statistics=send_statistics)
        boundary_payload = boundary_client.build_statistics_payload(
            square_geometry(MAX_SINGLE_AXIS_SPAN_DEGREES),
            acquired_at=ACQUIRED_AT,
        )
        self.assertEqual(boundary_payload["aggregation"]["resx"], 0.00009)
        self.assertEqual(boundary_payload["aggregation"]["resy"], 0.00009)

        valid_summary = await boundary_client.summarize_ndvi(
            square_geometry(MAX_SINGLE_AXIS_SPAN_DEGREES),
            acquired_at=ACQUIRED_AT,
        )
        self.assertEqual(valid_summary.sample_count, 100)
        self.assertEqual(token_calls, 1)
        self.assertEqual(statistics_calls, 1)

        token_calls = 0
        statistics_calls = 0
        oversize_client = self.client(send_token=send_token, send_statistics=send_statistics)

        with self.assertRaises(CdseProcessRequestTooLarge):
            await oversize_client.summarize_ndvi(
                square_geometry(SMALLEST_SPAN_ABOVE_GRID_LIMIT),
                acquired_at=ACQUIRED_AT,
            )

        self.assertEqual(token_calls, 0)
        self.assertEqual(statistics_calls, 0)

    async def test_ndvi_401_gets_one_shared_token_renewal(self):
        token_calls = 0
        statistics_tokens: list[str] = []

        async def send_token(_url, _form, _timeout):
            nonlocal token_calls
            token_calls += 1
            return 200, {"access_token": f"token-{token_calls}", "expires_in": 3600}

        async def send_statistics(_url, _payload, token, _timeout):
            statistics_tokens.append(token)
            return (401, {}) if token == "token-1" else (200, ndvi_response())

        summary = await self.client(
            send_token=send_token,
            send_statistics=send_statistics,
        ).summarize_ndvi(GEOMETRY, acquired_at=ACQUIRED_AT)

        self.assertEqual(summary.mean, 0.42)
        self.assertEqual(token_calls, 2)
        self.assertEqual(statistics_tokens, ["token-1", "token-2"])

    async def test_ndvi_no_data_and_malformed_statistics_fail_closed(self):
        async def send_token(_url, _form, _timeout):
            return 200, {"access_token": "token", "expires_in": 3600}

        cases = [
            ({"data": [], "status": "OK"}, CdseProcessNoData),
            (ndvi_response(sample_count=100, no_data_count=100), CdseProcessNoData),
            (ndvi_response(mean=1.1, maximum=1.1), CdseProcessMalformedResponse),
            (ndvi_response(sample_count=10, no_data_count=11), CdseProcessMalformedResponse),
            (
                {
                    **ndvi_response(),
                    "data": [{**ndvi_response()["data"][0], "interval": None}],
                },
                CdseProcessMalformedResponse,
            ),
            (
                {
                    **ndvi_response(),
                    "data": [
                        {
                            **ndvi_response()["data"][0],
                            "interval": {
                                "from": "2026-07-29T00:00:00Z",
                                "to": "2026-07-30T00:00:00Z",
                            },
                        }
                    ],
                },
                CdseProcessMalformedResponse,
            ),
            (ndvi_response(mean=float("nan")), CdseProcessMalformedResponse),
            (ndvi_response(mean=float("inf")), CdseProcessMalformedResponse),
            (ndvi_response(mean=10**10000), CdseProcessMalformedResponse),
            ({"data": [{}], "status": "OK"}, CdseProcessMalformedResponse),
            (
                {
                    **ndvi_response(),
                    "data": [
                        {
                            **ndvi_response()["data"][0],
                            "outputs": {
                                **ndvi_response()["data"][0]["outputs"],
                                "unexpected": {},
                            },
                        }
                    ],
                },
                CdseProcessMalformedResponse,
            ),
            ({"data": [], "status": "FAILED"}, CdseProcessMalformedResponse),
        ]
        for response, expected in cases:

            async def send_statistics(_url, _payload, _token, _timeout, response=response):
                return 200, response

            with self.subTest(expected=expected.__name__), self.assertRaises(expected):
                await self.client(
                    send_token=send_token,
                    send_statistics=send_statistics,
                ).summarize_ndvi(GEOMETRY, acquired_at=ACQUIRED_AT)

    async def test_empty_http_statuses_are_exposed_before_json_parsing(self):
        class EmptyResponse:
            def __init__(self, status_code):
                self.status_code = status_code

            def json(self):
                raise AssertionError("empty error body must not be parsed")

        class FakeClient:
            def __init__(self, response):
                self.response = response

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, *_args, **_kwargs):
                return self.response

        client = self.client()
        for status_code in (204, 401, 429, 503):
            with (
                self.subTest(status_code=status_code),
                patch("httpx.AsyncClient", return_value=FakeClient(EmptyResponse(status_code))),
            ):
                self.assertEqual(
                    await client._statistics({}, "token"),
                    (status_code, {}),
                )

    async def test_empty_http_401_renews_then_parses_success(self):
        token_calls = 0
        responses = [
            (401, None),
            (200, ndvi_response()),
        ]
        observed_tokens: list[str] = []

        async def send_token(_url, _form, _timeout):
            nonlocal token_calls
            token_calls += 1
            return 200, {"access_token": f"token-{token_calls}", "expires_in": 3600}

        class FakeResponse:
            def __init__(self, status_code, body):
                self.status_code = status_code
                self.body = body

            def json(self):
                if self.body is None:
                    raise AssertionError("empty 401 body must not be parsed")
                return self.body

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def post(self, _url, *, headers, **_kwargs):
                observed_tokens.append(headers["Authorization"])
                return FakeResponse(*responses.pop(0))

        client = self.client(send_token=send_token)
        with patch("httpx.AsyncClient", return_value=FakeClient()):
            summary = await client.summarize_ndvi(GEOMETRY, acquired_at=ACQUIRED_AT)

        self.assertEqual(summary.mean, 0.42)
        self.assertEqual(token_calls, 2)
        self.assertEqual(observed_tokens, ["Bearer token-1", "Bearer token-2"])

    async def test_ndvi_provider_statuses_are_typed_and_bounded(self):
        async def send_token(_url, _form, _timeout):
            return 200, {"access_token": "token", "expires_in": 3600}

        cases = [
            ((204, {}), CdseProcessNoData),
            ((429, {}), CdseProcessRateLimited),
            ((503, {}), CdseProcessUnavailable),
        ]
        for response, expected in cases:

            async def send_statistics(_url, _payload, _token, _timeout, response=response):
                return response

            with self.subTest(expected=expected.__name__), self.assertRaises(expected):
                await self.client(
                    send_token=send_token,
                    send_statistics=send_statistics,
                ).summarize_ndvi(GEOMETRY, acquired_at=ACQUIRED_AT)

    async def test_no_data_rate_limit_and_malformed_responses_fail_closed(self):
        async def send_token(_url, _form, _timeout):
            return 200, {"access_token": "token", "expires_in": 3600}

        cases = [
            ((204, "", b""), CdseProcessNoData),
            ((429, "application/json", b"{}"), CdseProcessRateLimited),
            ((200, "application/json", b"{}"), CdseProcessMalformedResponse),
            ((200, "image/png", b"not-a-png"), CdseProcessMalformedResponse),
            ((503, "application/json", b"{}"), CdseProcessUnavailable),
        ]
        for response, expected in cases:

            async def send_process(_url, _payload, _token, _timeout, response=response):
                return response

            with self.subTest(expected=expected.__name__), self.assertRaises(expected):
                await self.client(
                    send_token=send_token,
                    send_process=send_process,
                ).render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)

    async def test_missing_credentials_fail_before_network_without_echoing_secret(self):
        called = False

        async def send_token(_url, _form, _timeout):
            nonlocal called
            called = True
            return 200, {}

        client = CdseProcessClient(
            client_id="",
            client_secret="do-not-print-this-secret",
            token_url="",
            process_url="https://process.example.test/process/v1",
            timeout_seconds=15,
            max_cloud_cover_percent=80.0,
            send_token=send_token,
        )
        with self.assertRaises(CdseProcessUnavailable) as raised:
            await client.render_true_color(GEOMETRY, acquired_at=ACQUIRED_AT)
        self.assertFalse(called)
        self.assertNotIn("do-not-print-this-secret", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
