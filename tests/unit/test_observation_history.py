from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest

from apps.api.agriscope_api.core.config import settings_from_env
from apps.api.agriscope_api.core.errors import ApiException
from apps.api.agriscope_api.providers.cdse_stac import CdseStacHistoryResult, CdseStacItem, CdseStacUnavailable
from apps.api.agriscope_api.repositories.farms import FieldRecord
from apps.api.agriscope_api.repositories.satellite import BackfillReceiptRecord
from apps.api.agriscope_api.services.observation_history import (
    NO_HISTORY_REASON,
    ObservationHistoryService,
    _normalise_bounds,
)


USER_ID = UUID("00000000-0000-0000-0000-000000000001")
FIELD_ID = UUID("00000000-0000-0000-0000-000000000030")
ORG_ID = UUID("00000000-0000-0000-0000-000000000010")
NOW = datetime(2026, 8, 1, 12, tzinfo=UTC)
GEOMETRY = {
    "type": "Polygon",
    "coordinates": [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.79]]],
}
FIELD = FieldRecord(
    id=FIELD_ID,
    farm_id=UUID("00000000-0000-0000-0000-000000000020"),
    organization_id=ORG_ID,
    name="Field",
    geometry=GEOMETRY,
    area_sqm=Decimal("1000"),
    area_rai=Decimal("0.625"),
    status="active",
    created_at=NOW,
    updated_at=NOW,
)


def receipt(status: str = "COMPLETED", *, reason: str | None = None) -> BackfillReceiptRecord:
    return BackfillReceiptRecord(
        id=UUID("00000000-0000-0000-0000-000000000099"),
        field_id=FIELD_ID,
        organization_id=ORG_ID,
        geometry_hash="a" * 64,
        start_at=datetime(2026, 7, 1, tzinfo=UTC),
        end_at=datetime(2026, 7, 31, 23, 59, tzinfo=UTC),
        status=status,
        pages_discovered=0,
        catalog_found_count=0,
        persisted_count=0,
        rejected_count=0,
        no_history_reason=reason,
        started_at=NOW,
        completed_at=NOW if status == "COMPLETED" else None,
    )


def item(item_id: str, cloud: float | None = 10.0, metadata: dict | None = None) -> CdseStacItem:
    return CdseStacItem(
        provider="cdse_stac",
        collection="sentinel-2-l2a",
        item_id=item_id,
        acquired_at=datetime(2026, 7, 15, tzinfo=UTC),
        cloud_cover_percent=cloud,
        provider_metadata=metadata or {"stac_item_id": item_id, "secret": "must-not-persist"},
    )


async def run_service(provider, repository):
    with patch(
        "apps.api.agriscope_api.services.observation_history.FarmRepository",
        return_value=SimpleNamespace(get_field=AsyncMock(return_value=FIELD)),
    ), patch(
        "apps.api.agriscope_api.services.observation_history.SatelliteRepository",
        return_value=repository,
    ):
        return await ObservationHistoryService(
            object(), settings_from_env(), provider=provider
        ).run_backfill(
            user_id=USER_ID,
            field_id=FIELD_ID,
            start_at=datetime(2026, 7, 1, tzinfo=UTC),
            end_at=datetime(2026, 7, 31, 23, 59, tzinfo=UTC),
        )


class FakeHistoryProvider:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def search_history(self, *_args, **_kwargs):
        self.calls += 1
        return self.result


@pytest.mark.asyncio
async def test_bounded_history_deduplicates_counts_quality_and_allowlists_provenance():
    provider = FakeHistoryProvider(
        CdseStacHistoryResult(
            items=(item("good"), item("cloudy", 95), item("good")),
            searched_at=NOW,
            page_count=2,
        )
    )
    repository = SimpleNamespace(
        create_or_get_backfill_receipt=AsyncMock(return_value=(receipt("PENDING"), True)),
        insert_historical_observation=AsyncMock(return_value=(SimpleNamespace(), True)),
        finish_backfill_receipt=AsyncMock(return_value=receipt()),
    )

    result = await run_service(provider, repository)

    assert provider.calls == 1
    assert repository.insert_historical_observation.await_count == 2
    first = repository.insert_historical_observation.await_args_list[0].kwargs
    assert isinstance(first["geometry_hash"], str) and len(first["geometry_hash"]) == 64
    assert "secret" not in first["provider_metadata"]
    finish = repository.finish_backfill_receipt.await_args.kwargs
    assert finish["catalog_found_count"] == 2
    assert finish["persisted_count"] == 2
    assert finish["rejected_count"] == 1
    assert finish["no_history_reason"] is None
    assert result.receipt.status == "COMPLETED"


