# Task Brief

## Task ID

WEB-FARMS-LIST-001

## Status

IN_REVIEW

## Title

Thai-first farm workspace list derived from the verified landing baseline

## Business goal

An authenticated user can open `/farms`, see every active farm returned by their organization-scoped API, understand whether they may create a farm, and open a farm workspace through a calm Thai-first operational UI that inherits the verified landing/APP-UI design system without inventing field, map, area, satellite, or agronomic data.

## Activation dependency

- The browser client contract is stable on merged `main` at
  `7fcef1f9d487dac05758b7f03cb340615c271692`. This task pins
  `apps/web/lib/api.ts` at SHA-256
  `1c6a2882b09fb82ff9ebd304c75f147aa7fef323d3d1c373d93e7b7e6ce80396`
  and `apps/web/lib/types.ts` at SHA-256
  `3196e01a1bf245edb28c38b7d8161f00621b6afbf62197a1e8cf413d6e663da2`
  as read-only dependencies. Drift in either path stops implementation and returns
  this task to contract review.
- The owner authorized the next aggregate contribution after the approved
  REAL-STACK-001 and WEB-UI-CSRF-MOCK-001 LOCAL_NATIVE gate. Their four-file
  working-tree delta is preserved. After validation proved two stale English farm
  assertions, the owner authorized a narrow `tests/e2e/ui-system.spec.ts`
  correction limited to the farm-list cases; the approved login/CSRF mock remains
  unchanged.
- The tracked baselines in `apps/web/app/farms/page.tsx` and
  `apps/web/lib/permissions.ts` are adopted exclusively by this task for the
  implementation window. No concurrent task may edit them.

## API and data contract

- Resolve `GET /api/v1/auth/me` first and do not expose tenant content until the authenticated principal is settled.
- Primary list is unfiltered `GET /api/v1/farms`; never hardcode an organization ID or invent pagination/filter/sort parameters.
- Permission support uses `GET /api/v1/organizations` plus `GET /api/v1/organizations/{id}/members` for visible organizations only.
- Display only contract-backed farm values: `name`, nullable `province`, joined organization name when available, and `updated_at` labelled `แก้ไขล่าสุด`. IDs are routing/correlation data and are never displayed.
- Creation appears only after a matching active membership role of `field_manager`, `agronomist`, `organization_admin`, or `organization_owner` is verified. Unknown roles/statuses and any permission error fail closed.
- Frontend permissions are presentation only; backend authorization remains authoritative.
- Consume the final WEB-SEC typed error/recovery contract without editing `api.ts`, `types.ts`, OpenAPI, or backend runtime.
- Disable automatic React Query retries for terminal 4xx/429. Network/5xx retry is explicit user action so query retries cannot multiply WEB-SEC recovery attempts.

## Tenant cache contract

- Farms, organizations, and member queries are keyed by the settled authenticated user ID and organization/filter as applicable; they pass abort signals and never use previous/placeholder data from another principal.
- While identity is loading or refetching, render no cached tenant content. Terminal `authentication_required` / `invalid_refresh_token` hides and removes auth-scoped queries immediately before navigation or login action.
- Permission queries begin only after identity and visible organizations settle. They inspect only the current user's matching active membership in memory and never render the full member response.
- Same-principal background refresh may retain verified content only when visibly announced as updating/stale. A principal/auth transition synchronously suppresses old content.

## State matrix

1. Identity loading/refetching: authenticated shell plus `role=status`; no farm/org/member data or mutation control.
2. Terminal authentication failure: hide tenant content; Thai session-expired state and `/login` action; no retry loop.
3. Initial farm loading: `กำลังโหลดรายการฟาร์ม…` with `aria-busy`; no empty/error/list/count/create UI.
4. Non-empty + permissions pending: render farms, announce permission check, withhold create control and viewer conclusion.
5. Non-empty + manageable role: list plus one `สร้างฟาร์ม` action.
6. Non-empty + viewer: list plus neutral view-only explanation; no create action.
7. Empty + manageable role: `ยังไม่มีฟาร์ม` and one `สร้างฟาร์มแรก` action.
8. Empty + viewer: `ยังไม่มีฟาร์มที่เข้าถึงได้`; no create action.
9. No active organizations: `บัญชีนี้ยังไม่มีพื้นที่ทำงานขององค์กร`; no foreign-workspace implication or create action.
10. Permission partial/error: loaded farms remain readable, mutation controls stay absent, and a non-raw accessible alert offers permission retry. Never classify an error as viewer.
11. Farm network/5xx: `โหลดรายการฟาร์มไม่สำเร็จ`, explicit retry, never empty and never login unless typed auth failure.
12. 403: safe no-permission state; 404/422 future filter failure: generic not-visible/invalid-selection state; 429: `มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง`; no automatic retry or existence detail.
13. Same-principal background refresh: announce `กำลังอัปเดตรายการ…`; on failure retain the list only with a stale warning and explicit retry.
14. Combined failures: authentication suppresses all tenant UI; farm error is primary over secondary permission noise.

