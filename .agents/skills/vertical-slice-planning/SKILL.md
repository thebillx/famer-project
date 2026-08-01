---
name: vertical-slice-planning
description: Plan AgriScope work as contract-first vertical slices with ownership, acceptance criteria, test requirements, security requirements, and gated status transitions.
---

# vertical-slice-planning

## Purpose

Convert product requirements into executable vertical-slice task briefs without starting implementation.

## When to use

- A new product requirement arrives.
- A large requirement must be split into smaller deliverable slices.
- Contracts, ownership, dependencies, or review gates are unclear.

## When not to use

- The task is already a validated implementation fix with an accepted task brief.
- The user explicitly asks only for QA review.
- Bootstrap is not complete.

## Required inputs

- Product requirement or change request.
- Current repository state.
- Existing task briefs, contracts, ADRs, and handoff reports if present.

## Preconditions

- Read `AGENTS.md`.
- Inspect repository state before planning.
- Confirm no active file ownership conflict.

## Procedure

1. Read the requirement.
2. Identify the business outcome.
3. Split into usable vertical slices.
4. Define scope.
5. Define out of scope.
6. Identify actors.
7. Describe user flow.
8. Define required API contracts.
9. Define required data contracts.
10. Assign file ownership.
11. Identify dependencies.
12. Define security requirements.
13. Define test requirements.
14. Write acceptance criteria.
15. Write Definition of Done.
16. Define agent sequence.
17. Create a task brief using `.agents/templates/task-brief.md`.
18. Stop implementation until contracts are ready.

## Expected outputs

- Task brief.
- Agent routing plan.
- File ownership plan.
- Contract checklist.
- Test and security checklist.

## Validation

- Every slice has a user-visible or system-verifiable outcome.
- Every implementation owner has non-overlapping file ownership.
- Required contracts are explicit before implementation.
- Acceptance criteria are testable.
- Status follows the allowed sequence.

## Failure handling

- If requirements are ambiguous, create assumptions and open questions.
- If ownership conflicts, mark `BLOCKED` and return to the orchestrator.
- If contract details are missing, keep status `PLANNED`.

## Security considerations

- Include organization scope for tenant-owned work.
- Include secret-handling requirements.
- Include authorization and input-validation requirements.
- Include geospatial and satellite-data limitations where relevant.

## Handoff requirements

The task brief must name next agent, active status, owned files, contracts, tests, risks, and acceptance criteria.

## Prohibited actions

- Do not implement feature code.
- Do not skip contract readiness.
- Do not jump from `IMPLEMENTED` to `DONE`.
- Do not assign the same active file to multiple agents.

## References

- `AGENTS.md`
- `.agents/workflows/feature-development.md`
- `.agents/workflows/contract-first.md`
- `.agents/templates/task-brief.md`

## Standard statuses

- `PLANNED`
- `CONTRACT_READY`
- `IN_PROGRESS`
- `IMPLEMENTED`
- `IN_REVIEW`
- `CHANGES_REQUIRED`
- `VERIFIED`
- `DONE`
- `BLOCKED`
