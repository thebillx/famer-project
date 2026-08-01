from __future__ import annotations

from fastapi import FastAPI


app = FastAPI()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/search")
async def search(_payload: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "S2A_MSIL2A_20260730T034541_E2E",
                "collection": "sentinel-2-l2a",
                "properties": {
                    "datetime": "2026-07-30T03:45:41Z",
                    "eo:cloud_cover": 12.4,
                },
            }
        ],
    }
