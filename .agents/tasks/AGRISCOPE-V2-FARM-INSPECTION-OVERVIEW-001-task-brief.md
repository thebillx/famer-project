# AGRISCOPE-V2-FARM-INSPECTION-OVERVIEW-001

Status: IN_PROGRESS

## Objective

Complete the next Trend-first slice at farm level: show which fields deserve inspection using only already-cached, quality-approved observation analyses. Opening a farm must never fan out to Copernicus or create new analysis.

## User outcome

A farm owner opens one farm and immediately sees cached inspection evidence synchronized across the field list, map, and inspector:

- fields with thresholded NDVI-decrease area are marked **พื้นที่ควรตรวจ**;
- measurable comparisons without thresholded decrease show their measured direction without being labelled healthy/better/worse;
- insufficient common spatial support is shown as **ข้อมูลยังไม่พอสำหรับเปรียบเทียบ**;
- a single cached analysis is shown as **รอข้อมูลเปรียบเทียบอีกครั้ง**;
- fields without cached analysis are shown as **ยังไม่มีผลวัดที่บันทึกไว้**.

This is prioritization for field inspection, not diagnosis.

## Contract

- Add a read-only `GET /api/v1/farms/{farm_id}/inspection-overview` endpoint.
- The endpoint reads persisted field boundaries and `field_observation_analyses` only.
- It must not call STAC, Process API, NDVI generation, backfill, or any provider transport.
- Only analyses matching the field's current geometry fingerprint and current analysis algorithm are eligible.
- Use at most the latest two eligible cached analyses per field.
- Reuse the canonical common-support and `CHANGE_THRESHOLD=-0.10` comparison semantics.
- No new score, health class, disease/cause claim, agronomic recommendation, provider request, migration, dependency, scheduler, alert, or persistence.
- `needs_inspection=true` only when canonical comparison is USABLE and thresholded decrease area is greater than zero.
- The API must preserve owner/org-owner farm visibility and return generic 404 for hidden/foreign/disabled farms before exposing cached evidence.

## UI

- Farm list and map remain the spatial workspace.
- The rail shows evidence state beside every field without replacing area.
- Fields with `needs_inspection=true` are visually prioritized using the existing `priorityFieldIds` map contract.
- The selected-field inspector shows a concise `แนวโน้มล่าสุด` section before raw satellite status.
- Priority ordering is evidence-first: needs inspection, other measurable comparison, insufficient comparison, first cached analysis, no cached analysis. Stable tie-break by field name.
- Search continues to filter list/map without changing evidence.
- Terminal auth must hide the farm workspace and clear tenant queries.
- Loading or overview failure must not hide geometry; failure copy explains that inspection evidence is temporarily unavailable.

## Owned paths

- .agents/tasks/AGRISCOPE-V2-FARM-INSPECTION-OVERVIEW-001-task-brief.md
- apps/api/agriscope_api/repositories/satellite.py
- apps/api/agriscope_api/services/satellite.py
- apps/api/agriscope_api/api/v1/farms.py
- apps/web/lib/types.ts
- apps/web/app/farms/[id]/page.tsx
- apps/web/components/map-workspace.module.css
- docs/api/openapi.yaml
- tests/contract/test_foundation_contract.py
- tests/integration/test_foundation_api.py
- tests/e2e/map-workspace-001.spec.ts

All other paths are read-only.

## Validation

- Ruff / static validation.
- Contract checks for endpoint/schema and explicit cached-only semantics.
- Disposable PostGIS integration proves owner scope, foreign/disabled denial, current-geometry filtering, all five evidence states, deterministic ordering, and zero provider calls.
- TypeScript typecheck and production build.
- Focused desktop/mobile browser tests for list/map/inspector synchronization, search, error/loading/auth states, and no unsafe wording.
- Existing observation/history regressions.
- `git diff --check`.

## Delivery

Work from clean origin/main in the isolated worktree `/Users/bill/final-project-inspection-overview` on branch `codex/inspection-overview-002`. Preserve the dirty primary checkout unchanged.
