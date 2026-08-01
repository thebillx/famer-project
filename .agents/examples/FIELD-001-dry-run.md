# FIELD-001 Dry Run

## Task

`FIELD-001`: ผู้ใช้วาด Polygon ของแปลงและบันทึกขอบเขตได้

## Purpose

Validate that the AgriScope agent system can route a contract-first vertical slice without implementing product code.

## Routing plan

```text
Orchestrator
-> Frontend Product Agent
-> Backend Geospatial Agent
-> Frontend Product Agent integration
-> QA Security Agent
-> Orchestrator verification
```

## Scope draft

- User can draw a field polygon.
- User can submit the polygon to a backend contract.
- Backend validates geometry and returns authoritative area.
- Frontend displays validation and save states.

## Out of scope

- Product implementation.
- Next.js application creation.
- FastAPI application creation.
- Database migration.
- Copernicus integration.
- Production map provider setup.

## Contract-first checkpoints

- Endpoint, method, request schema, response schema, error schema.
- Permission and organization scope.
- GeoJSON validation rules.
- Idempotency behavior for save.
- Loading, empty, error, and permission UI behavior.
- Test fixtures for valid polygon, self-intersection, empty geometry, and cross-tenant access.

## Ownership dry run

- `frontend-product-agent`: proposed `apps/web/**`, `packages/ui/**`, `tests/e2e/**` for assigned UI files only.
- `backend-geospatial-agent`: proposed `apps/api/**`, `packages/geospatial/**`, `tests/unit/**`, `tests/integration/**`, `tests/contract/**` for assigned backend files only.
- `qa-security-agent`: review reports, tests, fixtures, or review tooling only when assigned.
- No ownership collision is required because task brief must assign exact files before editing.

## Review gate dry run

- Implementing agents self-verify first.
- Handoff report is required before review.
- QA/Security Review can return `APPROVED`, `APPROVED_WITH_NOTES`, `CHANGES_REQUIRED`, or `BLOCKED`.
- Orchestrator cannot mark `DONE` from `IMPLEMENTED`; work must pass review and move through `VERIFIED`.

## Result

- Scope can be split.
- Contract-first workflow is usable.
- Ownership can avoid collisions.
- Review gate is defined.
- Agent and skill mapping is sufficient for the next product prompt.
