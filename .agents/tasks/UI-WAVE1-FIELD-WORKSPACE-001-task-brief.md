# Task Brief

## Task ID

UI-WAVE1-FIELD-WORKSPACE-001

## Title

AgriScope Thailand Wave 1 — foundation and Field Workspace

## Business goal

Implement the frozen map-first Field Workspace family in the existing production application without replacing backend, authentication, routing, geometry, or analytical behavior.

## User

Authenticated AgriScope farm members who can view a farm and its fields; management actions continue to follow existing organization permissions.

## Current behavior

The worktree already contains a functional MapLibre farm workspace, contextual field inspector, search, empty/unavailable states, session clearing, style-load synchronization, and focused browser coverage. Its visual shell and state presentation require alignment with the frozen Design Contract v1.

## Expected behavior

- The map remains the largest continuous workspace at the 1440 × 900 target.
- Overview, A02 selected, A01 normal selected, filtered search, empty farm, and field-data-unavailable states use the approved composition and preserve real application state.
- List and map selection stay synchronized; selection is cleared immediately when farm or filtered field identity changes.
- Geometry remains visible when analytical data is unavailable.
- Terminal authentication failures hide protected workspace content through the existing query-cache contract.
- Priority, selection, analysis, and future edit states remain separate; no field is assigned priority without a production source.

## Scope

- Semantic map-workspace tokens and existing responsive shell styling.
- Existing shared application shell used by the map workspace.
- Existing farm detail composition, field list/search/selection, contextual inspector, empty and unavailable states.
- Existing reusable `FarmOverviewMap` geometry, label, filter-dimming, selection, loading, and recoverable error behavior.
- Focused Playwright contract for the six Wave 1 states and blocking interaction regressions.

## Out of scope

- Full Field Analysis, Compare, Change Review, Farm Management, or Draw Boundary implementation.
- Backend/API/OpenAPI/database/migration/provider changes.
- Authentication or permission redesign.
- New dependencies, remote font downloads, deployment, security review, commit, push, or PR.
- Hardcoded Figma scenario values, fake priority evidence, fake imagery, diagnosis, alerts, or agronomic advice.

## Dependencies

- Existing Next.js 15, React 19, TanStack Query, Tailwind v4, MapLibre 5.6, and Playwright setup only.
- Existing farm, field, organization-member, and satellite-latest API contracts.
- Existing MapLibre production style configured by `NEXT_PUBLIC_MAP_STYLE_URL`.

## Contracts

- Figma Design Contract v1: file `nzLnQye4zydQdA09PJstuI`, node `180:506`.
- Exact State Index: node `184:506`.
- Wave 1 exact states: Overview `167:223`; A02 Selected `167:342`; A01 Normal Selected `167:462`; Search/Filtered `167:582`; Empty Farm `167:703`; Field Data Unavailable `167:829`.
- Approved A02 spatial reference only: `138:130`; full Change Review remains out of scope.
- Existing repository API, auth, permission, geometry, and routing contracts remain authoritative.

## Agent owners

- Lifecycle and implementation owner: `/root`.
- Initial repository audit: `/root/wave1_repo_audit` (read-only).
- Final independent review: `code_review` / Ponytail LOCAL_NATIVE (read-only exact final diff).

## File ownership

Owned for this task:

- `.agents/tasks/UI-WAVE1-FIELD-WORKSPACE-001-task-brief.md`
- `apps/web/app/farms/[id]/page.tsx`
- `apps/web/components/MapWorkspaceShell.tsx`
- `apps/web/components/FarmOverviewMap.tsx`
- `apps/web/components/map-workspace.module.css`
- `apps/web/lib/permissions.ts`
- `tests/e2e/map-workspace-001.spec.ts`
- `tests/e2e/ui-system.spec.ts`

All other modified and untracked paths are owner work and remain untouched.

## Security requirements

- Keep cookie-based API calls, CSRF handling, refresh behavior, terminal-auth cache clearing, and organization permission checks unchanged.
- Permission lookups do not retry terminal session failures before the workspace is hidden.
- Do not expose credentials, tokens, tenant data, or protected stale content.
- No formal security review is authorized by this task.

## Test requirements

- TypeScript typecheck and production build.
- Focused Playwright validation at 1440 × 900 for all six exact states.
- Regression checks for list↔map selection, farm/field identity clearing, search filtering, empty farm, unavailable imagery, style load/data race, style failure, terminal auth, keyboard controls, and narrow/tablet layout.
- Six localhost screenshots compared directly with the six exact Figma nodes; dynamic map pixels are cosmetic-only.

## Acceptance criteria

- Map-first 288 / fluid map / conditional 328 workspace proportions match the frozen contract.
- UI uses semantic surfaces, dividers, typography hierarchy, restrained radii, open rows, compact labels, and accessible controls.
- Overview has no selected field or inspector.
- A01 is calm and never styled as an alert merely because it is selected.
- A02 selection remains visually distinct from any production-sourced priority cue.
- Search keeps spatial context and truthfully clears an invalid hidden selection.
- Empty farm keeps the map and exposes exactly one permitted Add Field action.
- Unavailable analysis keeps real geometry and selection visible without fabricated values.
- No generic dashboard, KPI cards, fake data, diagnosis, alerts, or future-wave UI is introduced.

## Definition of done

Focused validation is green; all six screenshots are captured and compared; the ten-point visual self-critique has no meaningful debt; independent Ponytail LOCAL_NATIVE review returns `APPROVED`; no commit, push, or PR is made.

## Risks

- The current field/farm API has no production priority field, so visual priority cues can only render when a future explicit contract supplies IDs; A02 must not be hardcoded as priority.
- IBM Plex Sans Thai and IBM Plex Mono are named in the workspace font stack but are not bundled in the repository or installed locally. Adding or downloading fonts is a dependency/asset expansion and is intentionally stopped at the documented fallback.
- Live map tile pixels and labels differ from Figma artwork by design; only UI chrome and field-state semantics are strict comparison targets.
