# Task Brief

## Task ID

WEB-FIELD-WORKSPACE-001

## Status

IN_REVIEW

## Title

Direct Thai-first workspace for one saved field

## User outcome

An authenticated user can open a saved field from the farm-detail collection at
`/fields/{field_id}`, view its server-authoritative area and saved boundary, and
inspect or request the latest Sentinel-2 metadata through the existing safe,
tenant-scoped contracts.

## Confirmed facts

- PR #5 is merged and farm detail now displays every field with page-local
  selection.
- No `apps/web/app/fields/[id]/page.tsx` route exists.
- Existing `GET /api/v1/fields/{field_id}` is viewer-readable, organization-scoped,
  read-only, and returns foreign/deleted fields as indistinguishable `404`.
- Existing latest-metadata GET is read-only and makes no provider request.
- Existing search-latest POST is explicitly viewer-permitted, CSRF-protected for
  cookie auth, rate-limited, uses persisted geometry, and idempotently reuses
  acquisition records.
- `FieldMap` already renders a saved non-editable boundary. `SatelliteStatusCard`
  already renders the four satellite result states, but its latest GET uses default
  query retries and its error surface can expose the backend message.

## Scope

- Add directly navigable `/fields/[id]` using only the existing field GET.
- Add one explicit workspace link for every field in the farm-detail collection;
  keep the existing same-page selection behavior.
- Show field name, server-returned area, saved boundary, and existing satellite
  metadata card in a Thai-first operational layout.
- Keep the existing viewer-visible metadata-search action because the API contract
  explicitly grants it to `viewer`; it is an idempotent metadata lookup, not a
  field geometry mutation.
- Make satellite latest/search errors safe and non-raw, and disable automatic
  query retry so one rendered attempt cannot multiply the browser client's own
  bounded recovery flow.

## Out of scope

- Field edit/delete/rename, geometry drawing, farm mutation, role lookup, URL-backed
  tab state, breadcrumbs framework, shared workspace abstraction, pagination, or
  provider/raster/analysis features.
- API/OpenAPI/backend/migrations/types/auth client/permissions/FieldMap behavior,
  product dependency, configuration, lockfile, or global token changes.
- Live Copernicus validation; deterministic browser mocks prove browser behavior
  only.

## API, tenant, and safety contract

- Resolve `GET /api/v1/auth/me` before field content, then use
  `GET /api/v1/fields/{field_id}` as the only tenant-content page request.
- `GET /api/v1/fields/{field_id}/satellite/latest` and the existing search POST
  remain encapsulated by `SatelliteStatusCard`.
- Backend active-membership scope is authoritative. A `404` never distinguishes
  absent, deleted, or foreign data.
- Key field data by the settled authenticated user ID and field ID. While identity
  loads or refetches, render no cached field or satellite content. Terminal
  `authentication_required` / `invalid_refresh_token` hides content and removes
  every current authenticated query root before a login action: `current-user`,
  `farms`, `farm`, `fields`, `field`, `organizations`, `organization-members`, and
  `satellite-latest`.
- Do not show field, farm, organization, provider-item, geometry-coordinate, token,
  cookie, or raw-error identifiers except the pre-existing provider item disclosure
  after an `available` result.
- Area values are labelled as server-calculated; no browser area calculation.
- Satellite wording remains metadata-only and never diagnoses, alerts, prescribes,
  or treats unavailable/insufficient data as an all-clear.
- No browser storage, direct provider call, analytics, or off-origin fixture request.

## State contract

1. Identity loading/refetching: Thai status; no cached field/map/area/satellite
   content or field request before an identity is available.
2. Field loading: Thai status; no stale field/map/area/satellite content.
3. Typed authentication failure: Thai session-expired state with `/login` action;
   no retry loop.
4. `404`: safe Thai not-found-or-no-access state without distinction.
5. Other field/network/validation failure: safe Thai alert and explicit retry; no
   raw backend detail.
