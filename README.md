# AgriScope Thailand

AgriScope Thailand manages farms and field boundaries, then uses satellite
observations to help users decide where to inspect first.

> แปลงของฉันมีการเปลี่ยนแปลงผิดปกติหรือไม่ เกิดขึ้นตรงบริเวณไหน และควรไปตรวจตรงไหนก่อน

The product does not diagnose crop disease, pests, fertilizer deficiency, or
prescribe chemicals from satellite data.

## Current capabilities

- Authentication, organizations, tenant-scoped farms, and field boundaries.
- PostgreSQL/PostGIS geometry storage and server-authoritative area.
- Latest Sentinel-2 Level-2A catalogue metadata discovery.
- Remote-sensing formulas, quality policy, and deterministic provider fixtures.
- Thai-first public UI and authenticated UI foundations.

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
