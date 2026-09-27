# AGRISCOPE-UI-POLISH-PRODUCTION-001

Status: VALIDATED_PENDING_MERGE

## Objective

Polish the existing AgriScope production UI without introducing an external design system or changing business/API/satellite behavior.

## Product direction

- Thai-first.
- Map-first.
- Evidence-first.
- Non-diagnostic.
- Preserve all working feature contracts and tenant/auth boundaries.
- Prefer fewer, clearer surfaces over dashboard/card accumulation.

## Audit findings

P0:
1. Create Farm and Add Field still mix Thai and English.
2. Farm creation and first-field creation feel like separate engineering screens instead of one onboarding flow.
3. Map drawing and coordinate entry both exist but coordinate entry is hidden as a secondary disclosure.
4. The primary save action is easy to lose below/above the map on smaller screens.
5. Drawing state does not clearly tell the user what to do next.
6. Map editing exposes technical labels such as Draw mode, Vertices and MapLibre.

P1:
1. Farm inspection evidence should surface as a stronger summary before technical details.
2. Status language should stay consistent and simple: ควรตรวจ / มีผลเปรียบเทียบ / ข้อมูลยังไม่พอ / รอข้อมูล.
3. Technical provenance remains available but should not dominate the default hierarchy.
4. Mobile should preserve the map as the dominant surface.

## Scope

Owned paths:
- .agents/tasks/AGRISCOPE-UI-POLISH-PRODUCTION-001-task-brief.md
- apps/web/app/farms/new/page.tsx
- apps/web/app/farms/[id]/fields/new/page.tsx
- apps/web/components/FieldMap.tsx
- apps/web/components/SatelliteStatusCard.tsx
- apps/web/app/farms/[id]/page.tsx
- apps/web/components/map-workspace.module.css
- apps/web/app/globals.css
- tests/e2e/field-001.spec.ts
- tests/e2e/farm-fields-list-001.spec.ts
- tests/e2e/map-workspace-001.spec.ts

All other paths are read-only.

## Required changes

### Farm onboarding
- Translate user-facing create-farm content to Thai.
- Primary create action continues directly to first-field creation.
- Explain that field boundary can be drawn on the map or entered as WGS84 decimal coordinates.
- Do not change POST /farms contract.

### Field creation
- Thai-first heading, labels, errors and controls.
- Make two entry methods clearly visible: วาดบนแผนที่ and กรอกพิกัด.
- Both methods share the same point list/polygon and may be mixed.
- Show next-action guidance based on point count.
- Keep backend geometry validation and server-authoritative area unchanged.
- Add persistent/sticky save affordance with explicit disabled reason.
- Preserve map click, drag, undo, delete, geolocation, coordinate validation and exact GeoJSON serialization.
- Remove product-visible implementation detail labels.

### Farm workspace
- Surface a concise inspection summary using existing inspection-overview data.
- Do not add a new API request or score.
- Keep map/list/inspector selection behavior and safe wording unchanged.
- Technical metrics remain below the user-facing conclusion.

## Non-goals

- No external UX/UI kit.
- No design-system replacement.
- No API/backend/migration changes.
- No new satellite calls.
- No algorithm/threshold changes.
- No new diagnosis or agronomic recommendation.
- No CSV/UTM/DMS import.
- No new dependency.

## Validation

- Existing full field E2E remains green after Thai copy changes.
- Add separate full-path evidence for map-only boundary creation and coordinate-only boundary creation.
- Desktop and mobile viewport assertions for sticky action visibility and no horizontal overflow.
- Existing map-workspace regression remains green.
- TypeScript typecheck.
- Production build.
- Browser regression.
- git diff --check.


## Validation evidence — 2026-09-27

- Delivery base: `9266c2ef7695c58d8ed24b48cf98d2cedc8d9bcd` (`origin/main` at branch creation).
- Delivery worktree: `/Users/bill/final-project-ui-polish-production` on `codex/ui-polish-production-001`; the dirty primary checkout was preserved unchanged.
- Local dependency installation was attempted only inside the isolated worktree and failed closed on DNS resolution for `registry.npmjs.org`; generated npm/cache artifacts were removed.
- GitHub Actions CI run #49 for `35106a08d790825c63d0387c9e1f82f828016d34` passed:
  - validation: PASS
  - integration: PASS
  - browser-regression: PASS
- Static validation therefore proved TypeScript typecheck, production build, Python/unit/contract checks and `git diff --check` on the exact commit.
- Browser regression proved the real API/PostGIS field journey after Thai-first onboarding, coordinate-only field creation, map-only mobile creation, map/list/inspector behavior, empty-state CTA, and mobile bottom-sheet details.
- No backend, API, migration, dependency, provider, satellite algorithm, comparison threshold, tenant/auth contract, or production data path changed.
- No external UX/UI kit or design-system replacement was introduced.
- IRIS-X does not expose the native Ponytail `code_review` surface in this session; no formal LOCAL_NATIVE-review claim is made. The exact diff was manually reviewed by the ChatGPT lifecycle owner and then exercised by matching CI.
