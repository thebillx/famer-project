# Task Brief

## Task ID

SATELLITE-001

## Title

Find and display latest Sentinel-2 acquisition metadata for a saved field

## Business goal

After merge, a user can open a saved field, search the real public CDSE STAC catalogue for the latest Sentinel-2 Level-2A item intersecting that field, see acquisition metadata, reload, and still see the selected acquisition.

## User

Authenticated organization member with viewer or higher access to the field.

## Current behavior

Users can create farms and fields, view saved polygons, and see authoritative area. No satellite metadata can be searched or persisted.

## Expected behavior

The user clicks `ตรวจสอบภาพดาวเทียมล่าสุด`, the backend searches CDSE STAC using the persisted field polygon, selects the newest valid Sentinel-2 L2A item within configured search limits, persists it idempotently, and the frontend displays safe metadata-only Thai copy.

## Scope

- `POST /api/v1/fields/{field_id}/satellite/search-latest`
- `GET /api/v1/fields/{field_id}/satellite/latest`
- Minimal CDSE STAC provider client with deterministic tests and one opt-in live smoke.
- Acquisition persistence with tenant integrity and idempotency.
- Minimal frontend satellite status card on farm detail.

## Out of scope

NDVI, NDMI, raster imagery, Process API, Statistical API, OAuth unless STAC requires it, workers, scheduler, monitoring, alerts, reports, notifications, Sentinel-1, Landsat, provider abstraction beyond the minimal client boundary, AI interpretation, and crop diagnosis.

## Contracts

`docs/api/openapi.yaml` defines SATELLITE-001 endpoints, status values, errors, timeout/provider-unavailable behavior, and examples.

Status: VERIFIED

## Security requirements

- Authenticate before searching.
- Use tenant-scoped persisted field geometry only.
- Viewer and higher can search/read.
- Foreign, random, or deleted fields return safe 404.
- No CDSE credentials exposed or required for public STAC search.
- Do not return raw provider responses.

## Test requirements

- Provider unit tests with deterministic HTTP fixtures.
- PostgreSQL integration tests for persistence, idempotency, tenant isolation, deleted fields, and DB integrity.
- API tests for available, no-data, unavailable, auth, viewer, foreign tenant, and reload latest.
- Frontend/Playwright flow using the real backend and mocked external CDSE boundary.

## Acceptance criteria

- Saved field page displays a satellite card.
- Search button calls backend and shows acquisition date/time, cloud-cover percentage or no cloud data, item ID, source, and searched time.
- No-data and provider-unavailable states use safe Thai wording.
- Reload shows the persisted latest acquisition.
- No raster assets are downloaded.

## Definition of done

SATELLITE-001 can be marked `VERIFIED` after internal QA evidence and pushed for external GitHub review. It must not be marked `DONE` before external approval.

## Risks

- CDSE public STAC availability may vary; automated tests use deterministic fixtures and live smoke is reported separately.
