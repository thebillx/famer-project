# AgriScope Thailand

AgriScope Thailand is a production-oriented SaaS foundation for monitoring agricultural fields with free satellite data. It helps users answer:

> แปลงของฉันมีการเปลี่ยนแปลงผิดปกติหรือไม่ เกิดขึ้นตรงบริเวณไหน และควรไปตรวจตรงไหนก่อน

The system uses satellite observations to prioritize field inspection. It does not diagnose crop disease, pests, fertilizer deficiency, or prescribe chemicals.

## Current status

This repository has started Phase 1 and the first foundation slice:

- Architecture, data flow, ER model, API contract, security model, quota strategy, and roadmap are documented.
- Core remote-sensing index formulas and quality gates are implemented in a dependency-light Python package.
- Unit tests cover NDVI, EVI, SAVI, NDMI, NDWI, NDRE, NBR, BSI, division-by-zero behavior, cloud quality gates, and safe wording policy.
- No live Copernicus API calls are made by tests.

## Run local validation

```bash
python3 -m unittest discover -s tests/unit
python3 -m unittest discover -s tests/contract
```

## API foundation commands

Runtime dependencies are pinned in `pyproject.toml`. After installing them in a project environment:

```bash
uvicorn apps.api.agriscope_api.main:app --reload
cd apps/api && alembic upgrade head
```

Do not reuse `.env.example` secrets outside development. Production must provide strong `SESSION_SECRET`, `ENCRYPTION_KEY`, database, Redis, and object-storage settings.

## FOUNDATION-001 status

The backend foundation defines typed settings, API route contracts, request IDs, standard error shape, SQLAlchemy/Alembic structure, User/Organization/Membership/RefreshSession models, password/token/session policies, RBAC roles, and tenant-scope repository patterns.

Selected refresh-session strategy: database-backed refresh sessions. Logout and refresh rotation must revoke or rotate the persisted refresh session; a fake logout that only deletes a cookie is not acceptable.

Known limitations:

- Runtime dependencies are not installed by this publishing task.
- Farm/Field CRUD, Copernicus integration, worker scheduler, alerts, reports, and frontend are not part of FOUNDATION-001.
- API route handlers define contracts and wiring; full persistence-backed endpoint execution requires installing locked dependencies and running migrations.

## Repository map

```text
apps/api/                  FastAPI service skeleton and migration contracts
apps/worker/               Background worker package placeholder for later phases
packages/geospatial/       Remote-sensing formulas and quality policy
packages/config/           Branding and runtime configuration contracts
packages/shared-types/     API schemas and OpenAPI contract artifacts
packages/satellite-evalscripts/ Evalscript version registry
docs/                      Architecture, API, security, methodology, deployment, limitations
tests/                     Unit, contract, integration, and E2E test roots
infrastructure/            Docker, nginx, monitoring, and scripts roots
```

## Safety language

Allowed phrasing includes:

- พบความเปลี่ยนแปลง
- พบพื้นที่ที่ควรตรวจสอบ
- พบแนวโน้มความชื้นลดลง
- พบค่าความเขียวลดลง
- ข้อมูลยังไม่เพียงพอ
- ควรตรวจสอบภาคสนาม

Prohibited phrasing includes claims that a crop is definitely diseased, lacks fertilizer, has a specific pest, or requires a specific chemical.
