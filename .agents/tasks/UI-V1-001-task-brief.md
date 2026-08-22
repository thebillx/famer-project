# Task Brief

## Task ID

UI-V1-001

## Status

PLANNED

## Title

Landing-derived Thai-first authenticated farm workspace V1

## Business goal

After merge, an authenticated user can register or sign in, see only farms available through active organization membership, create a farm when their role allows it, inspect every saved field in a farm, draw a new field, open a dedicated field workspace, and request or inspect the latest Sentinel-2 acquisition metadata through a cohesive Thai-first UI derived from the verified public landing-page visual system.

## User

- Thai farmers and farm owners who need a calm map-first workspace.
- Field managers and agronomists who create farms and verified boundaries.
- Viewers who inspect organization-scoped farms, fields, and latest acquisition metadata without mutation controls.

## Current behavior

- The public landing page already establishes the visual baseline: warm cream paper, deep forest ink, restrained green/blue signals, fine borders, soft elevation, a premium map-card composition, and safe illustrative satellite wording.
- Authenticated routes exist for login/register, farm list, farm creation, farm detail, and field drawing, but the presentation is only partially aligned with the landing baseline and much of the copy is English-first.
- Farm detail renders only the first returned field as the active workspace, so additional saved fields have no clear navigation surface.
- There is no dedicated `/fields/[id]` workspace despite a contract-backed field endpoint.
- Some illustrative capability/metric copy can be mistaken for live operational data.
- Existing uncommitted UI-system changes in the owned files are adopted as the implementation starting point and must be preserved or improved deliberately.

## Expected behavior

- A cohesive authenticated application shell reuses the landing page's studied design DNA without copying the marketing header or inventing a parallel brand system.
- All primary user-facing copy is Thai-first; product/source names such as Sentinel-2 and MapLibre may remain in English.
- Login and registration show explicit idle, submitting, validation, and server-error states. Successful authentication routes to `/farms`.
- The farm workspace uses real API data for counts and records. Capability labels are clearly distinguished from current/live status.
- Mutation controls are hidden or unavailable until the current user's organization role has been verified as `field_manager` or higher.
- Farm detail exposes every returned field and links each one to `/fields/[field_id]`.
- The dedicated field workspace shows the saved boundary, server-authoritative area, safe acquisition state, and the contract-backed latest-acquisition search action.
- Viewers can inspect available data without seeing create or edit controls.
- Loading, empty, error, permission, stale/partial, and insufficient-data states are visually distinct and accessible.
- Logout uses the existing auth contract and returns the user to `/login` without exposing tokens in frontend storage.

## Scope

- Shared authenticated shell, navigation, typography, tokens, buttons, cards, badges, forms, skeletons, empty/error/permission states, and responsive behavior.
- `/login`
- `/farms`
- `/farms/new`
- `/farms/[id]`
- `/farms/[id]/fields/new`
- `/fields/[id]`
- Organization-role lookup used only to gate existing farm/field mutations.
- Focused E2E coverage for the route flow, permissions, state semantics, Thai-first UI, responsive behavior, and safe capability claims.
- Visual review documentation only where it describes these authenticated routes.

## Out of scope

- Public landing-page source and tests; `LANDING-002` is a separate verified slice and is read-only here.
- New analysis, NDVI, anomaly, disease, pest, nutrient, weather, risk, alert, report, notification, billing, invitation, audit-log, scheduler, or preference features.
- New API endpoints, schema changes, database migrations, geospatial formulas, satellite provider behavior, or architecture changes.
- Dark mode until every component/state has dedicated contrast coverage and a user-facing theme preference contract.
- Fabricated farms, fields, coordinates, imagery, metrics, customer names, alerts, or production-readiness claims.

## Dependencies

