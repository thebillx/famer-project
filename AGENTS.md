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

## Continuous lifecycle boundary

Follow `.agents/workflows/delivery.md`:

`prompt -> scope gate -> justified exploration/planning -> implementation -> focused validation -> Ponytail LOCAL_NATIVE review -> bounded correction when needed -> feature PR/CI/merge -> next contract-ready slice`

- Ponytail/`code_review` performs code review only. It never performs or substitutes
  for security review.
- `REVIEW_DECISION: CHANGES_REQUIRED` may trigger a bounded correction only when
  the finding stays inside the approved contract and ownership. Revalidate and
  request Ponytail delta review; stop after two correction submissions for one
  stable root cause or on any scope/contract/authority expansion.
- `REVIEW_DECISION: APPROVED` grants standing feature-delivery authority: stage
  only the reviewed boundary, commit, push a feature branch, open a PR, wait for
  matching CI, and merge only when CI passes. A post-review byte change requires
  focused validation and another Ponytail review before delivery.
- After a successful non-production merge, the orchestrator may continue with the
  next already-supported vertical slice. A new product decision, API/ADR change,
  ownership conflict, destructive operation, dependency installation, credential,
  production data, deployment, or unclear requirement remains a Human Gate.
- Formal security review is not a per-feature merge gate. It is required for the
  immutable production release candidate, or earlier only when the owner asks.
- Production deployment always remains owner-controlled and requires green CI plus
  an approved release security review.

## Context and handoff

Use `.agents/templates/handoff-report.md`. Keep one latest compact task capsule.
Durable facts belong in their canonical task, contract, ADR, migration, code, or
test—not copied into handoff. Raw logs stay in tool/CI storage; large artifacts stay
outside the repository and are referenced by immutable path or URL plus digest.

Agents receive only the active task, exact boundary, relevant evidence paths,
prohibited actions, required output, and stop conditions. Do not forward raw
conversation history or unrelated repository context.
