# AGRISCOPE-DEMO-READY-001

Status: IN_PROGRESS

## Objective

Make the current AgriScope product complete and repeatable for a local live demo without introducing production infrastructure.

Demo readiness means:
- one local command can start the application after dependencies are installed;
- a deterministic local demo account/farm/field dataset can be seeded idempotently;
- demo satellite evidence is explicitly synthetic and never presented as a real Sentinel-2 preview;
- cached NDVI, change comparison, farm prioritization, map drawing, coordinate entry, auth, and history can be demonstrated without live provider availability;
- optional live CDSE behavior remains unchanged when real credentials are configured.

## Delivery base

- origin/main: `54a86eeac912fc70067653b47b2754b08a8abf47`
- branch: `codex/demo-ready-001`
- isolated worktree: `/Users/bill/final-project-demo-ready-001`
- dirty primary checkout must remain unchanged.

## Demo contract

### Demo identity

Local demo only:
- email: `demo@agriscope.local`
- password: `DemoPass12345`
- organization: `AgriScope Demo`
- farm: `สวนสาธิตเชียงใหม่ · ข้อมูลจำลอง`

The seed must fail closed when `APP_ENV=production`.

### Demo fields

Seed four deterministic field experiences:
1. `แปลงเหนือ · ควรตรวจ (สาธิต)` — two cached analyses with thresholded decrease.
2. `แปลงกลาง · มีผลเปรียบเทียบ (สาธิต)` — two cached analyses with no thresholded decrease.
3. `แปลงใต้ · ข้อมูลยังไม่พอ (สาธิต)` — two cached analyses with insufficient common spatial support.
4. `แปลงใหม่ · รอข้อมูล (สาธิต)` — one cached analysis only.

Coordinates stay inside the Chiang Mai demo area and current Thailand service bounds.

### Synthetic evidence safety

Synthetic acquisitions use provider `agriscope-demo`.

For synthetic acquisitions:
- observation source is user-facing `ข้อมูลสาธิต`;
- `imagery_available=false` so the UI never calls the real preview provider for fake imagery;
- cached NDVI summary/raster/change remain available;
- provider metadata contains the current geometry fingerprint and an explicit demo marker;
- no live provider call is triggered merely by opening seeded demo data.

Real providers retain existing behavior unchanged.

### Local demo launcher

Add `npm run demo` backed by a bounded shell script that:
- refuses production environment;
- requires an existing Python 3.12 environment and installed JS dependencies;
- starts local PostGIS with Docker Compose;
- applies Alembic migrations;
- seeds demo data idempotently;
- starts API on localhost:8000 and web on localhost:3000;
- prints URL and demo credentials;
- terminates app child processes cleanly on Ctrl-C;
- does not silently install dependencies.

## Scope

Owned paths:
- .agents/tasks/AGRISCOPE-DEMO-READY-001-task-brief.md
- apps/api/agriscope_api/demo.py
- apps/api/agriscope_api/services/satellite.py
- apps/web/components/SatelliteStatusCard.tsx
- apps/web/lib/types.ts
- scripts/demo_seed.py
- scripts/demo.sh
- package.json
- README.md
- docs/demo.md
- tests/integration/test_foundation_api.py
- tests/contract/test_foundation_contract.py
- tests/e2e/map-workspace-001.spec.ts

All other paths are read-only.

## Non-goals

- No cloud deployment.
- No production secrets.
- No backup/restore/HA.
- No multi-instance support.
- No production security approval.
- No demo-mode API endpoint or public demo switch.
- No algorithm/threshold changes.
- No provider contract changes for real observations.
- No dependency addition.

## Validation

- Seed is idempotent when executed twice.
- Seed refuses `APP_ENV=production`.
- Demo observation list exposes source `ข้อมูลสาธิต` and does not advertise preview imagery.
- Cached demo analysis/raster/change endpoints return without provider calls.
- Farm overview contains NEEDS_INSPECTION, MEASURED, NOT_ASSESSABLE, and FIRST_OBSERVATION demo states.
- Existing integration/browser regressions remain green.
- Shell syntax check and `git diff --check`.
- CI validation / integration / browser regression all pass.
