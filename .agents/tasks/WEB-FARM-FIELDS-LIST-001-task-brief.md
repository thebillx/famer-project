# Task Brief

## Task ID

WEB-FARM-FIELDS-LIST-001

## Status

CONTRACT_READY

## Title

Show every saved field in the Thai-first farm detail workspace

## User outcome

An authenticated user opening `/farms/{farm_id}` can see every active field
returned by the existing organization-scoped API, select one field at a time, and
inspect that field's server-authoritative area, saved boundary, and latest
Sentinel-2 metadata state without silently hiding later fields.

## Confirmed facts

- `GET /api/v1/farms/{farm_id}/fields` already returns `FieldBoundary[]` in API
  order and is tenant-scoped by the backend contract.
- The current page renders only `fields.data?.[0]`.
- `FieldMap` and `SatelliteStatusCard` already accept one selected field boundary
  and field ID.
- A dedicated `/fields/[id]` route does not exist and is a later UI-V1 slice.
- PR #4 is merged on `main`; its farm-list, auth recovery, and tenant-cache
  behavior are read-only dependencies.

## Scope

- Replace the first-field shortcut with a visible semantic collection containing
  every returned field exactly once and in response order.
- Select the first returned field initially. A user can select another field on
  the same page; selection updates the active name, authoritative area, map
  boundary, and satellite-status field ID without a new API contract.
- Present primary farm-detail, loading, empty, error, permission, selection, and
  action copy in Thai. Provider/product names may remain in English.
- Preserve the existing role-gated field-creation action and fail closed while
  permission is loading or failed.
- Use only contract-backed names, area values, geometry, and status. Never compute
  area in the browser or invent health/anomaly/live imagery claims.

## Out of scope

- `/fields/[id]`, editing/deleting fields, URL-backed selection, pagination,
  filtering, sorting, or a shared selection abstraction.
- API, backend, OpenAPI, migrations, types, authentication client, permissions
  implementation, MapLibre internals, provider behavior, satellite semantics,
  product dependencies, lockfiles, or global design tokens.
- Live Copernicus validation; deterministic browser mocks remain test evidence,
  not production-provider proof.

## API and safety contract

- Consume only existing `GET /api/v1/farms/{farm_id}` and
  `GET /api/v1/farms/{farm_id}/fields` responses.
- Backend authorization remains authoritative; foreign/not-visible resources keep
  the existing indistinguishable not-found behavior.
- IDs are routing/selection data and are never displayed.
- Render no raw backend message, geometry coordinates, member records, token,
  cookie, provider credential, or unsupported satellite diagnosis.
- `area_sqm` and `area_rai` are labelled as server-calculated values.
- Empty is rendered only after a successful empty response. Loading and error do
  not render an empty claim or stale field collection.

## State contract

1. Farm loading/error remains distinct from field loading/error.
2. Field loading: Thai labelled status; no collection, map, metrics, satellite
   card, or empty claim.
3. Successful empty: one Thai empty state and the existing role-gated first-field
   action.
4. Non-empty: all fields visible exactly once; first field selected initially.
5. Selection: one field has `aria-pressed=true`; changing selection updates all
   active-field surfaces atomically and does not mutate data.
6. Permission pending/error: field data stays readable, but create controls remain
   absent; error copy is safe and non-raw.
7. Field API failure: safe Thai alert and no empty/list/map/satellite claim.

## Ownership

- Orchestrator only:
  - `.agents/tasks/WEB-FARM-FIELDS-LIST-001-task-brief.md`
- Implementation owner:
  - `apps/web/app/farms/[id]/page.tsx`
  - `tests/e2e/ui-system.spec.ts` only farm-detail assertions affected by the new
    Thai state copy
  - `tests/e2e/farm-fields-list-001.spec.ts` (new)
- Read-only: every other path, including farm-list source/tests, `api.ts`,
  `types.ts`, permissions, MapLibre and satellite components, backend, contracts,
  migrations, packages, configs, and locks.

## Focused validation

- `npm -w apps/web run typecheck`
- `npm -w apps/web run build`
- `npx playwright test -c apps/web/playwright.config.ts
  farm-fields-list-001.spec.ts ui-system.spec.ts --workers=1`
- `git diff --check`
- Source scan for browser storage, raw API detail, hardcoded tenant IDs, external
  requests, unsupported diagnoses, and client-side area calculation.

## Required tests

- Three fields render once, in response order, with long Thai and HTML-like names
  escaped as text.
- The first field is selected initially; selecting the third updates name, area,
  map boundary input, satellite field request, and `aria-pressed` state.
- Loading, successful empty, API error, permission pending/error, viewer, and
  manager behavior remain distinct and fail closed.
- No field ID/geometry/raw error appears as visible text; no injected element or
  off-origin request is created by fixture content.
- Collection controls meet 44px targets, keyboard selection works, and the page
  does not overflow at 390×844, 768×1024, 1024×768, and 1280×800.
- Existing farm-detail field/satellite error tests remain errors rather than empty
  states.

## Acceptance criteria

- No API-returned field is silently hidden; response order is preserved.
- Exactly one active field drives the map, area, and satellite status.
- Thai-first loading, empty, error, permission, and selected states are truthful
  and accessible.
- No backend/API/type/dependency/global-style change occurs.
- Focused validation passes and Ponytail returns `REVIEW_DECISION: APPROVED` or
  `REVIEW_DECISION: CHANGES_REQUIRED`; the lifecycle then stops for owner action.

## Stop conditions

- Stop on API/type mismatch, required edit outside ownership, ambiguous tenant or
  permission behavior, need for a new route/ADR/dependency, test environment
  requiring unapproved installation, or any security-sensitive behavior beyond
  the established contract.
