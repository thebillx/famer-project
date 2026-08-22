# PROJECT-CLEANUP-001

Status: `IN_REVIEW`

## Goal

Reduce local disk use and agent-token overhead without changing product behavior.
Replace the duplicated engineering loop with one owner-controlled lifecycle that
ends after Ponytail local native code review and a compact owner handoff.

## Scope

- Remove ignored dependency, build, cache, and test-output directories after
  literal-path, ignore-status, and non-symlink checks.
- Consolidate agent governance into `AGENTS.md`, one orchestrator definition, one
  delivery workflow, one handoff template, and one review template.
- Move permanent historical reviews to `docs/reviews/archive/` and summarize
  completed/abandoned task history in `docs/engineering/task-history.md`.
- Archive unrecoverable untracked governance drafts outside the repository before
  removing them.
- End automation after local native review and return all correction, validation,
  security, staging, delivery, and merge decisions to the owner.

## Out of scope

- Product source, product tests, API contracts, migrations, lockfiles, CI logic,
  and secrets. Active feature briefs remain unchanged except for review-timing text
  needed to adopt ADR-0006.
- External sealed validation evidence.
- Installing Ponytail, Headroom, or model-routing software.
- Pushing, merging, or running security review in this task.

## Ownership

The orchestrator exclusively owns the governance paths listed in this brief for
the duration of cleanup. Existing product-task ownership remains unchanged.

Owned paths:

- `AGENTS.md`
- `README.md`
- `.agents/README.md`
- `.agents/agents/**`
- `.agents/examples/**`
- `.agents/registry.yaml`
- `.agents/workflows/**`
- `.agents/templates/**`
- `.agents/skills/**` (governance text and workflow references only)
- `.agents/reviews/**`
- `.codex/agents/**`
- completed or abandoned task briefs named in the cleanup audit
- `docs/decisions/ADR-0002*` through `ADR-0005*`
- `docs/decisions/ADR-0006-owner-controlled-lifecycle.md`
- `docs/engineering/task-history.md`
- `docs/reviews/**`
- `.github/PULL_REQUEST_TEMPLATE.md`
- review-timing lines only in active task briefs
- ignored/generated paths listed in the Ponytail cleanup audit

## Safety rules

- Never delete product source, tests, migrations, active task briefs, secrets, or
  sealed evidence.
- Validate every generated deletion target as an exact in-repository, non-symlink,
  ignored path before removal.
- Copy every untracked governance file selected for deletion to an external
  read-only archive and record its SHA-256 first.
- Ponytail is code review only. Security review is never automatic and occurs only
  when the owner requests it outside this lifecycle.

## Validation

- Generated targets are absent and product paths remain present.
- Governance references resolve to the consolidated files.
- `git diff --check` passes.
- Ponytail performs a final read-only native review.
- No product, package, network, database, Docker, push, or security-review command
  runs as part of this cleanup.

## Done

The repository is smaller, active work is preserved, governance has one source of
truth, and the documented delivery path is:

`prompt -> orchestrate -> implement/test -> Ponytail LOCAL_NATIVE -> owner handoff -> STOP`.
