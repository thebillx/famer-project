# Task Brief

## Task ID

WAVE-2A-OBSERVATION-CHANGE-FOUNDATION

## Status

CONTRACT_READY

## Title

Observation history, observation-scoped NDVI raster, and spatial change foundation

## Business goal

Provide the real tenant-scoped temporal and spatial evidence contracts required by
the frozen Field Analysis and Compare designs without fabricating frontend data or
making agronomic diagnoses.

## User

An authenticated farm owner, or an organization owner exercising oversight, viewing
an active field they are authorized to access.

## Current behavior

Only the latest persisted acquisition can be read. True-colour preview and scalar
NDVI are computed against that latest acquisition. There is no history endpoint,
observation-scoped analysis, numeric raster, or spatial change contract.

## Expected behavior

- List persisted observations in deterministic latest-first order.
- Read true-colour preview, scalar NDVI, and numeric NDVI raster for one observation.
- Compare two usable observations of the same field and return scalar NDVI change,
  changed area, and valid GeoJSON spatial evidence.
- Return explicit quality/unavailable states and never silently substitute latest.
- Cache successful bounded raster/statistical products idempotently.

## Scope

- Forward migration and ORM model for quality-approved observation analysis cache.
- Tenant-scoped repository, provider, service, API, OpenAPI, schema docs, and tests.
- NDVI GeoTIFF numeric source, deterministic PNG rendering metadata, and conservative
  thresholded decrease mask.
- Targeted security review and independent code review before owner handoff.

## Out of scope

- Field Analysis or Compare UI, CSS, Figma changes, alerts, diagnosis, cause
  attribution, risk/confidence scoring, background scheduling, new dependencies,
  production provider calls, commit, push, PR, or deployment.

## Dependencies

- Existing PostgreSQL/PostGIS, rasterio, numpy, shapely, CDSE Process/Statistical
  adapters, auth cookies, farm-owner boundary, and API error conventions.

## Contracts

- `field_acquisitions.id` is `observation_id`; date is never identity.
- History: `GET /api/v1/fields/{field_id}/observations` latest-first.
- Preview: `GET /api/v1/fields/{field_id}/observations/{observation_id}/preview`.
- Scalar: `GET /api/v1/fields/{field_id}/observations/{observation_id}/ndvi-summary`.
- Raster metadata: `GET /api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster`.
- Rendered raster: `GET /api/v1/fields/{field_id}/observations/{observation_id}/ndvi-raster/image`.
- Change: `GET /api/v1/fields/{field_id}/change?before={id}&after={id}`.
- Raster source is clipped float32 GeoTIFF in EPSG:4326, 10 m target resolution,
  bounded to 512×512, nodata `-9999`, algorithm/evalscript versioned.
- Change means valid after-before NDVI <= -0.10. It is observational evidence only.
- `USABLE`, `POOR_QUALITY`, and `UNAVAILABLE` are explicit quality states.
- Comparisons require same authorized field, distinct IDs, before earlier than after,
  usable scalar/raster products, and aligned raster grids.

## Agent owners

- Lifecycle orchestrator: current Codex task.
- Implementation/review agents receive only this brief and exact diff boundary.

## File ownership

- `.agents/tasks/WAVE-2A-OBSERVATION-CHANGE-FOUNDATION-task-brief.md`
- `docs/decisions/ADR-0010-observation-raster-change-cache.md`
- `docs/api/database-schema.md`, `docs/api/openapi.yaml`
- `apps/api/migrations/versions/20260830_0005_observation_analysis.py`
- `apps/api/agriscope_api/db/models/field_acquisition.py`
- `apps/api/agriscope_api/db/models/field_observation_analysis.py`
- `apps/api/agriscope_api/db/models/__init__.py`
- `apps/api/agriscope_api/providers/cdse_process.py`
- `apps/api/agriscope_api/repositories/satellite.py`
- `apps/api/agriscope_api/services/satellite.py`
- `apps/api/agriscope_api/api/v1/satellite.py`
- Focused unit, contract, integration, migration, and security tests under `tests/`.

## Security requirements

- Authenticate first; authorize farm ownership/organization-owner oversight before
  acquisition lookup, provider work, or cache access.
- Composite database ownership constraints bind analysis to observation, field, and
  organization. Foreign/cross-field IDs return generic 404.
- Binary responses are private/no-store, nosniff, and never expose object keys,
  credentials, provider responses, or stale protected content.
- Rate-limit provider-backed endpoints and fail closed on terminal auth/provider
  errors. Never log secrets or full private geometry.

## Test requirements

- Unit: provider payload/parsing, raster validation/rendering, quality and change math.
- Contract: exact OpenAPI methods, schemas, binary headers, error and status shapes.
- Integration: two-observation A02 journey, deterministic cache, tenant isolation,
  cross-field denial, reversed/same IDs, low quality, unavailable raster, valid mask.
- Migration: forward/down contract, constraints, indexes, and preservation.
- Security-focused: auth ordering, cache ownership, no raw error/secret leakage.

## Acceptance criteria

All ten capabilities in the owner matrix pass with deterministic test evidence; no
frontend code or fabricated production result is introduced; focused validation,
targeted security review, and independent review approve the exact unstaged diff.

## Definition of done

Implementation, OpenAPI, migration, and focused tests are complete; owner receipt is
returned without staging, committing, pushing, or opening a PR.

## Risks

- Database raster bytes are intentionally bounded but require a future retention
  policy for long-lived production scale.
- Thresholded NDVI change is simple evidence, not causal interpretation.
- Provider mosaicking within an acquisition day may not equal provider item identity;
  requests are constrained by persisted acquisition date and documented accordingly.