## Copy and safe claims

- Kicker: `พื้นที่ทำงานฟาร์ม`.
- H1: `ฟาร์มของคุณ`.
- Introduction: `เลือกฟาร์มเพื่อดูแปลงที่บันทึกไว้ หรือสร้างฟาร์มใหม่เมื่อบัญชีของคุณมีสิทธิ์`.
- Count: `ฟาร์มที่เข้าถึงได้ {n} แห่ง`.
- Labels: `ชื่อฟาร์ม`, `จังหวัด`, `องค์กร`, `แก้ไขล่าสุด`, `เปิดฟาร์ม`; null province is `ยังไม่ได้ระบุ`.
- Viewer note: `คุณเปิดดูฟาร์มและแปลงได้ แต่การสร้างฟาร์มต้องใช้สิทธิ์ผู้จัดการแปลงขึ้นไป`.
- Permission failure: `ยังตรวจสอบสิทธิ์การสร้างฟาร์มไม่ได้ ปุ่มสร้างฟาร์มจึงถูกปิดไว้เพื่อความปลอดภัย`.
- Remove current technology metric cards and fake field polygons. Do not show field counts, area, live/current imagery, health/risk/anomaly/diagnosis/alert/prescription, readiness, or a map shape not returned by contract.
- The page makes no provider, map/tile, satellite, remote-asset, or mutation request.

## Design and responsive behavior

- Retain verified `PageShell`, warm cream canvas, quiet cream surface, forest hierarchy, semantic borders, restrained shadow, local Thai system font, visible focus, and compact workbench density.
- Use one operational header panel, truthful count, and contextual create action; no landing-sized marketing hero or glass/gradient metric stack.
- At `>=1024px`, render one semantic fixed-layout table with assistive caption, scoped column headers, wrapping Thai text, farm name link, and explicit open action.
- Below `1024px`, render stacked cards with name, province, organization, updated time, and a full-width minimum-44px open action. Tablet remains cards.
- If table and cards coexist responsively, the inactive collection uses `display:none` and is absent from layout/accessibility exposure.
- Use `<time dateTime>` with deterministic Thai formatting. Long Thai/HTML-like content wraps and is escaped by React.
- Add no raw colors, global tokens, decorative motion, or shared-shell redesign; existing forced-colors/reduced-motion behavior remains.

## File ownership

- Orchestrator only:
  - `.agents/tasks/WEB-FARMS-LIST-001-task-brief.md`
- Single implementation owner after activation:
  - `apps/web/app/farms/page.tsx`
  - `apps/web/components/farms/FarmCollection.tsx` (new)
  - `apps/web/components/farms/FarmCollection.module.css` (new)
  - `apps/web/lib/permissions.ts`
  - `tests/e2e/farms-list-001.spec.ts` (new)
  - `tests/e2e/field-001.spec.ts` (one farm-list create-link selector only)
  - `tests/e2e/ui-system.spec.ts` (farm-list assertions only)
- Read-only: `apps/web/lib/api.ts`, `apps/web/lib/types.ts`,
  verified globals/shell/primitives, all API/OpenAPI/runtime files,
  package/lock/config, landing, farm-detail/field routes, other tests, and
  unrelated dirty/untracked files.

## Security and accessibility requirements

- Server organization scope and role enforcement remain authoritative; no organization/user ID is hardcoded or displayed.
- No tenant content appears before identity settles or after terminal auth failure/account change.
- Create controls remain absent while permission is loading, stale, missing, unknown, disabled, or failed.
- Never render raw response bodies, stack traces, tokens, cookies, member IDs, organization IDs, or foreign-resource distinctions.
- React escaping only; no unsafe HTML, browser storage, provider/map request, analytics, or new external asset.
- One H1; semantic table/list; labelled status/alert; non-color-only states; minimum 44x44 targets; visible two-tone/system focus; long Thai wrapping; keyboard, forced-colors, and reduced-motion compatibility.

