# Task Brief

## Task ID

FOUNDATION-001

## Title

Production-oriented FastAPI, settings, database, authentication, RBAC, and tenant-isolation foundation

## Business goal

Build a secure and testable backend foundation that later Farm, Field, satellite-provider, worker, and frontend slices can depend on.

## User

Backend, security, QA, and future frontend/product implementation agents.

## Current behavior

The repository has ARCH-001 architecture artifacts, a SQL seed, a minimal FastAPI entrypoint, and geospatial unit tests. There is no executable backend foundation for settings validation, auth, RBAC, tenant scope, async database wiring, or Alembic migration control.

## Expected behavior

The repository has a contract-first backend foundation with typed settings, API router structure, standard errors, request IDs, structured logging, async SQLAlchemy wiring, Alembic migration, core User/Organization/Membership models, authentication/session design, RBAC policies, tenant-scoped repository pattern, health endpoints, tests, and QA/security review evidence.

## Scope

- Typed application settings.
- Environment validation.
- FastAPI application factory.
- API router structure.
- Versioned API prefix.
- Standard error response.
- Correlation/request ID middleware.
- Structured logging foundation.
- SQLAlchemy 2.x async database setup.
- Alembic initialization and executable initial migration.
- Core ORM models needed for authentication and tenancy.
- Password hashing.
- Authentication token/session foundation.
- Organization membership and RBAC.
- Organization-scope dependency.
- Tenant-safe repository/query pattern.
- Health and dependency checks.
- Contract tests.
- Unit tests.
- Integration-test setup where locally possible.
- Security review.

## Out of scope

- Next.js frontend.
- Farm and Field CRUD.
- Geometry editing.
- Copernicus live calls.
- Sentinel processing.
- Worker implementation.
- Scheduler implementation.
- Alerts.
- Reports.
- Email delivery.
- Social login.
- Billing.
- Kubernetes.
- Production deployment.
- Demo satellite data.

## Dependencies

- Locked Python dependencies in `pyproject.toml`.
- PostgreSQL/PostGIS, Redis, and MinIO services from `docker-compose.yml` for future integration validation.
- Current execution environment does not have FastAPI/Pydantic/SQLAlchemy/Alembic installed at task start.

## Contracts

- `docs/api/openapi.yaml`
- `packages/shared-types/schemas/error-response.schema.json`
- `packages/shared-types/schemas/auth.schema.json`
- `packages/shared-types/schemas/organization.schema.json`
- `apps/api/migrations/versions/20260801_0001_foundation.py`

## Agent owners

- Orchestrator: task brief, status, review routing.
- Backend Geospatial Agent: backend implementation, settings, database, auth, RBAC, migrations, tests.
- QA Security Agent: ARCH-001 review and FOUNDATION-001 review.

## File ownership

- Orchestrator: `.agents/tasks/FOUNDATION-001-task-brief.md`, `.agents/reviews/ARCH-001-review.md`.
- Backend Geospatial Agent: `apps/api/**`, `packages/shared-types/**`, `tests/unit/**`, `tests/contract/**`, `tests/integration/**`, `docs/api/**`, `.env.example`, `README.md`, `docs/security.md`, `docs/deployment.md`, `docs/architecture.md`, `docs/api/database-schema.md`.
- QA Security Agent: `.agents/reviews/FOUNDATION-001-review.md`.

## Security requirements

- No real secrets committed.
- Production rejects missing or known development secrets.
- Sensitive values use safe secret wrappers where dependency support is available.
- Passwords are hashed with Argon2id when runtime dependencies are installed.
- Generic login failure messages.
- Token type and expiration validation.
- Refresh-session revocation design.
- HttpOnly cookie defaults for browser-facing sessions.
- Tenant-owned queries enforce organization scope.
- Disabled memberships cannot authorize.
- Foreign organization existence is not disclosed.

## Test requirements

- Existing geospatial unit tests continue to pass.
- Settings validation tests.
- Security/password/token/session tests.
- Auth API contract tests.
- Tenant-isolation policy tests.
- Migration contract tests.
- OpenAPI contract tests.
- Health contract tests.
- Integration tests where local dependencies are available; otherwise report `NOT_RUN`.

## Acceptance criteria

- API contract defines health, auth, organization, and member endpoints with standard error response and security requirements.
- Application factory wires middleware and routers without module-level database connections.
- Settings validation rejects unsafe production configuration.
- Auth foundation supports registration/login/logout/refresh/me contracts.
- RBAC and tenant-scope policies are reusable and tested.
- Alembic revision has upgrade and downgrade.
- Unit and contract tests pass in the local environment.
- No Copernicus call is made.
- No frontend is created.

## Definition of done

FOUNDATION-001 may reach `VERIFIED` after internal QA/Security review is `APPROVED` or `APPROVED_WITH_NOTES`, required local validations are run honestly, and the feature branch is pushed for external GitHub review. It must not be marked `DONE` or merged in this task.

## Risks

- Runtime dependencies are not installed in the current environment, so dependency-backed API execution, Alembic CLI, ruff, mypy, and pytest may be `NOT_RUN`.
- Docker may be unavailable locally; PostgreSQL/PostGIS integration may be `NOT_RUN`.
- Full production readiness still requires external review, dependency installation, integration execution, and later slices.

## Status

VERIFIED