6. Success: field name, server area, back link to its farm, saved map, and satellite
   card; no edit/delete/create controls.
7. Satellite latest loading, `not_searched`, `available`, `no_data`, and
   `temporarily_unavailable` remain distinct.
8. Satellite latest/search failure: safe Thai error; 429 gets bounded rate-limit
   copy; no raw detail and no automatic query retry.

## Ownership

- Orchestrator only:
  - `.agents/tasks/WEB-FIELD-WORKSPACE-001-task-brief.md`
- Implementation owner:
  - `apps/web/app/fields/[id]/page.tsx` (new)
  - `apps/web/app/farms/[id]/page.tsx` only workspace-link additions
  - `apps/web/components/SatelliteStatusCard.tsx` only safe error/retry behavior
  - `tests/e2e/field-workspace-001.spec.ts` (new)
  - `tests/e2e/farm-fields-list-001.spec.ts` only workspace-link assertions
  - `tests/e2e/ui-system.spec.ts` only satellite safe-error assertion
- Every other path is read-only, including FieldMap, API client, types, permissions,
  backend, contracts, migrations, configs, packages, and locks.

## Required focused tests

- Farm-detail collection gives each field an exact `/fields/{id}` link without
  removing same-page selection.
- Direct field route loading, authenticated error, safe `404`, other field error,
  and success states are mutually exclusive and expose no raw detail.
- One same-QueryClient principal A → terminal auth → principal B transition proves
  A's name, area, map, and satellite state disappear immediately; B's denied field
  returns the safe `404`, and no satellite request starts for B.
- Success shows the API name once, server area values, back-to-farm link, saved map,
  and neutral `not_searched` satellite state.
- Satellite `available`, `no_data`, `temporarily_unavailable`, latest error, search
  error, and 429 copy remain truthful; each latest/search operation stays within
  exact request bounds.
- HTML-like/long Thai field names are escaped; no injected element/off-origin
  request, raw geometry/tenant ID, unsupported diagnosis, or browser storage.
- Keyboard/focus, 44px actions, one H1, semantic status/alert, and no horizontal
  overflow at 390×844, 768×1024, 1024×768, and 1280×800.

## Focused validation

- `npm -w apps/web run typecheck`
- `npm -w apps/web run build`
- `npx playwright test -c apps/web/playwright.config.ts
  field-workspace-001.spec.ts farm-fields-list-001.spec.ts ui-system.spec.ts
  --workers=1`
- `git diff --check`
- Focused scan for raw errors, secrets/storage, hardcoded tenant IDs, geometry/area
  calculation, off-origin requests, and unsupported satellite claims.

## Acceptance criteria

- Every field shown on farm detail can open its dedicated workspace.
- Direct route states are Thai-first, safe, accessible, and tenant-truthful.
- Map/area/satellite content comes only from current contract-backed responses.
- No API/backend/type/dependency/global-design change occurs.
- Validation passes and Ponytail returns one valid LOCAL_NATIVE receipt. The
  accepted continuous lifecycle may then deliver the exact reviewed feature through
  green CI and merge; production security and deployment remain separate gates.

## Implementation evidence

- Web typecheck: PASS.
- Production build: PASS; `/fields/[id]` was built successfully.
- Focused serialized Playwright validation: PASS, 24/24 across the field workspace,
  farm-field collection, and shared UI regression specs.
- `FIELD-TENANT-CACHE-001` correction: field data is keyed by settled principal and
  identity loading/refetch hides tenant content.
- `FIELD-TENANT-PURGE-001` correction: terminal auth purges every current
  authenticated query root, and the same-QueryClient A→terminal-auth→B regression
  proves no field, satellite, farm, or organization cache survives for principal B.
- Diff integrity and focused tenant/privacy scans: PASS.

## Stop conditions

- Stop on API/type mismatch, need for edit/mutation/permission redesign, required
  change outside ownership, new route architecture/dependency, ambiguous provider
  semantics, unapproved installation, or any secret/tenant boundary conflict.
