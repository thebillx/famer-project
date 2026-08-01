# Roadmap

## ARCH-001

Status: `VERIFIED`

- Architecture, data flow, ER model, API seed contract, database schema notes, security model, deployment notes, and limitations.

## FOUNDATION-001

Status: `VERIFIED`

- Secure FastAPI foundation, settings validation, database/migration structure, authentication foundation, RBAC, tenant isolation, and review workflow.

## FIELD-001

Status: `PLANNED`

- Contract-first Farm and Field creation slice.
- Geometry validation and area calculation must remain backend source of truth.
- No Copernicus dependency required.

## FIELD-002

Status: `PLANNED`

- Field listing/detail workflows and tenant-scoped field access.
- Extend contract, repository, and test coverage from FIELD-001.

## FIELD-003

Status: `PLANNED`

- Crop season association and field monitoring readiness workflow.
- Preserve tenant scope, RBAC, and migration review gates.

## Provider Mock

Status: `PLANNED`

- Local development and automated test provider for satellite observations.
- Must clearly label demo data as simulated.

## Copernicus

Status: `PLANNED`

- Server-side Copernicus Data Space integration only.
- OAuth, catalog, statistical, process, caching, quota, and safe attribution requirements must be contract-reviewed first.

## Dashboard

Status: `PLANNED`

- Product UX after backend contracts support the required data.
- Must include loading, empty, error, stale, permission, quota, and provider-unavailable states.

## Alert

Status: `PLANNED`

- Explainable anomaly detection and alert lifecycle.
- Must not diagnose disease, pests, fertilizer deficiency, or prescribe chemicals.

## Production

Status: `PLANNED`

- CI hardening, dependency scanning, migration execution, observability, backup/restore, deployment guide validation, and external security review.
