# Task Brief

## Task ID

WEB-SEC-CONTRACT-001

## Status

VERIFIED

## Title

Close browser-security validation on an isolated PostgreSQL target

## User outcome

Cookie-authenticated browser flows enforce CSRF, bounded session recovery, typed
safe errors, tenant authorization, rate limits, and truthful Sentinel metadata;
the complete API integration suite proves those contracts against disposable
PostgreSQL/PostGIS rather than the development database.

## Implemented foundation

- PR #2 delivered the WEB-SEC runtime, OpenAPI, unit, contract, browser client, and
  focused browser tests.
- PR #3 fixed mixed-budget concurrent refresh recovery.
- PR #6 completed the safe satellite consumer states and tenant-cache transition.
- Current runtime supports access/refresh cookies, bearer alternatives,
  double-submit CSRF with exact Origin validation, privacy-safe single-process rate
  limits, typed browser recovery, tenant-safe 404/403 behavior, idempotent satellite
  search, and the `not_searched` response state.
- Unit, contract, and browser tests already cover these contracts. The remaining
  P0 evidence gap is the destructive integration fixture and reproducible CI run.

## Scope

- Replace the hard-coded development database in
  `tests/integration/test_foundation_api.py` with one mandatory runner-supplied
  test-only URL.
- Run migrations and all 45 integration nodes against one disposable PostGIS 16 /
  PostGIS 3.4 database.
- Add a dedicated GitHub Actions integration job using an ephemeral service
  container and the same test-only URL contract.
- Preserve all WEB-SEC runtime, OpenAPI, migrations, dependency pins, and product UI
  behavior.

## Out of scope

- Product source/API/schema/migration/dependency changes.
- Development or production database access.
- Live Copernicus calls, Redis, MinIO, raster processing, alerts, reports, worker
  deployment, distributed rate limiting, or production deployment.
- A custom launcher, wrapper, receipt family, copied repository snapshots, or
  per-test infrastructure generation.
- Formal security review; that occurs only at the immutable production release
  candidate under ADR-0007.

## Ownership

- Orchestrator:
  - `.agents/tasks/WEB-SEC-CONTRACT-001-task-brief.md`
- Implementation:
  - `tests/integration/test_foundation_api.py`
  - `.github/workflows/ci.yml`
- All application, migration, OpenAPI, package, lock, unit, contract, and E2E files
  are read-only.

## Integration isolation contract

- Tests require `AGRISCOPE_TEST_DATABASE_URL`; absence fails before creating the
  app, connecting, or cleaning data.
- The URL must use `postgresql+psycopg`, host `127.0.0.1`, one explicit port, no
  query/fragment, a non-empty password, and `agriscope_test_`-prefixed user and
  database names. The documented development identity is rejected.
- The application receives the exact same URL through `DATABASE_URL`. Direct
  psycopg access is derived from that URL; there is no fallback or second DSN.
- The runner migrates the disposable database to Alembic head before pytest.
- Session startup verifies the expected database/user plus PostgreSQL 16 and
  PostGIS 3.4 before any cleanup or test body.
- Cleanup truncates only `field_acquisitions`, `fields`, `farms`,
  `refresh_sessions`, `memberships`, `organizations`, and `users`, without
  `RESTART IDENTITY`, before each node and in `finally` afterward.
- Local validation uses a no-restart, no-volume, tmpfs-backed container bound only
  to a random `127.0.0.1` port. Teardown removes only its exact labelled container
  and network.
- Tests use existing provider fakes; live provider, external network, repository
  writes, secrets, and development data remain prohibited.

## CI contract

- A separate `integration` job uses the pinned PostGIS image digest and fixed
  non-secret test-only credentials inside the ephemeral GitHub runner.
- CI pins Python 3.12 and pip, installs the repository's exact dependency pins,
  applies migrations, then runs only `tests/integration/test_foundation_api.py`.
- The existing validation job remains responsible for web typecheck/build, unit,
  contract, JSON/YAML, and whitespace checks.
- No skipped integration result is accepted as PASS.

## Validation

- Python unit suite.
- Python contract suite.
- PostgreSQL integration suite: 45 test nodes; full execution requires approved disposable DB fixtures.
- Web typecheck and production build.
- Focused `web-security.spec.ts` browser suite.
- `git diff --check`, TOML/YAML parsing, and scoped scans for fixed development DB
  credentials, raw secrets, token storage, and live provider access.
- Ponytail LOCAL_NATIVE code review on the exact final diff.
- Feature PR with matching green CI; no feature-level security review.

## Acceptance criteria

- Running integration tests without the explicit test URL cannot touch any
  database.
- The development database URL is absent from integration test source.
- Migrations and all 45 integration nodes pass on disposable PostgreSQL/PostGIS.
- CI reproduces the same migration and integration boundary.
- Existing unit, contract, web build, browser-security, tenant, geometry,
  idempotency, logging-redaction, and safe-satellite behavior remain passing.
- Ponytail approves and the exact contribution merges through green CI.

## Implementation evidence

- Missing `AGRISCOPE_TEST_DATABASE_URL` fails before any database connection or
  cleanup: PASS.
- Alembic migrations `0001` through `0004` applied to one tmpfs-backed disposable
  PostGIS container on a random loopback port: PASS.
- Current PostgreSQL integration suite: 45/45 PASS on the disposable database at
  migration `0004`. The complete guard table is 11/11 PASS and blocks
  development/non-loopback/invalid URLs before any DB call in validation.
- Python unit suite: 61/61 PASS; contract suite: 13/13 PASS.
- Focused browser-security Playwright: 16/16 PASS.
- Web typecheck and production build: PASS.
- CI workflow parses with distinct `validation` and `integration` jobs; exact remote
  execution remains the PR gate.
- Local demonstration stack is healthy on Web `localhost:3000`, API
  `127.0.0.1:8000`, and a local STAC mock; this is test evidence, not production.

## Risks and production boundary

- Docker Desktop may emulate the pinned amd64 image locally on Apple Silicon; CI
  remains native amd64. Database semantics and version checks are identical.
- The current in-process limiter supports only single-process deployment.
- Passing this task closes WEB-SEC implementation evidence; it does not provide
  production containers, TLS/secrets, backup/restore, observability, deployment, or
  production security approval.
