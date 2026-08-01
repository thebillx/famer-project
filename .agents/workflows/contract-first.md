# Contract-First Workflow

## Required before implementation

Frontend and backend implementation must agree on:

- Endpoint
- HTTP method
- Request schema
- Response schema
- Error schema
- Permission
- Organization scope
- Validation
- Idempotency
- Loading behavior
- Empty behavior
- Error behavior
- Test fixture

## Process

1. Orchestrator creates task brief.
2. Backend owner drafts API and data contract where backend behavior is involved.
3. Frontend owner reviews UI states and integration needs.
4. QA/Security owner reviews testability, tenant scope, and abuse cases when risk is high.
5. Orchestrator marks `CONTRACT_READY` only when the contract is explicit and testable.

## Contract change rule

Any implementation-time contract change must be recorded in the task brief or contract document and reviewed before dependent code proceeds.
