# AgriScope Agent Rules

## Source of truth

- Product requirements: `docs/product/`
- Architecture decisions: `docs/decisions/`
- API contracts: `docs/api/`
- Database migrations: `apps/api/migrations/` or the path set by an accepted ADR
- Remote-sensing formulas: `packages/geospatial/`
- Agent definitions: `.agents/agents/`
- Skills: `.agents/skills/`
- Workflows: `.agents/workflows/`

## Repository state at bootstrap

- The repository had no tracked files and no visible working-tree files before this agent bootstrap.
- No pre-existing `AGENTS.md`, `.agents/`, Codex, OpenCode, or agent instruction files were found.
- Git branch state was `master...origin/master [ahead 9, behind 4]`.
- This bootstrap adds governance files only. It does not create application source code.

## Core rules

- Work as vertical slices.
- Use one orchestrator.
- Define contracts before implementation.
- Assign file ownership before editing.
- Do not edit files owned by another active task.
- Use minimal, focused changes.
- Do not redesign stable behavior without a reproducible defect.
- Do not expose secrets.
- Do not hardcode organization IDs.
- Every tenant-owned query must enforce organization scope.
- Do not diagnose crop disease from satellite data.
- Do not generate alerts from insufficient-quality data.
- Do not process the same acquisition repeatedly without an idempotency check.
- Every geospatial formula requires numerical tests.
- Every feature requires loading, empty, error, and permission states.
- Mock implementation is not production completion.
- Automated tests are required before `DONE`.
- Architecture changes require an ADR.
- Never silently change an API contract.
- Do not start product implementation from bootstrap-only prompts.
- Do not install product dependencies during agent-system bootstrap.

## Contract rules

- API contracts must define endpoint, method, request schema, response schema, error schema, permission, organization scope, validation, idempotency, UI states, and test fixtures.
- Frontend and backend implementation must not start until the orchestrator marks the task `CONTRACT_READY`.
- Any contract change during implementation returns the task to contract review.

## Ownership rules

- File ownership is assigned per task brief.
- Default allowed paths in agent definitions are capability boundaries, not active ownership grants.
- Only the orchestrator may resolve ownership conflicts.
- Agents must stop before editing a file already owned by another active task.

## Required handoff

Every agent must report:

- Summary
- Scope completed
- Files changed
- Commands executed
- Tests passed
- Tests failed
- Assumptions
- Risks
- Remaining work
- Recommended next agent
