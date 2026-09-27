# AGRISCOPE-PRODUCTION-READINESS-001

Status: VALIDATED_PENDING_MERGE

## Objective

Close the first production-readiness correctness and resilience gaps without adding product features or changing satellite thresholds.

## Delivery base

- origin/main: `7f4bb78eb65a256e43cfbcdd8eec989390e2c3b5`
- isolated worktree: `/Users/bill/final-project-production-readiness-001`
- branch: `codex/production-readiness-001`
- preserve dirty primary checkout unchanged

## Scope

### 1. Distinct-time inspection pairing

Farm inspection overview must compare the latest two eligible **distinct acquisition times** per field.

If multiple cached observation analyses share the same `acquired_at`:
- retain one deterministic representative for that timestamp;
- do not compare two observations captured at the same time;
- if only one distinct eligible time remains, return `FIRST_OBSERVATION`.

This must stay consistent with the explicit field comparison contract that requires before < after.

### 2. Per-field incompatible-raster isolation

A cached pair for one field may be spatially incompatible (grid/transform/CRS). That field must become `NOT_ASSESSABLE` without failing the entire farm overview.

Only known comparison-assessability errors are isolated. Unexpected programming/database/auth errors must continue to fail closed and remain observable.

No provider call, recompute, or automatic repair is allowed.

### 3. Readiness HTTP semantics

`GET /health/ready`:
- 200 only when configuration and required database connectivity are ready;
- 503 when settings are invalid or the database check fails/raises;
- response must not expose dependency secrets or exception details.

`/health/live` remains process liveness and must not depend on database availability.

`/health/dependencies` remains masked diagnostics.

## Non-goals

- No provider/CDSE call changes.
- No algorithm/threshold changes.
- No schema migration.
- No new dependency.
- No diagnosis or agronomic recommendation.
- No rate-limit redesign in this slice.
- No deployment or production environment mutation.

## Owned paths

- .agents/tasks/AGRISCOPE-PRODUCTION-READINESS-001-task-brief.md
- apps/api/agriscope_api/repositories/satellite.py
- apps/api/agriscope_api/services/satellite.py
- apps/api/agriscope_api/api/v1/health.py
- apps/api/agriscope_api/db/session.py
- tests/integration/test_foundation_api.py
- tests/contract/test_foundation_contract.py
- docs/api/openapi.yaml

All other paths are read-only.

## Validation

- Contract validates readiness 200/503 semantics and cached-only overview wording.
- Integration proves duplicate timestamps do not become a comparison pair.
- Integration proves one incompatible cached field does not hide valid evidence from other fields.
- Integration proves ready=503 when the database check fails and live remains 200.
- Existing observation/change/overview tests remain green.
- Ruff, Python unit/contract, integration, production web build, browser regression, and git diff --check through repository CI.


## Validation evidence — 2026-09-28

- Implementation commit: `49cdd2af50f8b961b61aa851cf2b002e110bb0eb`.
- Local Python compileall over the modified backend/test boundary: PASS.
- Local contract suite: 25/25 PASS.
- GitHub Actions CI #53 on the implementation commit:
  - validation: PASS
  - integration: PASS
  - browser-regression: PASS
- Integration validation proves:
  - two cached analyses at one acquisition time do not become a comparison pair;
  - one known incompatible cached raster pair becomes per-field `NOT_ASSESSABLE` while valid farm evidence remains available;
  - database readiness failure returns 503 without exposing the underlying exception while liveness remains 200.
- No provider, algorithm, threshold, migration, dependency, diagnosis, rate-limit, or deployment-environment change was introduced.
