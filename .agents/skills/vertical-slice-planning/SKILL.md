---
name: vertical-slice-planning
description: Plan AgriScope work as a contract-first vertical slice with exact ownership, acceptance criteria, tests, and delivery gates.
---

# vertical-slice-planning

## Use this skill when

- A new requirement needs a task brief.
- Scope, ownership, contracts, dependencies, or acceptance criteria are unclear.
- A large request should be split into smaller deliverable slices.

## Procedure

1. Read `AGENTS.md`, relevant requirements, contracts, ADRs, and active task briefs.
2. Inspect the repository and check for ownership conflicts.
3. Define the user-visible or system-verifiable outcome.
4. Define scope and out of scope.
5. Specify API/data behavior, permissions, organization scope, validation,
   idempotency, UI states, and fixtures where relevant.
6. Assign exact, non-overlapping file ownership.
7. Define focused tests, acceptance criteria, risks, and dependencies.
8. Create or update `.agents/templates/task-brief.md`.
9. Keep status `PLANNED` until the contract is complete; then the orchestrator may
   mark it `CONTRACT_READY`.

## Rules

- Do not implement product code while planning.
- Do not invent future infrastructure for a current slice.
- Do not assign one file to multiple active tasks.
- Include tenant, secret, geospatial, and satellite safety constraints when
  relevant.
- Follow `.agents/workflows/delivery.md` after contract readiness.
