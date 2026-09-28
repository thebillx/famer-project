#!/usr/bin/env python3
"""Prefetch real Sentinel-2 evidence for the privacy-safe local demo target."""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, datetime, timedelta
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from apps.api.agriscope_api.core.config import AppEnvironment, load_settings
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.db.models import FieldAcquisition
from apps.api.agriscope_api.db.session import create_engine, create_session_factory
from apps.api.agriscope_api.demo import (
    DEMO_EMAIL,
    REAL_DEMO_COORDINATE_REFERENCE,
    REAL_DEMO_FARM_NAME,
    REAL_DEMO_FIELD_NAME,
    REAL_DEMO_PRIVACY_NOTE,
    REAL_DEMO_REFERENCE_LABEL,
    REAL_DEMO_REFERENCE_URL,
    ensure_real_demo_target,
)
from apps.api.agriscope_api.services.observation_history import ObservationHistoryService
from apps.api.agriscope_api.services.satellite import SatelliteService


SKIPPABLE_ANALYSIS_ERRORS = {
    "satellite_no_data",
    "satellite_insufficient_quality",
    "satellite_request_too_large",
}


async def _mark_cached_real(session, observation_id) -> None:
    acquisition = (
        await session.execute(
            select(FieldAcquisition).where(FieldAcquisition.id == observation_id)
        )
    ).scalar_one()
    metadata = dict(acquisition.provider_metadata or {})
    metadata.update(
        {
            "demo_cached_real": True,
            "demo_privacy_note": REAL_DEMO_PRIVACY_NOTE,
            "demo_reference_label": REAL_DEMO_REFERENCE_LABEL,
            "demo_reference_url": REAL_DEMO_REFERENCE_URL,
        }
    )
    acquisition.provider_metadata = metadata
    await session.flush()


async def _run(days: int, target_count: int) -> None:
    if os.environ.get("APP_ENV", "development").lower() == AppEnvironment.PRODUCTION.value:
        raise SystemExit("Refusing real demo prefetch when APP_ENV=production")
    settings = load_settings()
    if not settings.cdse_client_id or not settings.cdse_client_secret:
        raise SystemExit(
            "CDSE_CLIENT_ID and CDSE_CLIENT_SECRET are required for real demo prefetch"
        )
    if not 1 <= days <= 730:
        raise SystemExit("--days must be between 1 and 730")
    if not 2 <= target_count <= 6:
        raise SystemExit("--count must be between 2 and 6")

    engine = create_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            target = await ensure_real_demo_target(session, settings)
            service = SatelliteService(session, settings)
            field = await service.get_authorized_field(
                user_id=target.user_id,
                field_id=target.field_id,
            )

            end_at = datetime.now(UTC)
            start_at = end_at - timedelta(days=days)
            await ObservationHistoryService(session, settings).run_backfill(
                user_id=target.user_id,
                field_id=field.id,
                start_at=start_at,
                end_at=end_at,
            )

            observations = await service.list_observations(
                user_id=target.user_id,
                field_id=field.id,
            )
            successful = []
            seen_times = set()
            skipped: list[tuple[str, str]] = []
            for observation in observations:
                if observation.acquired_at in seen_times:
                    continue
                seen_times.add(observation.acquired_at)
                if not observation.analysis_eligible:
                    continue
                try:
                    analysis = await service.get_observation_analysis(
                        user_id=target.user_id,
                        field_id=field.id,
                        observation_id=observation.observation_id,
                        authorized_field=field,
                    )
                except ApiException as exc:
                    if exc.code in SKIPPABLE_ANALYSIS_ERRORS:
                        skipped.append((str(observation.observation_id), exc.code))
                        continue
                    raise
                await _mark_cached_real(session, analysis.observation_id)
                successful.append(analysis)
                if len(successful) >= target_count:
                    break

            if len(successful) < 2:
                raise RuntimeError(
                    "Real demo prefetch found fewer than two usable cached Sentinel-2 "
                    f"observations in the last {days} days"
                )

            successful.sort(key=lambda value: value.acquired_at)
            before = successful[-2]
            after = successful[-1]
            comparison = await service.compare(
                user_id=target.user_id,
                field_id=field.id,
                before=before.observation_id,
                after=after.observation_id,
            )
            await session.commit()

            print("Real Sentinel-2 demo cache is ready.")
            print(f"Login: {DEMO_EMAIL}")
            print(f"Farm: {REAL_DEMO_FARM_NAME}")
            print(f"Field: {REAL_DEMO_FIELD_NAME}")
            print(f"Reference area: {REAL_DEMO_REFERENCE_LABEL}")
            print(f"Reference coordinate: {REAL_DEMO_COORDINATE_REFERENCE}")
            print("Boundary note: analysis window only; no cadastral or ownership claim.")
            print(
                "Cached observations: "
                + ", ".join(
                    value.acquired_at.astimezone(UTC).date().isoformat()
                    for value in successful
                )
            )
            print(
                "Comparison: "
                f"{before.acquired_at.date().isoformat()} -> "
                f"{after.acquired_at.date().isoformat()} "
                f"({comparison.status})"
            )
            if skipped:
                print(f"Skipped unusable observations: {len(skipped)}")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Cache real Sentinel-2 observations for the local demo."
    )
    parser.add_argument(
        "--days",
        type=int,
        default=180,
        help="bounded historical search window (default: 180, maximum: 730)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=3,
        help="number of usable observations to cache (default: 3)",
    )
    args = parser.parse_args()
    asyncio.run(_run(args.days, args.count))


if __name__ == "__main__":
    main()
