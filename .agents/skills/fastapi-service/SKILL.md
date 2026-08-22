---
name: fastapi-service
description: Build AgriScope FastAPI services with typed schemas, service and repository layers, dependency injection, auth boundaries, organization scope, idempotency, tests, and secret-safe logging.
---

# fastapi-service

## Purpose

Guide backend API implementation for assigned AgriScope vertical slices.

## When to use

- Creating or changing FastAPI endpoints.
- Defining Pydantic request/response schemas.
- Implementing service and repository behavior.
- Adding API, integration, or contract tests.

## When not to use

- Frontend-only work.
- Pure remote-sensing formula work without API surface.
- Bootstrap-only work where application code is prohibited.

## Required inputs

- Task brief.
- API and data contract.
- Auth and permission requirements.
- Migration requirements if persistence changes.
- File ownership.

## Preconditions

- Contract status is `CONTRACT_READY`.
- Existing route structure, dependency injection, logging, and error patterns have been inspected.
- Organization scope requirements are explicit.

## Procedure

1. Follow existing FastAPI route structure.
2. Define Pydantic request and response schemas.
3. Keep business behavior in a service layer.
4. Keep persistence in repository/data-access layer.
5. Use dependency injection for database sessions, auth context, and services.
6. Return consistent error responses.
7. Accept and propagate correlation IDs.
8. Use structured logging with secret masking.
9. Enforce authentication boundary.
10. Enforce authorization boundary.
11. Enforce organization scope on tenant-owned data.
12. Add idempotency for retryable mutations where required.
13. Add pagination for list endpoints.
14. Include OpenAPI examples when contracts require them.
15. Add unit, integration, and contract tests.
16. Add migrations only when assigned and required.
17. Produce a handoff report.

## Expected outputs

- API implementation matching contract.
- Schemas and examples.
- Tests.
- Handoff report.

## Validation

- Unit, API, integration, and contract tests pass as applicable.
- Unauthorized and cross-tenant cases are tested.
- Error responses match contract.
- Logs do not include secrets or tokens.

## Failure handling

- If contract is incomplete, stop and return to orchestrator.
- If migration impact is unclear, request ADR or migration plan.
- If tests cannot run, record exact command and failure.

## Security considerations

- Mask secrets in logs.
- Never log access or refresh tokens.
- Validate inputs at schema and service boundaries.
- Enforce organization scope in data access.
- Consider rate limits and idempotency for mutation endpoints.

## Handoff requirements

Report routes, schemas, migrations, tests, authorization checks, organization-scope evidence, risks, and next agent.

## Prohibited actions

- Do not install FastAPI dependencies during bootstrap.
- Do not create an application scaffold during bootstrap.
- Do not bypass auth for convenience.
- Do not change API contracts silently.

## References

- `AGENTS.md`
- `.agents/workflows/delivery.md`
- `.agents/templates/handoff-report.md`
- FastAPI, Pydantic, SQLAlchemy, and OWASP ASVS documentation as references.
