from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import UUID

from apps.api.agriscope_api.core.config import settings_from_env
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.providers.cdse_process import (
    CdseNdviSummary,
    CdseProcessNoData,
    CdseProcessRateLimited,
    CdseProcessRequestTooLarge,
    CdseProcessUnavailable,
    CdseTrueColorPreview,
)
from apps.api.agriscope_api.repositories.farms import FieldRecord
from apps.api.agriscope_api.services.satellite import SatelliteService
from packages.geospatial.agriscope_geospatial.field_geometry import geometry_fingerprint


USER_ID = UUID("00000000-0000-0000-0000-000000000001")
ORG_ID = UUID("00000000-0000-0000-0000-000000000010")
FARM_ID = UUID("00000000-0000-0000-0000-000000000020")
FIELD_ID = UUID("00000000-0000-0000-0000-000000000030")
ACQUISITION_ID = UUID("00000000-0000-0000-0000-000000000040")
ACQUIRED_AT = datetime(2026, 7, 30, 3, 45, 41, tzinfo=UTC)
GEOMETRY = {
    "type": "Polygon",
    "coordinates": [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.80], [98.98, 18.79]]],
}
FIELD = FieldRecord(
    id=FIELD_ID,
    farm_id=FARM_ID,
    organization_id=ORG_ID,
    name="Field",
    geometry=GEOMETRY,
    area_sqm=Decimal("1000"),
    area_rai=Decimal("0.625"),
    status="active",
    created_at=ACQUIRED_AT,
    updated_at=ACQUIRED_AT,
)
SUMMARY_ACQUISITION = SimpleNamespace(
    id=ACQUISITION_ID,
    field_id=FIELD_ID,
    organization_id=ORG_ID,
    acquired_at=ACQUIRED_AT,
    cloud_cover_percent=None,
    provider_metadata={"geometry_hash": geometry_fingerprint(GEOMETRY)},
)


class FakeProcessProvider:
    def __init__(self, result=None, error: Exception | None = None) -> None:
        self.result = result
        self.error = error
        self.calls: list[tuple[dict, datetime]] = []

    async def render_true_color(self, geometry, *, acquired_at):
        self.calls.append((geometry, acquired_at))
        if self.error is not None:
            raise self.error
        return self.result

    async def summarize_ndvi(self, geometry, *, acquired_at):
        self.calls.append((geometry, acquired_at))
        if self.error is not None:
            raise self.error
        return self.result


