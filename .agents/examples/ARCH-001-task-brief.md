# Task Brief

## Task ID

ARCH-001

## Title

AgriScope Thailand architecture, contracts, and first geospatial foundation slice

## Business goal

Create a production-grade foundation that lets the team build AgriScope as a SaaS without unsafe satellite claims, tenant leaks, or implementation before contracts.

## User

Product, engineering, QA, and security team members building the first release.

## Current behavior

The repository contains agent governance but no product architecture, contracts, schema, or implementation code.

## Expected behavior

The repository contains Phase 1 architecture artifacts plus a tested core geospatial formula/quality package that future API and worker code can call.

## Scope

- Architecture, data flow, ER diagram, security model, API integration strategy, limitations, deployment baseline.
- OpenAPI contract seed.
- Core schema SQL seed.
- Runtime configuration contracts.
- Remote-sensing index formulas.
- Quality confidence policy.
- Safe Thai wording policy.
- Unit tests for formulas, quality, and language policy.

## Out of scope

- Live Copernicus API calls.
- Next.js app creation.
- Full FastAPI route implementation.
- Real authentication flow.
- PostGIS integration test execution.
- Frontend UI screens.

## Dependencies

- Python 3 standard library for current unit tests.
- Future phases require locked dependencies from `pyproject.toml` and `package.json`.

## Contracts

- `docs/api/openapi.yaml`
- `docs/api/database-schema.md`
- `apps/api/migrations/versions/0001_core_schema.sql`
- `packages/shared-types/schemas/observation-quality.schema.json`

## Agent owners

- Orchestrator: planning and status.
- Backend Geospatial Agent: schema, geospatial formulas, quality policy.
- Frontend Product Agent: brand/config contracts and future UI state alignment.
- QA Security Agent: review gate.

## File ownership

- Backend Geospatial Agent: `packages/geospatial/**`, `apps/api/**`, `tests/unit/**`.
- Frontend Product Agent: `packages/config/**`, `packages/shared-types/**`.
- Orchestrator: `docs/**`, `.agents/examples/ARCH-001-task-brief.md`.

## Security requirements

- No secrets in source.
- No provider credentials in frontend.
- Organization scope documented for tenant-owned data.
- Safe satellite language enforced by tests.

## Test requirements

- Unit tests for formulas and quality policy.
- Language policy tests.
- No live provider calls.

## Acceptance criteria

- Architecture, folder structure, database schema, API contract, phases, risks, and limitations exist in docs.
- Index formulas use epsilon-protected division.
- Quality gate enforces 40% and 70% defaults.
- Safe wording policy rejects prohibited diagnosis phrases.
- Unit tests pass.

## Definition of done

- ARCH-001 is `IMPLEMENTED`.
- QA/Security review is still required before `VERIFIED` or `DONE`.

## Risks

- Dependency installation has not been executed.
- OpenAPI contract is a seed and must expand as vertical slices start.
- SQL migration has not been run against PostGIS yet.
