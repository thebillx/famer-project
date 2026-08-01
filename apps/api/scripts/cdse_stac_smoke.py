"""Opt-in live CDSE STAC smoke check for SATELLITE-001.

Run manually only. This performs one metadata search and does not download rasters.
"""

from __future__ import annotations

import asyncio
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.agriscope_api.core.config import settings_from_env  # noqa: E402
from apps.api.agriscope_api.providers.cdse_stac import CdseStacClient  # noqa: E402


THAILAND_TEST_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.8], [98.98, 18.79]]],
}


async def main() -> None:
    settings = settings_from_env()
    result = await CdseStacClient(
        stac_url=settings.cdse_stac_url,
        timeout_seconds=settings.satellite_search_timeout_seconds,
        lookback_days=settings.satellite_search_lookback_days,
        max_cloud_cover_percent=settings.satellite_max_cloud_cover_percent,
    ).search_latest(THAILAND_TEST_POLYGON)
    body = {
        "status": "available" if result.item else "no_data",
        "searched_at": result.searched_at.isoformat(),
        "item_id": result.item.item_id if result.item else None,
        "collection": result.item.collection if result.item else None,
        "acquired_at": result.item.acquired_at.isoformat() if result.item else None,
        "cloud_cover_percent": result.item.cloud_cover_percent if result.item else None,
    }
    print(json.dumps(body, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
