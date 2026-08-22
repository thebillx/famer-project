# AgriScope Agent Rules

## Sources of truth

- Product requirements: `docs/product/`
- Architecture decisions: `docs/decisions/`
- API contracts: `docs/api/`
- Database migrations: `apps/api/migrations/`
- Remote-sensing formulas: `packages/geospatial/`
- Runtime roles: `.codex/agents/`
- Skills: `.agents/skills/`
- Lifecycle: `.agents/workflows/delivery.md`

## Working rules

- Use one lifecycle orchestrator and deliver bounded vertical slices.
- Establish objective, facts, scope, ownership, sensitive-data boundary,
  expected behavior, validation, and stop conditions before delegation or edits.
- Treat modified and untracked files as owner work unless explicitly included.
- Do not edit files owned by another active task.
- Prefer the smallest change that provides testable value.
- Do not invent requirements, credentials, endpoints, identifiers, fixtures, or
  expected results.
- Architecture changes require an ADR; API changes must be explicit.
- Do not expose secrets or install dependencies without explicit scope.

## Product safety

- Never hardcode organization IDs; tenant-owned queries enforce organization scope.
- Geometry validation and projected area remain server-authoritative.
- Repeated acquisitions require idempotency.
- Geospatial formulas require numerical tests.
- Insufficient-quality observations do not create alerts.
- Satellite data must not diagnose disease, pests, nutrient deficiency, flooding,
  or prescribe chemicals.
- UI features cover loading, empty, error, and permission states.
- Mock behavior is not production completion.

## Automated lifecycle boundary

Follow `.agents/workflows/delivery.md`:

`prompt -> scope gate -> justified exploration/planning -> implementation -> focused validation -> Ponytail LOCAL_NATIVE review -> owner handoff -> STOP`

- Ponytail/`code_review` performs code review only. It never performs or substitutes
  for security review.
- `REVIEW_DECISION: CHANGES_REQUIRED` is terminal for the automated lifecycle. Do
  not edit the reviewed diff or start a correction automatically.
- After LOCAL_NATIVE review, preserve the working tree and return control to the
  owner.
- The orchestrator must not stage, commit, push, manage CI or pull requests,
  deploy, merge, or make delivery/security decisions for the owner.
- Security review, further validation, correction, staging, commit, push, CI,
  deployment, and merge occur only after a new owner decision.

## Context and handoff

Use `.agents/templates/handoff-report.md`. Keep one latest compact task capsule.
Durable facts belong in their canonical task, contract, ADR, migration, code, or
test—not copied into handoff. Raw logs stay in tool/CI storage; large artifacts stay
outside the repository and are referenced by immutable path or URL plus digest.

Agents receive only the active task, exact boundary, relevant evidence paths,
prohibited actions, required output, and stop conditions. Do not forward raw
conversation history or unrelated repository context.
