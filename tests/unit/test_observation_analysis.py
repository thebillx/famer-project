from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pytest
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds

from apps.api.agriscope_api.providers.cdse_process import (
    CdseProcessClient,
    _validate_ndvi_geotiff,
)
from apps.api.agriscope_api.services.satellite import (
    COMPARISON_SUPPORT_POLICY_VERSION,
    _change_geometry,
    _render_ndvi_png,
)


FIELD = {
    "type": "Polygon",
    "coordinates": [[[100.0, 13.0], [100.01, 13.0], [100.01, 13.01], [100.0, 13.01], [100.0, 13.0]]],
}
HALF_FIELD = {
    "type": "Polygon",
    "coordinates": [[[100.0, 13.0], [100.005, 13.0], [100.005, 13.01], [100.0, 13.01], [100.0, 13.0]]],
}


def _tiff(values: np.ndarray, valid: np.ndarray | None = None) -> bytes:
    valid = valid if valid is not None else np.ones(values.shape, dtype=np.float32)
    profile = {
        "driver": "GTiff", "width": values.shape[1], "height": values.shape[0],
        "count": 2, "dtype": "float32", "crs": "EPSG:4326",
        "transform": from_bounds(100.0, 13.0, 100.01, 13.01, values.shape[1], values.shape[0]),
        "compress": "deflate",
    }
    with MemoryFile() as memory:
        with memory.open(**profile) as dataset:
            dataset.write(values.astype(np.float32), 1)
            dataset.write(valid.astype(np.float32), 2)
        return memory.read()


def _change(
    before: np.ndarray,
    after: np.ndarray,
    *,
    before_valid: np.ndarray | None = None,
    after_valid: np.ndarray | None = None,
    field=FIELD,
    minimum: float = 0.40,
):
    return _change_geometry(
        _tiff(before, before_valid),
        _tiff(after, after_valid),
        field,
        minimum_common_support_ratio=minimum,
    )


def test_ndvi_payload_is_observation_day_float_raster():
    client = CdseProcessClient(client_id="x", client_secret="y", token_url="https://token",
        process_url="https://process", timeout_seconds=10, max_cloud_cover_percent=80)
    payload = client.build_ndvi_raster_payload(FIELD, acquired_at=datetime(2026, 8, 17, 3, tzinfo=UTC))
    assert payload["output"]["responses"][0]["format"]["type"] == "image/tiff"
    assert payload["output"]["width"] <= 512
    assert payload["input"]["data"][0]["dataFilter"]["timeRange"]["from"] == "2026-08-17T02:59:59Z"
    assert 'sampleType: "FLOAT32"' in payload["evalscript"]


def test_numeric_raster_validates_and_renders_transparent_png():
    values = np.array([[0.8, 0.7], [0.5, -9999]], dtype=np.float32)
    valid = np.array([[1, 1], [1, 0]], dtype=np.float32)
    value = _validate_ndvi_geotiff(_tiff(values, valid), expected_geometry=FIELD)
    assert value.crs == "EPSG:4326"
    assert value.valid_pixel_ratio == 0.75
    png = _render_ndvi_png(value.geotiff)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")


def test_numeric_raster_rejects_provider_bounds_outside_authorized_field():
    shifted = {"type": "Polygon", "coordinates": [[[101.0, 14.0], [101.01, 14.0],
        [101.01, 14.01], [101.0, 14.01], [101.0, 14.0]]]}
    with pytest.raises(Exception, match="bounds do not match"):
        _validate_ndvi_geotiff(_tiff(np.full((2, 2), 0.7, dtype=np.float32)),
            expected_geometry=shifted)


def test_comparison_uses_common_support_for_means_when_noncommon_valid_pixels_differ():
    before = np.array([[0.5, 0.9], [0.1, 0.2]], dtype=np.float32)
    after = np.array([[0.5, 0.9], [-0.8, -0.7]], dtype=np.float32)
    before_valid = np.array([[1, 1], [0, 0]], dtype=np.float32)
    after_valid = np.ones((2, 2), dtype=np.float32)

    result = _change(before, after, before_valid=before_valid, after_valid=after_valid, minimum=0.50)

    assert result.assessable is True
    assert result.before_mean == pytest.approx(0.7)
    assert result.after_mean == pytest.approx(0.7)
    assert result.after_mean - result.before_mean == pytest.approx(0.0)
    assert result.changed_area_sqm == 0.0
    assert result.geometry == {"type": "MultiPolygon", "coordinates": []}
    assert result.support.common_valid_pixel_count == 2
    assert result.support.field_grid_pixel_count == 4
    assert result.support.common_support_ratio == pytest.approx(0.50)