## Tests

- Focused E2E covers delayed loading, populated multi-organization response order, manager/viewer, permission loading/error/partial, manageable/viewer empty, no organization, typed auth/CSRF/403/429/network/5xx, explicit retry, no empty-on-error, stale background refresh, and principal A → terminal auth → principal B cache transition.
- Test unknown/disabled roles fail closed, mixed organizations, null province, missing organization-name fallback, long Thai values, and an HTML-like farm name rendered as text with no injected element/request.
- Assert count equals response length, every farm appears once, links point to `/farms/{id}`, and creation never appears before verified permission.
- Assert exact allowed GET counts, bounded terminal failure requests, zero mutations, and zero provider/map/off-origin calls.
- Re-run the owner-approved isolated REAL-STACK field journey so the new farm list
  is exercised through the real browser, FastAPI, and PostgreSQL boundary; preserve
  the previously established tenant/isolation API evidence rather than adding a
  duplicate integration test or destructive fixture.
- Accessibility/visual checks: keyboard order, focus contrast, target sizes, semantic headers/caption, status/alerts, forced colors, reduced motion, and no horizontal overflow at 320x800, 375x812, 390x844, 414x896, 768x1024, 1024x768, 1280x800, and 1920x1080.
- Visual QA captures 1280x800 desktop table with long Thai fixtures, 390x844 mobile cards, and 768x1024 portrait-tablet cards.
- Run supported-toolchain typecheck, uncontended clean production build, the new
  focused farm-list suite, the read-only WEB-SEC suite, the isolated REAL-STACK
  field journey, secret/off-origin scan, and `git diff --check`.

## Acceptance criteria

- Every API-returned farm is visible exactly once, in response order, and opens `/farms/{id}`.
- Count and displayed metadata are truthful; no unsupported map/metric/satellite/agronomic claim remains.
- Creation appears only for a verified qualifying role; all loading/empty/error/permission/stale/auth states are distinct and tested.
- Desktop uses an accessible table; mobile/tablet use cards without duplicate accessible content or overflow.
- Primary UI is Thai-first and recognizably inherits the verified landing/APP-UI baseline.
- No backend/API/shared-security/dependency change occurs.

## Validation outcome

- Web TypeScript check and clean production build: PASS.
- Serialized browser regression: 47/47 PASS across the focused farm-list,
  UI-system, and read-only WEB-SEC suites.
- Isolated REAL-STACK field journey: 1/1 PASS through browser, FastAPI, and a
  temporary PostgreSQL/PostGIS database; the temporary database and local test
  session were removed afterward and the persistent Compose database remained on
  its separate unchanged port.
- Visual QA: PASS at 1280×800 desktop table, 390×844 mobile cards, and 768×1024
  tablet cards; long Thai content wraps and measured document width does not
  exceed the viewport.
- The first aggregate regression run proved two stale English farm assertions in
  `ui-system.spec.ts`; the owner authorized only those farm assertions. The first
  real-stack rerun then proved one ambiguous create-link selector; exact matching
  resolved it without product behavior change.
- The LOCAL_NATIVE correction added exact coverage for tenant-cache purge,
  principal A → terminal auth → principal B, mixed permission/auth failures,
  cached-empty refresh failure, unknown/disabled roles, typed 403/404/422/429/5xx
  and network failures, initial loading, and the 1024px breakpoint. During
  validation it also proved one unsafe raw 5xx message and one stale empty-state
  create-link selector; both were corrected and the complete suites reran cleanly.
- `git diff --check`, dependency-pin reauthentication, and sensitive/off-origin
  source scans: PASS.

## Risks

- Permission lookup is currently N+1 and exposes more member IDs/roles than a caller-role endpoint would; later contract hardening may replace it, but this slice must not invent that API.
- `GET /farms` is unpaginated; large collections remain later contract work.
- WEB-SEC may change the typed-client surface; any mismatch returns this slice to contract review.
- Responsive table/card duplication must remain hidden from both layout and accessibility at the inactive breakpoint.
