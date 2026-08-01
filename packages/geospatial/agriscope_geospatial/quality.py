"""Observation quality policy for field-level satellite analysis."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class AnalysisConfidence(StrEnum):
    NOT_ANALYZABLE = "not_analyzable"
    LOW = "low"
    HIGH = "high"


@dataclass(frozen=True)
class QualityInput:
    valid_pixel_ratio: float
    cloud_pixel_ratio: float
    shadow_pixel_ratio: float
    no_data_ratio: float
    min_valid_ratio: float = 0.40
    high_confidence_valid_ratio: float = 0.70


@dataclass(frozen=True)
class QualityResult:
    quality_score: float
    analysis_confidence: AnalysisConfidence
    quality_reason: str
    display_analysis: bool


def _bounded_ratio(value: float, name: str) -> float:
    value = float(value)
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be between 0 and 1.")
    return value


def evaluate_quality(inputs: QualityInput) -> QualityResult:
    valid = _bounded_ratio(inputs.valid_pixel_ratio, "valid_pixel_ratio")
    cloud = _bounded_ratio(inputs.cloud_pixel_ratio, "cloud_pixel_ratio")
    shadow = _bounded_ratio(inputs.shadow_pixel_ratio, "shadow_pixel_ratio")
    no_data = _bounded_ratio(inputs.no_data_ratio, "no_data_ratio")

    min_valid = _bounded_ratio(inputs.min_valid_ratio, "min_valid_ratio")
    high_valid = _bounded_ratio(inputs.high_confidence_valid_ratio, "high_confidence_valid_ratio")
    if min_valid > high_valid:
        raise ValueError("min_valid_ratio must be less than or equal to high_confidence_valid_ratio.")

    penalty = (cloud * 0.45) + (shadow * 0.30) + (no_data * 0.25)
    score = max(0.0, min(1.0, valid * (1.0 - penalty)))

    if valid < min_valid:
        return QualityResult(
            quality_score=score,
            analysis_confidence=AnalysisConfidence.NOT_ANALYZABLE,
            quality_reason="ข้อมูลไม่เพียงพอจากเมฆ เงาเมฆ หรือ pixel ที่ใช้ไม่ได้",
            display_analysis=False,
        )

    if valid < high_valid:
        return QualityResult(
            quality_score=score,
            analysis_confidence=AnalysisConfidence.LOW,
            quality_reason="วิเคราะห์ได้แบบความมั่นใจต่ำเนื่องจาก pixel ที่ใช้ได้มีจำกัด",
            display_analysis=True,
        )

    return QualityResult(
        quality_score=score,
        analysis_confidence=AnalysisConfidence.HIGH,
        quality_reason="วิเคราะห์ได้จากสัดส่วน pixel ที่ใช้ได้เพียงพอ",
        display_analysis=True,
    )
