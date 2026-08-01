"""Runtime configuration contract for the API service."""

from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    app_url: str
    cdse_catalog_url: str
    cdse_process_url: str
    cdse_statistical_url: str
    valid_pixel_min_ratio: float
    valid_pixel_low_confidence_ratio: float


def load_settings() -> Settings:
    return Settings(
        app_url=os.getenv("APP_URL", "http://localhost:3000"),
        cdse_catalog_url=os.getenv(
            "CDSE_CATALOG_URL", "https://sh.dataspace.copernicus.eu/catalog/v1"
        ),
        cdse_process_url=os.getenv(
            "CDSE_PROCESS_URL", "https://sh.dataspace.copernicus.eu/process/v1"
        ),
        cdse_statistical_url=os.getenv(
            "CDSE_STATISTICAL_URL", "https://sh.dataspace.copernicus.eu/statistics/v1"
        ),
        valid_pixel_min_ratio=float(os.getenv("AGRI_VALID_PIXEL_MIN_RATIO", "0.40")),
        valid_pixel_low_confidence_ratio=float(
            os.getenv("AGRI_VALID_PIXEL_LOW_CONFIDENCE_RATIO", "0.70")
        ),
    )
