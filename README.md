# AgriScope Thailand

AgriScope Thailand is a production-oriented SaaS foundation for managing agricultural fields and later monitoring them with free satellite data. It helps users answer:

> แปลงของฉันมีการเปลี่ยนแปลงผิดปกติหรือไม่ เกิดขึ้นตรงบริเวณไหน และควรไปตรวจตรงไหนก่อน

The system uses satellite observations to prioritize field inspection. It does not diagnose crop disease, pests, fertilizer deficiency, or prescribe chemicals.

## Current status

This repository has completed the backend foundation and farm/field slices, and SATELLITE-001 adds latest Sentinel-2 catalogue discovery for saved fields:

- Architecture, data flow, ER model, API contract, security model, quota strategy, and roadmap are documented.
- Authenticated users can create farms, save field polygons, and search the public CDSE STAC catalogue for the latest Sentinel-2 Level-2A acquisition metadata.
- Core remote-sensing index formulas and quality gates are implemented in a dependency-light Python package.
- Unit tests cover NDVI, EVI, SAVI, NDMI, NDWI, NDRE, NBR, BSI, division-by-zero behavior, cloud quality gates, and safe wording policy.
- Automated tests use deterministic provider fixtures and do not call live Copernicus services.

## Run local validation

```bash
python3 -m unittest discover -s tests/unit
python3 -m unittest discover -s tests/contract
```

## Development Workflow

All feature work must move through the permanent review flow:

```text
Requirement
-> Task Brief
-> Contract Review
-> Implementation
-> Internal QA
-> CTO Review
-> Fix
-> Approve
-> Merge
```

Agents prepare task briefs, contracts, implementation handoffs, and internal QA evidence. CTO review is recorded under `docs/reviews/` before a feature is approved for merge. A feature is not `DONE` just because code is pushed.

## API foundation commands

Runtime dependencies are pinned in `pyproject.toml`. After installing them in a project environment:

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
docker compose up -d postgres redis minio
.venv/bin/alembic -c apps/api/alembic.ini upgrade head
.venv/bin/uvicorn apps.api.agriscope_api.main:app --reload
```

Do not reuse `.env.example` secrets outside development. Production must provide strong `SESSION_SECRET`, `ENCRYPTION_KEY`, database, Redis, and object-storage settings.

SATELLITE-001 uses the public CDSE STAC search endpoint by default and does not require Copernicus client credentials for catalogue discovery:

```bash
CDSE_STAC_URL=https://stac.dataspace.copernicus.eu/v1/search
SATELLITE_SEARCH_LOOKBACK_DAYS=90
SATELLITE_SEARCH_TIMEOUT_SECONDS=15
SATELLITE_MAX_CLOUD_COVER_PERCENT=80
```

## Web application commands

Frontend dependencies are locked in `package-lock.json`.

```bash
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm -w apps/web run dev
npm -w apps/web run typecheck
npm -w apps/web run build
```

`NEXT_PUBLIC_MAP_STYLE_URL` controls the MapLibre basemap. The development default is `https://tiles.openfreemap.org/styles/liberty`, a no-token OpenFreeMap style with attribution included by the map control. Production deployments should configure an approved provider/style URL that matches expected traffic and terms.

With the API and web app running, open `http://localhost:3000/login`, register or log in, create a farm, draw a field, save it, open the farm page, and click `ตรวจสอบภาพดาวเทียมล่าสุด` to find and persist the latest Sentinel-2 acquisition metadata.

## FOUNDATION-001 status

The backend foundation defines typed settings, API route contracts, request IDs, standard error shape, SQLAlchemy/Alembic structure, User/Organization/Membership/RefreshSession models, password/token/session policies, RBAC roles, and tenant-scope repository patterns.

Selected refresh-session strategy: database-backed refresh sessions. Logout and refresh rotation must revoke or rotate the persisted refresh session; a fake logout that only deletes a cookie is not acceptable.

Verified locally:

- `alembic upgrade head`, `alembic downgrade base`, and `alembic upgrade head`.
- Full pytest suite against PostgreSQL-backed auth and tenant-isolation routes.
- Live Uvicorn smoke requests for health, register, login, me, refresh, logout, and organization list.

Known limitations:

- SATELLITE-001 searches only catalogue metadata. NDVI, raster overlays, Process API, Statistical API, worker scheduler, alerts, and reports are not implemented.
- FIELD-001 uses a minimal MapLibre drawing canvas. Production deployments should configure an approved basemap provider.
- Redis and object storage are configured for local development but not used by the current Foundation endpoints.

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
