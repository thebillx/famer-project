from __future__ import annotations

import binascii
from struct import pack
from urllib.parse import parse_qs
import zlib

from fastapi import FastAPI, Request, Response


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


@app.post("/token")
async def token(request: Request) -> dict[str, object]:
    form = parse_qs((await request.body()).decode("utf-8"), strict_parsing=True)
    if form != {
        "grant_type": ["client_credentials"],
        "client_id": ["e2e-client"],
        "client_secret": ["e2e-secret"],
    }:
        return {"error": "invalid_client"}
    return {"access_token": "e2e-access-token", "expires_in": 3600}


@app.post("/process")
async def process(request: Request) -> Response:
    if request.headers.get("authorization") != "Bearer e2e-access-token":
        return Response(status_code=401)
    payload = await request.json()
    if payload.get("input", {}).get("data", [{}])[0].get("type") != "sentinel-2-l2a":
        return Response(status_code=422)
    return Response(content=_fixture_png(), media_type="image/png")


@app.post("/statistics")
async def statistics(request: Request):
    if request.headers.get("authorization") != "Bearer e2e-access-token":
        return Response(status_code=401)
    payload = await request.json()
    if payload.get("input", {}).get("data", [{}])[0].get("type") != "sentinel-2-l2a":
        return Response(status_code=422)
    aggregation = payload.get("aggregation", {})
    if aggregation.get("aggregationInterval") != {"of": "P1D"}:
        return Response(status_code=422)
    return {
        "data": [
            {
                "interval": aggregation.get("timeRange"),
                "outputs": {
                    "ndvi": {
                        "bands": {
                            "B0": {
                                "stats": {
                                    "min": 0.12,
                                    "max": 0.76,
                                    "mean": 0.44,
                                    "stDev": 0.11,
                                    "sampleCount": 100,
                                    "noDataCount": 15,
                                }
                            }
                        }
                    }
                },
            }
        ],
        "status": "OK",
    }


def _fixture_png() -> bytes:
    width = height = 8
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row.extend((35 + x * 8, 95 + y * 7, 45 + x * 4, 255))
        rows.append(bytes(row))
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        signature
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(b"".join(rows)))
        + _chunk(b"IEND", b"")
    )


def _chunk(kind: bytes, data: bytes) -> bytes:
    return (
        pack(">I", len(data)) + kind + data + pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)
    )
