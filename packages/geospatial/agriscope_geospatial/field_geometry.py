"""Field-boundary geometry validation helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

RAI_PER_SQM = 1 / 1600


@dataclass(frozen=True)
class GeometryValidationResult:
    geometry: dict[str, Any]


def sqm_to_rai(area_sqm: float) -> float:
    return round(float(area_sqm) * RAI_PER_SQM, 4)


def validate_field_polygon(geometry: dict[str, Any]) -> GeometryValidationResult:
    try:
        from shapely.geometry import shape  # type: ignore[import-untyped]
    except Exception:  # pragma: no cover - dependency-light unit path
        shape = None

    if not isinstance(geometry, dict):
        raise ValueError("geometry must be a GeoJSON object")
    if geometry.get("type") != "Polygon":
        raise ValueError("field geometry must be a GeoJSON Polygon")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("polygon coordinates are required")
    exterior = coordinates[0]
    if not isinstance(exterior, list) or len(exterior) < 4:
        raise ValueError("polygon exterior ring must have at least 4 positions")
    if exterior[0] != exterior[-1]:
        raise ValueError("polygon exterior ring must be closed")

    for ring in coordinates:
        if not isinstance(ring, list) or len(ring) < 4:
            raise ValueError("polygon rings must have at least 4 positions")
        if ring[0] != ring[-1]:
            raise ValueError("polygon rings must be closed")
        for position in ring:
            if not isinstance(position, list) or len(position) != 2:
                raise ValueError("polygon positions must be [longitude, latitude]")
            longitude, latitude = position
            if not isinstance(longitude, int | float) or not isinstance(latitude, int | float):
                raise ValueError("polygon coordinates must be numeric")
            if not -180 <= float(longitude) <= 180:
                raise ValueError("longitude is out of range")
            if not -90 <= float(latitude) <= 90:
                raise ValueError("latitude is out of range")

    if shape is not None:
        polygon = shape(geometry)
        if polygon.is_empty:
            raise ValueError("polygon must not be empty")
        if not polygon.is_valid:
            raise ValueError("polygon must not self-intersect")
        if polygon.area <= 0:
            raise ValueError("polygon area must be greater than zero")
    else:
        if _has_self_intersection(exterior):
            raise ValueError("polygon must not self-intersect")
        if _shoelace_area(exterior) <= 0:
            raise ValueError("polygon area must be greater than zero")
    return GeometryValidationResult(geometry=geometry)


def _shoelace_area(ring: list[list[float]]) -> float:
    total = 0.0
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        total += (float(x1) * float(y2)) - (float(x2) * float(y1))
    return abs(total) / 2


def _has_self_intersection(ring: list[list[float]]) -> bool:
    segments = list(zip(ring[:-1], ring[1:]))
    for left_index, left in enumerate(segments):
        for right_index, right in enumerate(segments):
            if right_index <= left_index:
                continue
            if abs(left_index - right_index) == 1:
                continue
            if left_index == 0 and right_index == len(segments) - 1:
                continue
            if _segments_intersect(left[0], left[1], right[0], right[1]):
                return True
    return False


def _segments_intersect(a: list[float], b: list[float], c: list[float], d: list[float]) -> bool:
    def orientation(p: list[float], q: list[float], r: list[float]) -> float:
        return (float(q[1]) - float(p[1])) * (float(r[0]) - float(q[0])) - (
            float(q[0]) - float(p[0])
        ) * (float(r[1]) - float(q[1]))

    o1 = orientation(a, b, c)
    o2 = orientation(a, b, d)
    o3 = orientation(c, d, a)
    o4 = orientation(c, d, b)
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)