- `docs/api/openapi.yaml`
- `docs/api/database-schema.md`
- `docs/product/requirements-v1.md`
- Accepted auth, organization, farm, field, and latest Sentinel-2 metadata contracts.
- Existing MapLibre field drawing and server-authoritative area implementation.
- `LANDING-002` visual reference and its safe-copy constraints.
- Sequential child slices beginning with `APP-UI-001`; this program brief does not grant direct file ownership by itself.
- Production mutation/release readiness remains blocked until the separate security/contract slice resolves CSRF protection, cookie-scheme accuracy, rate limits, typed errors, and a distinct satellite `not_searched` state.

## Contracts

- `POST /api/v1/auth/register`: creates user, first organization, and owner membership; register validation/error states required.
- `POST /api/v1/auth/login`: creates authenticated session; generic authentication failure required.
- `POST /api/v1/auth/logout`: revokes the current session; return to `/login`.
- `GET /api/v1/auth/me`: current authenticated user; never persist access or refresh tokens in browser storage.
- `GET /api/v1/organizations`: list organizations scoped by active memberships.
- `GET /api/v1/organizations/{organization_id}/members`: active-member visibility; used to determine whether mutation controls are allowed.
- `GET /api/v1/farms`: active farms visible through current active organization memberships.
- `POST /api/v1/farms`: requires `field_manager` or higher and an organization visible to the current user.
- `GET /api/v1/farms/{farm_id}`: returns only a visible active farm; foreign/not-visible records are indistinguishable from not found.
- `GET /api/v1/farms/{farm_id}/fields`: returns all active fields in the visible farm.
- `POST /api/v1/farms/{farm_id}/fields`: requires `field_manager` or higher; backend validates/normalizes geometry and calculates authoritative area.
- `GET /api/v1/fields/{field_id}`: visible active field for `/fields/[id]`.
- `POST /api/v1/fields/{field_id}/satellite/search-latest`: searches latest intersecting Sentinel-2 L2A acquisition for a saved field.
- `GET /api/v1/fields/{field_id}/satellite/latest`: retrieves the persisted latest acquisition or an explicit no-result/unavailable state.
- API contract change: none. Any discovered contract mismatch returns this task to contract review.

## Design contract

- Macrostructure: Workbench; the map and contract-backed work surfaces are primary, not decorative metric-card grids.
- Theme: studied DNA from Canva `DAHRJR9EibI` and the verified landing page, not a catalog theme.
- Palette: reuse existing AgriScope semantic tokens anchored by warm cream, deep forest green, restrained vegetation green, satellite blue, and explicit warning/danger pairs.
- Type: Thai-first system/local display and body stacks with no runtime font request; at most three font families; tabular numbers for measurements.
- Shape: 10–20px radii, one-pixel borders, restrained shadows, generous but operational density.
- Motion: motion-cut by default. Only state-explaining transform/opacity transitions; all motion has a `prefers-reduced-motion` fallback.
- No fake browser/device chrome, gradient text, glassmorphism, decorative alerts, invented metrics, or unlabeled sample data.

## Agent owners

- Orchestrator: `/root`
- Implementation: `/root/implementation`
- Ponytail local native code/design review: `/root/code_review`

## File ownership

- Orchestrator only:
  - `.agents/tasks/UI-V1-001-task-brief.md`
- Implementation owner:
  - `apps/web/app/globals.css`
  - `apps/web/app/login/page.tsx`
  - `apps/web/app/farms/page.tsx`
  - `apps/web/app/farms/new/page.tsx`
  - `apps/web/app/farms/[id]/page.tsx`
  - `apps/web/app/farms/[id]/fields/new/page.tsx`
  - `apps/web/app/fields/[id]/page.tsx`
  - `apps/web/components/Button.tsx`
  - `apps/web/components/PageShell.tsx`
  - `apps/web/components/Primitives.tsx`
  - `apps/web/components/FieldMap.tsx`
  - `apps/web/components/SatelliteStatusCard.tsx`
  - `apps/web/lib/permissions.ts`
  - `apps/web/lib/types.ts`
  - `tests/e2e/ui-system.spec.ts`
  - `tests/e2e/field-001.spec.ts`
  - `docs/ui-review/README.md`
  - `docs/ui-review/review.md`