def test_comparison_detects_real_change_in_common_pixels_and_changed_area():
    before = np.array([[0.5, 0.9], [0.1, 0.2]], dtype=np.float32)
    after = np.array([[0.3, 0.6], [0.8, 0.9]], dtype=np.float32)
    common = np.array([[1, 1], [0, 0]], dtype=np.float32)

    result = _change(before, after, before_valid=common, after_valid=common, minimum=0.50)

    assert result.assessable is True
    assert result.before_mean == pytest.approx(0.7)
    assert result.after_mean == pytest.approx(0.45)
    assert result.after_mean - result.before_mean == pytest.approx(-0.25)
    assert result.geometry is not None
    assert result.geometry["type"] == "MultiPolygon"
    assert result.geometry["coordinates"]
    assert result.changed_area_sqm is not None and result.changed_area_sqm > 0


def test_comparison_returns_not_assessable_without_common_support():
    values = np.full((3, 3), 0.7, dtype=np.float32)
    invalid = np.zeros((3, 3), dtype=np.float32)

    result = _change(values, values, before_valid=invalid, after_valid=invalid)

    assert result.assessable is False
    assert result.before_mean is None
    assert result.after_mean is None
    assert result.geometry is None
    assert result.changed_area_sqm is None
    assert result.support.reason == "NO_COMMON_SUPPORT"
    assert result.support.common_support_ratio == 0.0


def test_comparison_rejects_support_just_below_policy_threshold():
    values = np.full((2, 5), 0.7, dtype=np.float32)
    valid = np.zeros((2, 5), dtype=np.float32)
    valid.flat[:3] = 1

    result = _change(values, values, before_valid=valid, after_valid=valid, minimum=0.40)

    assert result.assessable is False
    assert result.support.common_valid_pixel_count == 3
    assert result.support.field_grid_pixel_count == 10
    assert result.support.common_support_ratio == pytest.approx(0.30)
    assert result.support.reason == "BELOW_MINIMUM_COMMON_SUPPORT"
    assert result.support.minimum_required_ratio == pytest.approx(0.40)
    assert result.support.policy_version == COMPARISON_SUPPORT_POLICY_VERSION
    assert result.support.denominator == "FIELD_GRID_PIXEL_CENTERS"


def test_comparison_accepts_support_exactly_at_policy_threshold():
    values = np.full((2, 5), 0.7, dtype=np.float32)
    valid = np.zeros((2, 5), dtype=np.float32)
    valid.flat[:4] = 1

    result = _change(values, values, before_valid=valid, after_valid=valid, minimum=0.40)

    assert result.assessable is True
    assert result.support.common_valid_pixel_count == 4
    assert result.support.field_grid_pixel_count == 10
    assert result.support.common_support_ratio == pytest.approx(0.40)
    assert result.support.reason == "SUFFICIENT_COMMON_SUPPORT"
    assert result.changed_area_sqm == 0.0


def test_comparison_denominator_counts_only_grid_pixel_centers_inside_field():
    values = np.full((2, 2), 0.7, dtype=np.float32)

    result = _change(values, values, field=HALF_FIELD, minimum=1.0)

    assert result.assessable is True
    assert result.support.field_grid_pixel_count == 2
    assert result.support.common_valid_pixel_count == 2
    assert result.support.common_support_ratio == pytest.approx(1.0)


def test_change_geometry_returns_zero_only_when_support_is_assessable_and_no_pixel_crosses_threshold():
    values = np.full((3, 3), 0.7, dtype=np.float32)

    result = _change(values, values, minimum=0.40)

    assert result.assessable is True
    assert result.geometry == {"type": "MultiPolygon", "coordinates": []}
    assert result.changed_area_sqm == 0.0
    assert result.before_mean == pytest.approx(0.7)
    assert result.after_mean == pytest.approx(0.7)
