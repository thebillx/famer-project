"""Satellite index formulas with epsilon-protected division."""

from __future__ import annotations

import math

EPSILON = 1e-9


def _clean(value: float) -> float:
    value = float(value)
    if math.isnan(value) or math.isinf(value):
        raise ValueError("Band values must be finite numbers.")
    return value


def safe_ratio(numerator: float, denominator: float, epsilon: float = EPSILON) -> float:
    """Return numerator / denominator while preventing division by zero."""

    numerator = _clean(numerator)
    denominator = _clean(denominator)
    if abs(denominator) < epsilon:
        return 0.0
    return numerator / denominator


def ndvi(b08: float, b04: float) -> float:
    return safe_ratio(_clean(b08) - _clean(b04), _clean(b08) + _clean(b04))


def evi(b08: float, b04: float, b02: float) -> float:
    numerator = 2.5 * (_clean(b08) - _clean(b04))
    denominator = _clean(b08) + 6.0 * _clean(b04) - 7.5 * _clean(b02) + 1.0
    return safe_ratio(numerator, denominator)


def savi(b08: float, b04: float) -> float:
    numerator = 1.5 * (_clean(b08) - _clean(b04))
    denominator = _clean(b08) + _clean(b04) + 0.5
    return safe_ratio(numerator, denominator)


def ndmi(b08: float, b11: float) -> float:
    return safe_ratio(_clean(b08) - _clean(b11), _clean(b08) + _clean(b11))


def ndwi(b03: float, b08: float) -> float:
    return safe_ratio(_clean(b03) - _clean(b08), _clean(b03) + _clean(b08))


def ndre(b8a: float, b05: float) -> float:
    return safe_ratio(_clean(b8a) - _clean(b05), _clean(b8a) + _clean(b05))


def nbr(b08: float, b12: float) -> float:
    return safe_ratio(_clean(b08) - _clean(b12), _clean(b08) + _clean(b12))


def bare_soil_index(b11: float, b04: float, b08: float, b02: float) -> float:
    numerator = (_clean(b11) + _clean(b04)) - (_clean(b08) + _clean(b02))
    denominator = (_clean(b11) + _clean(b04)) + (_clean(b08) + _clean(b02))
    return safe_ratio(numerator, denominator)
