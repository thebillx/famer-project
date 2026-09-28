#!/usr/bin/env python3
"""Seed the deterministic AgriScope local demo dataset."""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.agriscope_api.core.config import load_settings
from apps.api.agriscope_api.db.session import create_engine, create_session_factory
from apps.api.agriscope_api.demo import (
    DEMO_EMAIL,
    DEMO_FARM_NAME,
    DEMO_PASSWORD,
    seed_demo,
)


async def _run(quiet: bool) -> None:
    if os.environ.get("APP_ENV", "development").lower() == "production":
        raise SystemExit("Refusing to seed demo data when APP_ENV=production")

    settings = load_settings()
    engine = create_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            try:
                result = await seed_demo(session, settings)
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    finally:
        await engine.dispose()

    if not quiet:
        print("AgriScope demo data is ready.")
        print(f"Farm: {DEMO_FARM_NAME}")
        print(f"Email: {DEMO_EMAIL}")
        print(f"Password: {DEMO_PASSWORD}")
        print(f"Farm ID: {result.farm_id}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    asyncio.run(_run(args.quiet))


if __name__ == "__main__":
    main()
