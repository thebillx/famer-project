# AgriScope Thailand Architecture

## Proposed architecture

```text
Browser / PWA
  -> Next.js Web App
  -> /api/v1 over HTTPS
  -> FastAPI API
     -> PostgreSQL + PostGIS
     -> Redis cache and queue broker
     -> S3-compatible object storage
     -> Worker service
        -> Provider adapter
           -> Copernicus Data Space Ecosystem
           -> Demo Provider
           -> Optional Landsat / CLMS providers
```

## Principles

- Contract-first implementation.
- Vertical-slice delivery.
- Server-side satellite integration only.
- Provider adapter boundary for Copernicus and future providers.
- Backend is source of truth for geometry validation and area.
- Every tenant-owned query enforces organization scope.
- Every analysis result carries quality metadata and limitations.
- Brand, copy, logo, palette, and package matrix are configuration-driven.

## Application boundaries

- `apps/web`: Next.js PWA, Thai/English UI, MapLibre, charts, forms, reports UI.
- `apps/api`: FastAPI API, auth, RBAC, organization scope, contracts, synchronous request handling.
- `apps/worker`: scheduled and queued analysis jobs.
- `packages/geospatial`: numerical formulas, geometry policy, quality scoring, cloud masking.
- `packages/config`: brand, feature flags, provider quota settings, thresholds.
- `packages/satellite-evalscripts`: versioned evalscripts and attribution metadata.
- `packages/shared-types`: API schemas shared between frontend and backend.

## Data flow

```text
Daily scheduler
  -> monitored fields query with organization scope
  -> Catalog search by field geometry and time range
  -> acquisition idempotency check
  -> quality probe for field polygon
  -> unusable observation OR Statistical API metrics
  -> metric snapshots and time series
  -> anomaly rules
  -> optional Process API overlay artifact
  -> alert event
  -> in-app notification / web push / email
```

## Health endpoints

- `/health/live`: process is running.
- `/health/ready`: app can serve traffic.
- `/health/dependencies`: database, Redis, object storage, queue, and provider adapter status.

## FOUNDATION-001 backend foundation

The API foundation uses an application factory, versioned `/api/v1` router, standard error responses, request ID middleware, structured logging helpers, typed settings validation, async SQLAlchemy session wiring, and Alembic migrations.

Refresh-session strategy is database-backed. `refresh_sessions` stores token hashes, status, expiration, and rotation lineage. Logout revokes the active refresh session; refresh rotates the session.

Tenant-safe repositories must scope directly by `organization_id` and active membership before returning records. They must not fetch a tenant-owned entity by ID first and authorize afterward when a scoped query is possible.

## Production deployment shape

- Reverse proxy terminates TLS and applies security headers.
- API and worker run as separate containers.
- Heavy raster work runs in worker, never in web request thread.
- Immutable artifacts are stored in object storage with CDN-compatible cache headers.
- Database migrations run before API rollout.
