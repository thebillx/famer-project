from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds

from apps.api.agriscope_api.providers.cdse_process import (
    CdseProcessClient,
    _validate_ndvi_geotiff,
)
from apps.api.agriscope_api.services.satellite import _change_geometry, _render_ndvi_png


FIELD = {
    "type": "Polygon",
    "coordinates": [[[100.0, 13.0], [100.01, 13.0], [100.01, 13.01], [100.0, 13.01], [100.0, 13.0]]],
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
    with __import__("pytest").raises(Exception, match="bounds do not match"):
        _validate_ndvi_geotiff(_tiff(np.full((2, 2), 0.7, dtype=np.float32)),
            expected_geometry=shifted)


def test_change_geometry_uses_real_connected_mask_and_geodesic_area():
    before = np.full((4, 4), 0.75, dtype=np.float32)
    after = before.copy()
    after[1:3, 1:3] = 0.50
    geometry, area_sqm, assessable = _change_geometry(_tiff(before), _tiff(after), FIELD)
    assert geometry["type"] == "MultiPolygon"
    assert geometry["coordinates"]
    assert area_sqm > 0
    assert assessable is True


def test_change_geometry_returns_empty_mask_without_inventing_polygon():
    values = np.full((3, 3), 0.7, dtype=np.float32)
    geometry, area_sqm, assessable = _change_geometry(_tiff(values), _tiff(values), FIELD)
    assert geometry == {"type": "MultiPolygon", "coordinates": []}
    assert area_sqm == 0
    assert assessable is True


def test_change_geometry_returns_not_assessable_without_common_valid_support():
    values = np.full((3, 3), 0.7, dtype=np.float32)
    invalid = np.zeros((3, 3), dtype=np.float32)
    geometry, area_sqm, assessable = _change_geometry(
        _tiff(values, invalid), _tiff(values, invalid), FIELD
    )
    assert geometry == {"type": "MultiPolygon", "coordinates": []}
    assert area_sqm is None
    assert assessable is False
