# AGRISCOPE-DEMO-READY-001

Status: IN_PROGRESS

## Objective

Make the current AgriScope product complete and repeatable for a local demo without introducing production infrastructure.

Primary demo path:
- real Sentinel-2 Level-2A observations discovered from CDSE;
- real NDVI summary/raster generated from CDSE and cached ahead of the presentation;
- comparison and farm prioritization derived from those cached analyses;
- no live provider call is required for the core walkthrough.

Fallback path:
- deterministic synthetic demo data remains available and is clearly labelled `ข้อมูลสาธิต`.

## Delivery base

- origin/main: `54a86eeac912fc70067653b47b2754b08a8abf47`
- branch: `codex/demo-ready-001`
- isolated worktree: `/Users/bill/final-project-demo-ready-001`
- dirty primary checkout must remain unchanged.

## Demo identity

Local demo only:
- email: `demo@agriscope.local`
- password: `DemoPass12345`
- organization: `AgriScope Demo`

All demo seed/prefetch commands fail closed when `APP_ENV=production`.

## Privacy-safe real demo AOI

The real cached demo must not use a privately identified farm or cadastral parcel.

Target:
- a small analysis window around a publicly documented agricultural research location at the Mae Hia agricultural research/demonstration area, Chiang Mai;
- the geometry is an **analysis window**, not a property boundary and not an ownership claim;
- no person name, farmer identity, phone number, house address, title-deed number, parcel identifier, customer ID, or other owner-linked attribute is stored or displayed;
- the demo must not infer or state who owns land inside or around the analysis window.

UI names:
- farm: `พื้นที่สาธิตแม่เหียะ · Sentinel-2 จริง`
- field: `หน้าต่างวิเคราะห์แม่เหียะ A · ไม่ใช่ขอบเขตกรรมสิทธิ์`

The AOI is based on publicly documented research-site coordinates and is intentionally a bounded rectangular analysis window rather than a cadastral boundary.

## Real cached satellite contract

One-time command `npm run demo:prefetch-real`:
- refuses production;
- requires configured `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`;
- creates/refreshes the privacy-safe real demo target;
- performs bounded historical Sentinel-2 STAC discovery;
- computes and caches up to three usable observation analyses using the existing CDSE Process/Statistical implementation;
- marks only successfully cached real observations with `demo_cached_real=true`;
- verifies at least two distinct cached acquisition times before claiming comparison readiness;
- never stores credentials or prints them.

For a real cached demo observation:
- provider remains `cdse_stac`;
- source shown to the user is `Sentinel-2 · เก็บไว้ล่วงหน้า`;
- true-colour imagery is not automatically requested because it is not cached;
- cached NDVI summary/raster and change comparison remain available;
- opening the seeded real demo must not silently call CDSE;
- an explicit live search on an ordinary non-demo field retains existing behavior.

## Synthetic fallback contract

Fallback synthetic acquisitions use provider `agriscope-demo`.

For synthetic acquisitions:
- observation source is `ข้อมูลสาธิต`;
- `imagery_available=false`;
- cached NDVI/raster/change remain available;
- no provider call is triggered merely by opening seeded demo data.

## Local demo launcher

`npm run demo`:
- refuses production;
- requires an existing Python 3.12 environment and installed JS dependencies;
- starts local PostGIS;
- applies migrations;
- seeds the deterministic synthetic fallback idempotently;
- preserves any previously prefetched real cached demo data;
- starts API on localhost:8000 and web on localhost:3000;
- prints the local URL and demo credentials;
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
- scripts/demo_prefetch_real.py
- scripts/demo_prefetch_real.sh
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
- No demo-mode public API endpoint.
- No algorithm/threshold changes.
- No migration or dependency addition.
- No claim that an analysis-window polygon represents legal ownership.

## Validation

- Synthetic seed is idempotent and refuses production.
- Real-prefetch command refuses production and missing CDSE credentials.
- Real cached observations are labelled as real Sentinel-2 cached evidence and have `imagery_available=false`.
- Cached real NDVI/raster/change endpoints reuse cache without provider calls.
- Synthetic demo remains clearly labelled and provider-free.
- Privacy guardrails and non-cadastral naming are contract-tested.
- Existing integration/browser regressions remain green.
- Bash syntax and `git diff --check` pass.
- CI validation / integration / browser regression all pass.
