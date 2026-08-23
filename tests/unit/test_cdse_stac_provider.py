from __future__ import annotations

from datetime import UTC, datetime
import unittest

from apps.api.agriscope_api.providers.cdse_stac import (
    CdseStacClient,
    CdseStacMalformedResponse,
    CdseStacRateLimited,
    CdseStacUnavailable,
    SENTINEL_2_L2A_COLLECTION,
)


GEOMETRY = {
    "type": "Polygon",
    "coordinates": [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.8], [98.98, 18.79]]],
}


def feature(item_id: str, dt: str, cloud: float | None = 20.0) -> dict:
    properties = {"datetime": dt}
    if cloud is not None:
        properties["eo:cloud_cover"] = cloud
    return {"id": item_id, "collection": SENTINEL_2_L2A_COLLECTION, "properties": properties}


class CdseStacClientTests(unittest.IsolatedAsyncioTestCase):
    def client(self, post_json=None) -> CdseStacClient:
        return CdseStacClient(
            stac_url="https://stac.dataspace.copernicus.eu/v1/search",
            timeout_seconds=15,
            lookback_days=90,
            max_cloud_cover_percent=80.0,
            post_json=post_json,
        )

    def test_payload_uses_sentinel_2_collection_persisted_geometry_and_datetime_window(self):
        now = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)
        payload = self.client().build_search_payload(
            GEOMETRY, start=now.replace(month=5, day=3), end=now
        )

        self.assertEqual(payload["collections"], [SENTINEL_2_L2A_COLLECTION])
        self.assertEqual(payload["intersects"], GEOMETRY)
        self.assertEqual(payload["datetime"], "2026-05-03T12:00:00Z/2026-08-01T12:00:00Z")
        self.assertEqual(payload["sortby"], [{"field": "properties.datetime", "direction": "desc"}])
        self.assertEqual(payload["filter-lang"], "cql2-json")
        self.assertEqual(
            payload["filter"],
            {
                "op": "or",
                "args": [
                    {
                        "op": "<=",
                        "args": [
                            {"property": "eo:cloud_cover"},
                            80.0,
                        ],
                    },
                    {"op": "isNull", "args": [{"property": "eo:cloud_cover"}]},
                ],
            },
        )

    def test_selects_newest_valid_item_and_applies_cloud_threshold(self):
        body = {
            "features": [
                feature("too-cloudy", "2026-07-31T00:00:00Z", 95.0),
                feature("newest-valid", "2026-07-30T00:00:00Z", 22.5),
                feature("older-valid", "2026-07-15T00:00:00Z", 5.0),
            ]
        }

        selected = self.client().select_latest_valid_item(body)

        self.assertIsNotNone(selected)
        self.assertEqual(selected.item_id, "newest-valid")
        self.assertEqual(selected.cloud_cover_percent, 22.5)

    def test_all_items_above_threshold_returns_no_data(self):
        body = {
            "features": [
                feature("newest-too-cloudy", "2026-07-31T00:00:00Z", 95.0),
                feature("older-too-cloudy", "2026-07-30T00:00:00Z", 81.0),
            ]
        }

        self.assertIsNone(self.client().select_latest_valid_item(body))

    def test_missing_cloud_value_is_allowed(self):
        selected = self.client().select_latest_valid_item(
            {"features": [feature("missing-cloud", "2026-07-30T00:00:00Z", None)]}
        )

        self.assertIsNotNone(selected)
        self.assertIsNone(selected.cloud_cover_percent)

    def test_missing_datetime_is_no_data_when_all_items_missing_datetime(self):
        selected = self.client().select_latest_valid_item(
            {
                "features": [
                    {
                        "id": "missing-datetime",
                        "collection": SENTINEL_2_L2A_COLLECTION,
                        "properties": {},
                    }
                ]
            }
        )

        self.assertIsNone(selected)

    def test_malformed_response_is_rejected_safely(self):
        with self.assertRaises(CdseStacMalformedResponse):
            self.client().select_latest_valid_item({"not_features": []})

    async def test_rate_limit_is_reported_as_unavailable(self):
        async def post_json(_url, _payload, _timeout):
            return 429, {"features": []}

        with self.assertRaises(CdseStacRateLimited):
            await self.client(post_json=post_json).search_latest(GEOMETRY)

    async def test_timeout_is_reported_as_unavailable(self):
        async def post_json(_url, _payload, _timeout):
            raise CdseStacUnavailable("timeout")

        with self.assertRaises(CdseStacUnavailable):
            await self.client(post_json=post_json).search_latest(GEOMETRY)

    async def test_no_results_returns_no_data(self):
        async def post_json(_url, _payload, _timeout):
            return 200, {"features": []}

        result = await self.client(post_json=post_json).search_latest(GEOMETRY)

        self.assertIsNone(result.item)

    async def test_server_side_filter_prevents_first_page_false_no_data(self):
        async def post_json(_url, payload, _timeout):
            cloud_filter = payload["filter"]["args"][0]
            self.assertEqual(cloud_filter["op"], "<=")
            self.assertEqual(cloud_filter["args"], [{"property": "eo:cloud_cover"}, 80.0])
            return 200, {
                "features": [
                    feature("older-acceptable-from-provider-filter", "2026-07-01T00:00:00Z", 12.0)
                ]
            }

        result = await self.client(post_json=post_json).search_latest(GEOMETRY)

        self.assertIsNotNone(result.item)
        self.assertEqual(result.item.item_id, "older-acceptable-from-provider-filter")


if __name__ == "__main__":
    unittest.main()
