# Task Brief

## Task ID

REAL-STACK-001

## Status

IN_REVIEW

## Title

Prove the first real local AgriScope user journey

## Business goal

Run the existing web application and FastAPI service against PostgreSQL/PostGIS,
then prove that a user can register, create a farm, draw and persist a field, and
request the latest satellite metadata without relying on browser/API mocks.

## User

A Thai farmer or farm owner evaluating AgriScope locally before deployment.

## Current behavior

- The API, database migrations, browser UI, PostgreSQL-backed integration tests,
  end-to-end field journey, and opt-in live CDSE STAC metadata smoke already exist.
- Historical evidence reports successful migration, field E2E, and live STAC runs,
  but it is not current evidence for the merged `main` branch.
- The current machine has Docker CLI/Compose but no reachable Docker daemon, no
  repository `.venv`, Python 3.13 on `PATH` instead of the required Python 3.12,
  and no project `.env`. JavaScript dependencies are present but ignored by Git.

## Validation outcome

- Runtime restoration, isolated PostGIS migrations, API liveness/readiness, and the
  three focused PostgreSQL integration cases pass on the current branch.
- The first browser run reproduced a stale UI-V1 test selector: the test queried
  old English authentication labels while the current Thai-first page exposes Thai
  accessible labels. The owner authorized the exact one-file test correction.
- The corrected real browser→API→PostgreSQL/PostGIS journey passes, including
  registration, farm creation, field drawing/persistence, deterministic latest
  satellite metadata search, and persistence after reload.
- The separate one-request anonymous live CDSE STAC smoke passes with an available
  `sentinel-2-l2a` metadata item; no raster or credential was requested.
- The original persistent development database was restored after validation with
  all seven recorded application-table row counts unchanged.

## Expected behavior

1. A disposable Python 3.12 environment installs only the exact project and dev
   dependencies already pinned in `pyproject.toml`.
2. Only the existing PostgreSQL/PostGIS service is started for the focused path.
3. Existing migrations reach head and the API health endpoint responds.
4. The browser journey registers a fresh user, creates a farm, draws a valid field,
   persists it through the real API/database, requests latest satellite metadata,
   reloads, and observes the persisted state.
5. The existing local STAC mock may prove deterministic browser behavior. A
   separate opt-in smoke performs one anonymous request to the real CDSE STAC
   metadata endpoint; it downloads no raster and uses no provider credentials.

## Scope

- Restore ignored/rebuildable runtime dependencies using the repository's pinned
  manifests and the known Codex Python 3.12 interpreter.
- Start only `docker-compose.yml` PostgreSQL for focused validation.
- Apply existing Alembic migrations.
- Run existing health, focused integration, and `field-001.spec.ts` checks.
- Run the existing `apps/api/scripts/cdse_stac_smoke.py` once only after owner
  authority for external network access is confirmed.
- Record compact command/result evidence in the latest owner handoff; raw logs stay
  in tool/CI storage and are not committed.

## Out of scope

- Product-source, API-contract, migration, or test behavior changes.
- Redis, MinIO, workers, raster download, Process/Statistical APIs, OAuth secrets,
  alerting, reports, deployment, monitoring, or production hardening.
- A new launcher, wrapper, receipt system, duplicated runbook, or evidence bundle.
- Treating the deterministic local STAC mock as proof of live CDSE availability.
- Fixing a discovered defect without first returning it to its owning task.

## Dependencies

- Merged `main` at or after PR #3 (`7fcef1f9d487dac05758b7f03cb340615c271692`).
- Existing contracts in `docs/api/openapi.yaml` and schema in
  `docs/api/database-schema.md` remain unchanged.
- Existing deployment commands in `docs/deployment.md` remain the canonical runbook.
- Docker Desktop/daemon must be available before container mutation.
- Python runtime must be 3.12.x; Python 3.13 is rejected for this slice.

## Contracts

- Registration creates a user, first organization, and owner membership; browser
  authentication uses the existing CSRF and HttpOnly cookie contract.
- Farm and field writes require the existing active organization membership and
  `field_manager` role; every read/write remains organization scoped.
- Field geometry remains EPSG:4326 and backend validation/persisted area remain the
  source of truth.
- Satellite lookup verifies field access before the provider call and reuses the
  existing idempotent field/provider/item acquisition record.
- `available`, `no_data`, `temporarily_unavailable`, and `not_searched` remain the
  only existing satellite result semantics; no disease diagnosis is introduced.

## Agent owners

- Orchestrator: `/root`.
- Runtime execution and compact evidence: implementation owner after the Human Gate.
- Final local code/evidence review: Ponytail `code_review` only if repository bytes
  change; otherwise the owner receives a validation handoff without a synthetic
  code review.

## File ownership

- Writable repository paths:
  - `.agents/tasks/REAL-STACK-001-task-brief.md`
  - `tests/e2e/field-001.spec.ts` only for the stale English-to-Thai accessible-label
    correction authorized by the owner.
- Rebuildable ignored runtime paths: `.venv/`, `node_modules/`, `.next/`, and test
  output created by existing tools.
- Runtime state: the existing Compose PostgreSQL container/volume and test rows.
- All product source, contracts, migrations, and other tests are read-only. Any
  additional required edit stops this task and returns the defect to its owner.

## Security requirements

- Use development-only credentials already declared by `docker-compose.yml`; never
  print or commit secrets, cookies, tokens, or complete environment contents.
- Do not create `.env` unless a reproducible defect proves it is required; pass the
  smallest non-secret development settings to each process.
- Live CDSE smoke is metadata-only, one request, anonymous, and separately reported.
- No browser-to-provider request and no provider secret enters frontend code.
- Database cleanup may target only the disposable local development database used
  by the existing focused tests; no external/shared database is permitted.

## Test requirements

- Python runtime/version and dependency import preflight.
- `docker compose config` and PostgreSQL health.
- `.venv/bin/alembic -c apps/api/alembic.ini upgrade head`.
- API `GET /health/live` and `GET /health/ready`.
- Focused PostgreSQL-backed integration path from
  `tests/integration/test_foundation_api.py` required by the real journey.
- `npx playwright test -c apps/web/playwright.config.ts field-001.spec.ts --workers=1`.
- Optional live proof: `.venv/bin/python apps/api/scripts/cdse_stac_smoke.py`.
- `git status --short` and `git diff --check` prove no unintended repository drift.

## Acceptance criteria

- Current merged code completes the real browser→API→PostgreSQL/PostGIS journey.
- The field and latest satellite acquisition remain visible after browser reload.
- Deterministic local provider behavior and live CDSE metadata behavior are reported
  separately and truthfully as PASS, FAIL, or NOT_RUN.
- No product file is changed, no secret is stored, and no new harness artifact is
  added.
- Any failure identifies the smallest reproducible owner/file boundary and stops.

## Definition of done

- Focused local stack checks pass against the current branch.
- Live CDSE metadata smoke passes, or is explicitly `NOT_RUN`/`BLOCKED` with reason;
  it is not required to claim the local product journey works.
- The owner receives a compact handoff with commands, results, risks, and the next
  product slice. This task does not claim production readiness.

## Risks

- Docker Desktop may require an owner-visible start action.
- Package installation and the live CDSE request are stateful/external actions and
  remain Human Gates before execution.
- Map tiles are external and can make browser rendering flaky even when the API and
  persistence path are correct.
- Existing integration cleanup is destructive inside its fixed development DB;
  database identity must be confirmed before it runs.