@pytest.mark.asyncio
async def test_empty_history_records_explicit_reason():
    provider = FakeHistoryProvider(CdseStacHistoryResult((), NOW, 1))
    repository = SimpleNamespace(
        create_or_get_backfill_receipt=AsyncMock(return_value=(receipt("PENDING"), True)),
        insert_historical_observation=AsyncMock(),
        finish_backfill_receipt=AsyncMock(return_value=receipt(reason=NO_HISTORY_REASON)),
    )

    await run_service(provider, repository)

    repository.insert_historical_observation.assert_not_awaited()
    assert repository.finish_backfill_receipt.await_args.kwargs["no_history_reason"] == NO_HISTORY_REASON


@pytest.mark.asyncio
async def test_same_completed_request_returns_without_provider_work():
    provider = FakeHistoryProvider(CdseStacHistoryResult((), NOW, 0))
    existing = receipt()
    repository = SimpleNamespace(
        create_or_get_backfill_receipt=AsyncMock(return_value=(existing, False)),
        insert_historical_observation=AsyncMock(),
        finish_backfill_receipt=AsyncMock(),
    )

    result = await run_service(provider, repository)

    assert result.receipt == existing
    assert provider.calls == 0
    repository.finish_backfill_receipt.assert_not_awaited()


@pytest.mark.asyncio
async def test_truncated_result_fails_before_any_acquisition_write():
    provider = FakeHistoryProvider(CdseStacHistoryResult((item("first"),), NOW, 100, True))
    repository = SimpleNamespace(
        create_or_get_backfill_receipt=AsyncMock(return_value=(receipt("PENDING"), True)),
        insert_historical_observation=AsyncMock(),
        finish_backfill_receipt=AsyncMock(),
    )

    with pytest.raises(ApiException) as raised:
        await run_service(provider, repository)

    assert (raised.value.status_code, raised.value.code) == (422, "backfill_result_truncated")
    repository.insert_historical_observation.assert_not_awaited()
    repository.finish_backfill_receipt.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_failure_does_not_finalize_receipt_and_can_be_retried():
    provider = FakeHistoryProvider(CdseStacHistoryResult((), NOW, 0))
    provider.search_history = AsyncMock(side_effect=CdseStacUnavailable("timeout"))
    repository = SimpleNamespace(
        create_or_get_backfill_receipt=AsyncMock(return_value=(receipt("PENDING"), True)),
        insert_historical_observation=AsyncMock(),
        finish_backfill_receipt=AsyncMock(),
    )

    with pytest.raises(ApiException) as raised:
        await run_service(provider, repository)

    assert (raised.value.status_code, raised.value.code) == (503, "satellite_temporarily_unavailable")
    repository.finish_backfill_receipt.assert_not_awaited()


def test_range_requires_timezone_and_rejects_more_than_exactly_730_days():
    with pytest.raises(ApiException, match="timezone"):
        _normalise_bounds(datetime(2024, 1, 1), datetime(2024, 1, 2, tzinfo=UTC))
    assert _normalise_bounds(
        datetime(2024, 1, 1, tzinfo=UTC), datetime(2025, 12, 31, tzinfo=UTC)
    )[1] == datetime(2025, 12, 31, tzinfo=UTC)
    with pytest.raises(ApiException) as raised:
        _normalise_bounds(
            datetime(2024, 1, 1, tzinfo=UTC),
            datetime(2025, 12, 31, 0, 0, 0, 1, tzinfo=UTC),
        )
    assert raised.value.code == "backfill_range_too_large"
