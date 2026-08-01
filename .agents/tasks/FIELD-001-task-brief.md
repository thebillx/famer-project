# Task Brief

## Task ID

FIELD-001

## Title

Create farm and field boundary management

## Business goal

After merge, an authenticated farmer can create a farm, draw one field polygon, save it, refresh the browser, and still see the saved farm and field boundary with authoritative backend area.

## User

Farmer or field manager with an active organization membership.

## Current behavior

The backend foundation supports authentication, organization membership, RBAC, health checks, and tenant-safe organization reads. There is no user-visible farm or field workflow.

## Expected behavior

The user can register or log in, create a farm in their organization, open the farm, draw/edit/delete a polygon before saving, save the field, and reload the page to see the persisted polygon and backend-calculated area in square meters and rai.

## Scope

- Contract-first API additions for farm and field CRUD.
- Farm ORM model, Alembic migration, repository, service, schemas, and routes.
- Field ORM model, Alembic migration, repository, service, schemas, and routes.
- Backend GeoJSON Polygon validation.
- Backend area calculation in square meters and rai.
- Organization-scoped queries and RBAC checks.
- Minimal Next.js web application for login/register, farm list/create/detail, and field drawing.
- Unit, contract, integration, and focused browser-flow tests where locally runnable.

## Out of scope

- Copernicus API, Sentinel data, NDVI, satellite overlays, workers, schedulers, alerts, reports, email, notifications, team invitation management, billing, crop seasons, AI, mobile applications, demo auto-login, admin dashboard, advanced analytics, KML upload, GeoJSON file upload, multiple basemap providers, and offline maps.

## Dependencies

- FOUNDATION-001 merged to `main`.
- Existing FastAPI auth/session foundation.
- PostgreSQL/PostGIS development service.
- Locked Python and Node dependencies from existing manifests.

## Contracts

- `docs/api/openapi.yaml` defines only FIELD-001 farm and field endpoints:
  - `POST /api/v1/farms`
  - `GET /api/v1/farms`
  - `GET /api/v1/farms/{farm_id}`
  - `PATCH /api/v1/farms/{farm_id}`
  - `DELETE /api/v1/farms/{farm_id}`
  - `POST /api/v1/farms/{farm_id}/fields`
  - `GET /api/v1/farms/{farm_id}/fields`
  - `GET /api/v1/fields/{field_id}`
  - `PATCH /api/v1/fields/{field_id}`
  - `DELETE /api/v1/fields/{field_id}`

Status: VERIFIED

## Agent owners

- Orchestrator: planning, contract, final verification.
- Backend Geospatial Agent: FastAPI, database, tenant-scope, geometry validation, area calculation.
- Frontend Product Agent: minimal Next.js flow and field drawing UI.
- QA Security Agent: test/security review.

## File ownership

- Backend Geospatial Agent: `apps/api/**`, `tests/unit/**`, `tests/integration/**`, `tests/contract/**`, `docs/api/**`, `docs/api/database-schema.md`.
- Frontend Product Agent: `apps/web/**`, `package.json`, TypeScript/Tailwind config files, `tests/e2e/**`.
- Orchestrator: `.agents/tasks/FIELD-001-task-brief.md`, `AGENTS.md` if needed.

## Security requirements

- Every farm and field query must be scoped by active organization membership.
- Foreign organization, farm, or field IDs must not disclose existence.
- Viewers may read but may not create, update, or delete.
- Field geometry must be validated server-side.
- Backend area is authoritative.
- No secrets in frontend code, source, logs, or tests.

## Test requirements

- Existing foundation and geospatial unit tests continue to pass.
- Contract tests cover new OpenAPI routes and standard error shape.
- Integration tests cover farm/field CRUD, geometry validation, area return, tenant isolation, and viewer mutation denial.
- Browser-flow test covers register/login, create farm, draw field, save, reload, see polygon.

## Acceptance criteria

- User can log in or register.
- User can create organization if needed through the existing auth flow.
- User can create a farm.
- User can draw a polygon, edit vertices, delete before save, and save.
- Backend validates geometry and rejects invalid polygons.
- Backend stores field geometry and returns area in square meters and rai.
- Refreshing/reopening the farm page still shows the field polygon and area.

## Definition of done

- FIELD-001 reaches VERIFIED after internal QA/security review.
- Feature branch is pushed for external GitHub review.
- FIELD-001 is not marked DONE until external approval.

## Risks

- Browser-flow validation depends on local Node dependencies and Playwright browser availability.
- Production map tile strategy is intentionally deferred; FIELD-001 uses a minimal MapLibre drawing canvas without a production basemap provider.
