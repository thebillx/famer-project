# Review Report

## Task ID

FIELD-001

## Reviewer

qa-security-agent

## Decision

APPROVED_WITH_NOTES

## Requirement coverage

- Authenticated user can register/login through the minimal web app.
- User can create a farm scoped to an active organization membership.
- User can draw a field polygon on a MapLibre canvas, undo/delete before save, save it, reload, and see the field and backend area.
- Backend validates Polygon GeoJSON before persistence.
- Backend stores geometry in PostGIS and calculates authoritative `area_sqm` and `area_rai`.
- Farm and field API reads/mutations are scoped by active membership.
- Viewer role can read but cannot create protected farm resources.

## Evidence

- Contract updated in `docs/api/openapi.yaml` for FIELD-001 farm and field endpoints only.
- Alembic migration `20260801_0002_farm_field.py` creates `farms` and `fields` with PostGIS geometry and downgrade support.
- Integration tests cover farm/field persistence, reload reads, invalid geometry, cross-tenant access, and viewer mutation denial.
- Playwright test covers register, create farm, draw polygon, save field, reload, and verify persisted area display.

## Tests

- `python3 -m unittest discover -s tests/unit`: 37 tests passed.
- `python3 -m unittest discover -s tests/contract`: 6 tests passed.
- `.venv/bin/pytest -q`: 53 tests passed, 20 FastAPI `on_event` deprecation warnings.
- `.venv/bin/ruff check .`: passed.
- `.venv/bin/mypy apps/api packages/geospatial`: passed.
- `npm -w apps/web run typecheck`: passed.
- `npm -w apps/web run build`: passed.
- `npx playwright test -c apps/web/playwright.config.ts`: 1 test passed.
- `.venv/bin/alembic -c apps/api/alembic.ini downgrade base`: passed.
- `.venv/bin/alembic -c apps/api/alembic.ini upgrade head`: passed.
- `docker compose config`: passed.
- `git diff --check`: passed.

## Security findings

- No live Copernicus calls.
- No frontend secrets added.
- Secret scan found only `.env.example`, Docker development credentials, and existing test development database URL placeholders.
- Tenant-owned farm and field queries join or check active membership before returning data.
- Foreign farm and field IDs return safe 404 behavior through scoped queries.

## Regression risks

- FastAPI `on_event` deprecation warnings remain from FOUNDATION-001 and are not changed in this slice.
- The web app uses a minimal blank MapLibre drawing canvas; production basemap provider abstraction is deferred.
- Playwright required installing the local Chromium browser binary.

## Required changes

None before external review.

## Recommended status

VERIFIED