class SatellitePreviewServiceTests(unittest.IsolatedAsyncioTestCase):
    def settings(self):
        return settings_from_env({"SATELLITE_PREVIEW_MIN_VALID_RATIO": "0.40"})

    async def call(self, *, acquisition=SimpleNamespace(acquired_at=ACQUIRED_AT), provider):
        repository = SimpleNamespace(get_latest_acquisition=AsyncMock(return_value=acquisition))
        with patch(
            "apps.api.agriscope_api.services.satellite.SatelliteRepository",
            return_value=repository,
        ):
            return await SatelliteService(
                object(),
                self.settings(),
                process_provider=provider,
            ).get_preview(
                user_id=USER_ID,
                field_id=FIELD_ID,
                authorized_field=FIELD,
            )

    async def call_summary(
        self,
        *,
        acquisition=SUMMARY_ACQUISITION,
        provider,
    ):
        snapshot = SimpleNamespace(
            acquired_at=ACQUIRED_AT,
            algorithm_version="agriscope-ndvi-summary-v1",
            ndvi_mean=Decimal("0.42"),
            ndvi_min=Decimal("0.1"),
            ndvi_max=Decimal("0.75"),
            ndvi_stddev=Decimal("0.12"),
            sample_count=100,
            valid_sample_count=80,
            valid_pixel_ratio=Decimal("0.8"),
        )
        repository = SimpleNamespace(
            get_latest_acquisition=AsyncMock(return_value=acquisition),
            get_ndvi_snapshot=AsyncMock(return_value=None),
            lock_observation_for_analysis=AsyncMock(),
            get_previous_ndvi_snapshot=AsyncMock(return_value=None),
            upsert_ndvi_snapshot=AsyncMock(return_value=snapshot),
        )
        with patch(
            "apps.api.agriscope_api.services.satellite.SatelliteRepository",
            return_value=repository,
        ):
            return await SatelliteService(
                object(),
                self.settings(),
                process_provider=provider,
            ).get_ndvi_summary(
                user_id=USER_ID,
                field_id=FIELD_ID,
                authorized_field=FIELD,
            )

    async def test_success_uses_only_authorized_persisted_field_and_acquisition(self):
        provider = FakeProcessProvider(
            CdseTrueColorPreview(image_png=b"png", valid_pixel_ratio=0.75)
        )

        result = await self.call(provider=provider)

        self.assertEqual(result.field_id, FIELD_ID)
        self.assertEqual(result.image_png, b"png")
        self.assertEqual(result.valid_pixel_ratio, 0.75)
        self.assertEqual(provider.calls, [(GEOMETRY, ACQUIRED_AT)])

    async def test_missing_acquisition_stops_before_provider(self):
        provider = FakeProcessProvider()

        with self.assertRaises(ApiException) as raised:
            await self.call(acquisition=None, provider=provider)

        self.assertEqual(
            (raised.exception.status_code, raised.exception.code), (409, "satellite_not_searched")
        )
        self.assertEqual(provider.calls, [])

    async def test_low_valid_coverage_returns_no_image(self):
        provider = FakeProcessProvider(
            CdseTrueColorPreview(image_png=b"private-image", valid_pixel_ratio=0.39)
        )

        with self.assertRaises(ApiException) as raised:
            await self.call(provider=provider)

        self.assertEqual(
            (raised.exception.status_code, raised.exception.code),
            (422, "satellite_insufficient_quality"),
        )
        self.assertNotIn("private-image", str(raised.exception))

    async def test_provider_states_are_reduced_to_typed_safe_errors(self):
        cases = [
            (CdseProcessNoData("private"), 422, "satellite_no_data"),
            (CdseProcessRateLimited("private"), 429, "rate_limited"),
            (
                CdseProcessUnavailable("private"),
                503,
                "satellite_temporarily_unavailable",
            ),
        ]
        for error, status, code in cases:
            with self.subTest(code=code), self.assertRaises(ApiException) as raised:
                await self.call(provider=FakeProcessProvider(error=error))
            self.assertEqual((raised.exception.status_code, raised.exception.code), (status, code))
            self.assertNotIn("private", raised.exception.message)

    async def test_ndvi_summary_uses_authorized_field_and_persisted_acquisition(self):
        provider = FakeProcessProvider(
            CdseNdviSummary(
                mean=0.42,
                minimum=0.1,
                maximum=0.75,
                standard_deviation=0.12,
                sample_count=100,
                valid_sample_count=80,
                valid_pixel_ratio=0.8,
            )
        )

        result = await self.call_summary(provider=provider)

        self.assertEqual(result.field_id, FIELD_ID)
        self.assertEqual(result.ndvi_mean, 0.42)
        self.assertEqual(result.valid_sample_count, 80)
        self.assertEqual(result.algorithm_version, "agriscope-ndvi-summary-v1")
        self.assertEqual(provider.calls, [(GEOMETRY, ACQUIRED_AT)])

    async def test_ndvi_summary_rechecks_cache_after_acquisition_lock(self):
        cached = SimpleNamespace(
            acquired_at=ACQUIRED_AT,
            algorithm_version="agriscope-ndvi-summary-v1",
            ndvi_mean=Decimal("0.42"),
            ndvi_min=Decimal("0.1"),
            ndvi_max=Decimal("0.75"),
            ndvi_stddev=Decimal("0.12"),
            sample_count=100,
            valid_sample_count=80,
            valid_pixel_ratio=Decimal("0.8"),
        )
        repository = SimpleNamespace(
            get_latest_acquisition=AsyncMock(return_value=SUMMARY_ACQUISITION),
            get_ndvi_snapshot=AsyncMock(side_effect=[None, cached]),
            lock_observation_for_analysis=AsyncMock(),
            get_previous_ndvi_snapshot=AsyncMock(return_value=None),
            upsert_ndvi_snapshot=AsyncMock(),
        )
        provider = FakeProcessProvider()
        with patch(
            "apps.api.agriscope_api.services.satellite.SatelliteRepository",
            return_value=repository,
        ):
            result = await SatelliteService(
                object(),
                self.settings(),
                process_provider=provider,
            ).get_ndvi_summary(
                user_id=USER_ID,
                field_id=FIELD_ID,
                authorized_field=FIELD,
            )

        self.assertEqual(result.ndvi_mean, 0.42)
        repository.lock_observation_for_analysis.assert_awaited_once_with(
            ACQUISITION_ID, FIELD_ID
        )
        self.assertEqual(repository.get_ndvi_snapshot.await_count, 2)
        self.assertEqual(provider.calls, [])

    async def test_ndvi_summary_missing_or_insufficient_data_returns_no_values(self):
        provider = FakeProcessProvider(
            CdseNdviSummary(
                mean=0.42,
                minimum=0.1,
                maximum=0.75,
                standard_deviation=0.12,
                sample_count=100,
                valid_sample_count=39,
                valid_pixel_ratio=0.39,
            )
        )
        with self.assertRaises(ApiException) as insufficient:
            await self.call_summary(provider=provider)
        self.assertEqual(
            (insufficient.exception.status_code, insufficient.exception.code),
            (422, "satellite_insufficient_quality"),
        )
        self.assertNotIn("0.42", str(insufficient.exception))

        no_acquisition = FakeProcessProvider()
        with self.assertRaises(ApiException) as missing:
            await self.call_summary(acquisition=None, provider=no_acquisition)
        self.assertEqual(
            (missing.exception.status_code, missing.exception.code),
            (409, "satellite_not_searched"),
        )
        self.assertEqual(no_acquisition.calls, [])

    async def test_ndvi_provider_states_use_existing_safe_error_contract(self):
        cases = [
            (CdseProcessNoData("private"), 422, "satellite_no_data"),
            (
                CdseProcessRequestTooLarge("private"),
                422,
                "satellite_request_too_large",
            ),
            (CdseProcessRateLimited("private"), 429, "rate_limited"),
            (
                CdseProcessUnavailable("private"),
                503,
                "satellite_temporarily_unavailable",
            ),
        ]
        for error, status, code in cases:
            with self.subTest(code=code), self.assertRaises(ApiException) as raised:
                await self.call_summary(provider=FakeProcessProvider(error=error))
            self.assertEqual((raised.exception.status_code, raised.exception.code), (status, code))
            self.assertNotIn("private", raised.exception.message)

    async def test_ndvi_summary_authorizes_before_acquisition_or_provider(self):
        provider = FakeProcessProvider()
        field_repository = SimpleNamespace(get_field=AsyncMock(return_value=None))
        with (
            patch(
                "apps.api.agriscope_api.services.satellite.FarmRepository",
                return_value=field_repository,
            ),
            patch("apps.api.agriscope_api.services.satellite.SatelliteRepository") as satellite,
            self.assertRaises(ApiException) as raised,
        ):
            await SatelliteService(
                object(),
                self.settings(),
                process_provider=provider,
            ).get_ndvi_summary(user_id=USER_ID, field_id=FIELD_ID)

        self.assertEqual((raised.exception.status_code, raised.exception.code), (404, "not_found"))
        satellite.assert_not_called()
        self.assertEqual(provider.calls, [])


if __name__ == "__main__":
    unittest.main()
