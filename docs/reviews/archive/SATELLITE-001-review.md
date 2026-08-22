# Review Report

## Task ID

SATELLITE-001

## Reviewer

qa-security-agent

## Decision

APPROVED_WITH_NOTES

## Requirement coverage

- User-visible flow is implemented on the saved farm/field page through `SatelliteStatusCard`.
- Backend searches the CDSE STAC catalogue using the persisted tenant-scoped field geometry.
- Latest selected acquisition metadata is persisted and reloaded through `GET /api/v1/fields/{field_id}/satellite/latest`.
- No NDVI, raster processing, overlays, Process API, Statistical API, workers, scheduler, alerts, or crop diagnosis were added.

## Evidence

- Official CDSE STAC contract was verified from Copernicus Data Space Ecosystem documentation for `/v1/search`, `sentinel-2-l2a`, `intersects`, `datetime`, `query`, `fields`, and `sortby`.
- `apps/api/agriscope_api/providers/cdse_stac.py` parses only `id`, `collection`, `properties.datetime`, and `properties.eo:cloud_cover`.
- `apps/api/agriscope_api/services/satellite.py` loads the field through tenant-scoped repository access before calling the provider.
- `apps/api/agriscope_api/repositories/satellite.py` persists acquisitions idempotently with `ON CONFLICT (field_id, provider, provider_item_id)`.
- `apps/api/migrations/versions/20260801_0003_satellite_acquisitions.py` enforces `field_acquisitions(field_id, organization_id)` against `fields(id, organization_id)`.
- Frontend Thai wording is metadata-only and avoids crop-health or diagnosis claims.

## Tests

- `python3 -m unittest discover -s tests/unit`: 46 passed.
- `python3 -m unittest discover -s tests/contract`: 8 passed.
- `.venv/bin/pytest -q`: 68 passed, 28 known FastAPI `on_event` deprecation warnings.
- `.venv/bin/ruff check .`: passed.
- `.venv/bin/mypy apps/api packages/geospatial`: passed.
- `npm -w apps/web run typecheck`: passed.
- `npm -w apps/web run build`: passed.
- `npx playwright test -c apps/web/playwright.config.ts`: 1 passed.
- `docker compose config`: passed.
- `.venv/bin/alembic -c apps/api/alembic.ini upgrade head`: passed.
- `.venv/bin/alembic -c apps/api/alembic.ini downgrade -1`: passed.
- `.venv/bin/alembic -c apps/api/alembic.ini upgrade head`: passed.
- `.venv/bin/python -c 'import yaml; yaml.safe_load(open("docs/api/openapi.yaml")); print("openapi yaml ok")'`: passed.
- `git diff --check`: passed.
- Opt-in live smoke: `.venv/bin/python apps/api/scripts/cdse_stac_smoke.py` returned `available` for `sentinel-2-l2a` item `S2C_MSIL2A_20260702T034531_N0512_R104_T47QMA_20260702T084516`.

## Security findings

- No CDSE credentials are required or exposed for this public STAC catalogue search.
- Browser never sends geometry to the satellite endpoint; the backend uses persisted field geometry.
- Foreign, random, and deleted fields return safe 404 behavior in integration tests.
- Viewer membership can search/read; protected mutations remain governed by existing FIELD-001 role checks.
- Provider errors return safe `temporarily_unavailable` status without raw provider response leakage.
- No raster assets are downloaded.

## Regression risks

- The provider relies on public CDSE STAC availability and response compatibility. Automated suites use deterministic fixtures; the live smoke is reported separately.
- Current page displays satellite metadata for the first field shown on the farm detail page, matching the current FIELD-001 minimal UI.
- FastAPI `on_event` deprecation warnings remain from existing application lifecycle code and are outside SATELLITE-001 scope.

## Required changes

None before GitHub review.

## Recommended status

VERIFIED
