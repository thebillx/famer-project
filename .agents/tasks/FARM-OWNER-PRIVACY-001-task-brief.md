# Task Brief

## Task ID

FARM-OWNER-PRIVACY-001

## Status

VERIFIED

## Title

Farm-owner privacy inside one organization

## Business goal

Prevent an authenticated non-owner from listing, reading, changing, deleting, or
processing another member's farm or field while preserving organization-owner
oversight.

## User

Farm owners and organization owners in companies, cooperatives, and individual
accounts.

## Current behavior

Cross-organization access is tenant-scoped and generic-404 safe. Within one
organization, any active viewer can currently list/read another member's farm and
invoke satellite work for its fields. Executable farms/fields have no owner column.

## Expected behavior

- `organization_owner`: all active farm aggregates in the organization, subject to
  the existing operation role requirement.
- Other active roles: owned farm aggregates only. A newly created farm is owned by
  the authenticated creator.
- Fields and every satellite child inherit farm ownership.
- Lists omit non-owned rows. Direct non-owned farm/field/satellite identifiers use
  the existing indistinguishable `404 not_found` response before rate/provider/
  mutation work.
- Ownership is immutable; no sharing, delegation, or transfer endpoint.

## Scope

- Add and backfill `farms.owner_user_id` with same-organization membership
  integrity and index.
- Add the farm-owner predicate once in tenant repositories so all farm, field, and
  satellite callers inherit it.
- Update ORM/records, OpenAPI/database contract, migration/contract/integration
  tests, and existing fixtures.

## Out of scope

Frontend redesign, field-level owners, access grants, ownership transfer,
invitations, notification, audit UI, satellite algorithm changes, diagnosis, new
dependency, or new service.

## Dependencies

- ADR-0008 accepted.
- Current owners of `docs/api/openapi.yaml`,
  `tests/contract/test_foundation_contract.py`, and
  `tests/integration/test_foundation_api.py` must merge or explicitly release those
  exact bytes before implementation.
- Migration preflight must prove every organization containing farms has exactly
  one active `organization_owner`; otherwise stop for an owner mapping.

## Contracts

- Add non-null `farms.owner_user_id`.
- Add composite `RESTRICT` foreign key
  `(organization_id, owner_user_id) -> memberships(organization_id, user_id)` and
  an owner index. New farms derive owner from the authenticated principal.
- Fields inherit ownership through the existing farm relationship; do not add a
  field owner column or return owner IDs to the browser.
- Backfill only to the single active organization owner. Ambiguity aborts the
  migration transactionally.
- Existing structural API schemas remain unchanged; OpenAPI documents the owner
  predicate for farm, field, and all satellite operations.

## Agent owners

- Orchestrator: requirements, ADR, task, ownership release, final integration.
- Implementation writer: migration/model/repository/contracts/tests only after
  dependency release.
- Ponytail: final LOCAL_NATIVE code review only.

## File ownership

- `docs/product/requirements-v1.md`
- `docs/decisions/ADR-0008-farm-owner-privacy.md`
- `.agents/tasks/FARM-OWNER-PRIVACY-001-task-brief.md`
- `apps/api/migrations/versions/20260823_0004_farm_owner_scope.py`
- `apps/api/agriscope_api/db/models/farm.py`
- `apps/api/agriscope_api/repositories/farms.py`
- `apps/web/app/login/page.tsx`
- `docs/api/database-schema.md`
- `docs/api/openapi.yaml`
- `tests/contract/test_migration_contract.py`
- `tests/contract/test_foundation_contract.py`
- `tests/e2e/field-workspace-001.spec.ts`
- `tests/integration/test_foundation_api.py`

All other files are read-only. Preserve unrelated modified/untracked work.

## Security requirements

- Organization scope and active membership remain mandatory in every query.
- Same-organization non-owner, disabled member, foreign user, deleted resource,
  and missing resource receive indistinguishable 404 responses.
- Hidden satellite fields stop before acquisition lookup, rate limiting, OAuth,
  provider calls, persistence, or private error detail.
- Payloads and browser responses never select or disclose `owner_user_id`.

## Test requirements

- Migration preflight: deterministic single-owner backfill; zero/multiple owners
  abort; upgrade -> downgrade 0003 -> upgrade cycle.
- Farm list/detail/create/update/delete for organization owner, resource owner,
  same-organization non-owner, disabled member, and foreign user.
- Field list/detail/create/update/delete inherits the same boundary.
- All metadata/search/preview/NDVI satellite routes return generic 404 and perform
  zero downstream work for a hidden field.
- Existing role gates, geometry authority, acquisition idempotency, quality gates,
  UI regressions, unit/contract/integration suites, and `git diff --check` pass.

## Acceptance criteria

- No non-owner role can observe another member's farm, field, geometry, area,
  acquisition, imagery, or NDVI values by list or guessed ID.
- The organization owner retains organization-wide oversight.
- A farm owner retains access after a role downgrade to viewer but cannot perform
  operations disallowed by the viewer role.
- Hidden requests are blocked before provider/rate/mutation work and expose no
  private detail.

## Definition of done

Migration, model/repository, contracts, and deterministic integration tests pass;
Ponytail returns `APPROVED`; matching CI passes before merge. This feature does not
claim production security approval.

## Implementation evidence

- Read-only local preflight: 7 organizations containing 7 farms each have exactly
  one active `organization_owner`; zero ambiguous organizations.
- Migration `0004`, ORM, and repository owner predicates: implemented. A
  disposable PostGIS cycle proved single-owner backfill across multiple farms,
  transactional abort for zero/multiple owners, downgrade to `0003`, and upgrade
  back to head.
- PostgreSQL integration validation: PASS, 45/45. It covers same-organization
  non-owner generic 404s, creator access after role downgrade, organization-owner
  override, disabled-membership farm/field/satellite generic-404 assertions, and
  zero limiter/provider work.
- Python unit plus API/migration contract validation: PASS, 105/105. Python lint
  for every owned source/test path and `git diff --check`: PASS.
- Web TypeScript and production build: PASS. Full serialized Chromium regression:
  PASS, 76/76.
- Correction submission 1 closes `FARM-WEB-CACHE-001` and
  `FARM-PRIVACY-DISABLED-001`: successful login/register synchronously removes
  every current tenant query root before navigation; a same-QueryClient A -> B browser
  regression proves no A farm/field/satellite bytes reappear; disabled membership
  integration proves list omission, generic farm/field/satellite 404 responses,
  and zero limiter/provider/persistence work.
- LOCAL_NATIVE correction re-review: APPROVED. No formal security or production
  decision was performed.

## Risks

- Ambiguous legacy ownership must stop rather than assign an arbitrary member.
- A database migration downgrade removes ownership metadata and restores the old
  organization-wide visibility model; prefer a forward correction after rollout.