- Conditional implementation ownership only if required for deterministic validation:
  - `apps/web/playwright.config.ts`
  - `apps/web/package.json`
- All landing files, API/backend files, contracts, migrations, lockfiles, and unrelated dirty or untracked paths are read-only.

## Security requirements

- Never expose tokens, cookies, credentials, provider secrets, tenant identifiers from another organization, or raw diagnostic details.
- Every rendered farm/field/membership comes only from organization-scoped contract responses.
- Deny mutation UI while membership is loading, stale, missing, or failed; do not retain stale mutation controls after a permission refetch error.
- Do not hardcode an organization ID.
- Do not render a foreign-resource distinction that weakens the contract's 404 privacy behavior.
- Do not add browser storage for authentication.
- Keep satellite wording limited to acquisition metadata and field-inspection prioritization; do not diagnose or prescribe.
- An unavailable or insufficient-quality acquisition must never read as an all-clear.

## Test requirements

- `npm -w apps/web run typecheck`
- `npm -w apps/web run build`
- `npx playwright test -c apps/web/playwright.config.ts ui-system.spec.ts field-001.spec.ts`
- Preserve existing landing tests without editing their files.
- Add or retain focused assertions for:
  - Thai-first headings/navigation and no unsupported `Live`, `Ready`, health score, diagnosis, alert, or prescriptive claims.
  - Authentication submit/error states and logout navigation.
  - Viewer versus field-manager mutation controls.
  - Permission-refetch failure closing stale mutation controls.
  - Loading, empty, API error, permission, and latest-acquisition unavailable/no-result states.
  - Multiple fields all visible and linked to their dedicated workspaces.
  - Server-authoritative area displayed without client-side calculation claims.
  - Keyboard focus, 44px targets, form labels/errors, contrast, and reduced motion.
  - No horizontal overflow at 320×800, 375×812, 414×896, 768×1024, 1024×768, 1280×800, and 1920×1080.
- Perform visual QA at 1280×800, 390×844, and 768×1024 against the landing-derived design contract.
- Run the Hallmark slop-test self-critique before handoff and resolve every applicable gate.

## Acceptance criteria

- The authenticated shell is recognizably the same AgriScope product as the public landing page without copying marketing-only navigation.
- A user can complete register/login → farm list → create/open farm → draw/open field → check latest acquisition metadata through visible, descriptive actions.
- Every contract-backed route has loading, empty, error, and permission behavior appropriate to its data and role.
- Farm detail renders all fields returned by the API; no field is silently hidden behind a first-item shortcut.
- `/fields/[id]` is directly navigable and renders map, authoritative area, and latest acquisition states.
- All primary UI copy is Thai-first and safe; unavoidable provider/product terms remain understandable.
- No user-facing metric or status implies live data unless it came from the current scoped API response. Illustrative content is explicitly labelled as sample.
- Buttons, links, inputs, focus rings, disabled states, and errors meet accessibility requirements without layout shifts.
- Layout remains usable without horizontal overflow across the required viewports.
- No production dependency, API contract, backend, landing page, or lockfile change is introduced.

## Definition of done

- Implementation owner self-verification passes.
- Orchestrator completes desktop/mobile/tablet visual QA and an uncontended production build.
- Ponytail local native code/design review returns an approved or changes-required
  decision, then the automated lifecycle creates the owner handoff and stops.
- Review findings are not auto-fixed. The owner decides corrections, additional
  validation, security review, staging, commit, push, PR, CI, deployment, and merge.
- Status reaches `READY_FOR_OWNER_REVIEW` after Ponytail approval; delivery remains
  entirely owner-controlled.

## Risks

- The worktree already contains uncommitted UI-system changes; the implementation owner must preserve and attribute them carefully rather than treating them as a clean baseline.
- Thai font metrics differ by operating system, so the design must rely on resilient stacks and responsive tests rather than one machine's exact glyph widths.
- Membership lookup currently fans out across visible organizations; V1 must fail closed and avoid misleading controls while loading.
- Map tiles may require a configured style URL and network; non-map content and state messaging must remain usable when tiles fail.
