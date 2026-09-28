# AgriScope Thailand

AgriScope Thailand manages farms and field boundaries, then uses satellite
observations to help users decide where to inspect first.

> แปลงของฉันมีการเปลี่ยนแปลงผิดปกติหรือไม่ เกิดขึ้นตรงบริเวณไหน และควรไปตรวจตรงไหนก่อน

The product does not diagnose crop disease, pests, fertilizer deficiency, or
prescribe chemicals from satellite data.

## Current capabilities

- Authentication, organizations, tenant-scoped farms, and field boundaries.
- Field creation by map drawing or WGS84 latitude/longitude points.
- PostgreSQL/PostGIS geometry storage and server-authoritative area.
- Sentinel-2 observation discovery and bounded historical backfill.
- Cached NDVI analysis, raster visualization, spatial comparison, and farm-level inspection prioritization.
- Thai-first map-first UI with desktop and mobile browser regression coverage.

## Local demo

The recommended presentation path uses **real Sentinel-2 Level-2A data cached ahead
of time**. Configure CDSE credentials once and prefetch real observation analyses:

```bash
npm run demo:prefetch-real
```

The real demo target is a privacy-safe analysis window around a publicly documented
agricultural research location. It is explicitly not a cadastral or ownership boundary.

Start the local demo with:

```bash
npm run demo
```

The launcher starts the local database, applies migrations, preserves any prefetched
real Sentinel-2 cache, refreshes a clearly labelled synthetic fallback, and starts the
API and web app.

See [docs/demo.md](docs/demo.md) for the real-cached workflow, fallback walkthrough,
and privacy boundary.

## Focused validation

```bash
python3 -m unittest discover -s tests/unit
python3 -m unittest discover -s tests/contract
npm -w apps/web run typecheck
npm -w apps/web run build
```

Install pinned dependencies only when the active task and owner authorize it.

## Automated lifecycle

```text
Prompt
-> Scope and ownership
-> Implementation and focused validation
-> Ponytail LOCAL_NATIVE code review
-> Owner handoff
-> STOP
```

The owner separately decides corrections, security review, additional validation,
staging, commits, push/PR/CI, deployment, and merge. See `AGENTS.md` and
`.agents/workflows/delivery.md`.

## Repository map

```text
apps/api/                     FastAPI service and migrations
apps/web/                     Next.js application
packages/geospatial/          Remote-sensing formulas and quality policy
packages/shared-types/        Shared API schemas
packages/satellite-evalscripts/ Evalscript registry
docs/                         Product, API, architecture, security, and reviews
tests/                        Unit, contract, integration, and E2E tests
```
