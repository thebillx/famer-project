# Automated lifecycle

## Sequence

```text
Prompt
-> Lifecycle Orchestrator
-> Context / Scope / Ownership Gate
-> Exploration (only when justified)
-> Planning / Architecture (only when justified)
-> Implementation or Fast Coding / Tests
-> Focused Validation
-> Ponytail LOCAL_NATIVE Code Review
-> Owner Handoff
-> STOP
```

## Context / scope / ownership gate

Before delegation or implementation establish:

- mission objective and confirmed facts;
- exact allowed and excluded files;
- existing owner work and sensitive-data boundary;
- expected behavior and validation contract;
- stop conditions.

Modified and untracked files are owner work unless explicitly included. Do not
invent requirements, test data, credentials, endpoints, identifiers, results, or
implementation details unsupported by evidence.

## Routing

The orchestrator selects one smallest justified route:

| Route | Profile | Access | Use |
| --- | --- | --- | --- |
| Exploration/Test Support | `exploration_test_support` — Terra/low | read-only | mapping, callers, evidence, test/failure boundaries |
| Planning/Architecture | `planning_architecture` — Sol/xhigh | read-only | cross-component contracts, ownership, architecture decisions |
| Implementation | `implementation` — Luna/xhigh | workspace-write | bounded multi-file behavior or integration changes |
| Fast Coding/Tests | `fast_coding_tests` — Spark/high | workspace-write | small mechanical corrections, focused tests/fixtures |
| LOCAL_NATIVE Code Review | `code_review` with Ponytail | read-only | exact final diff after focused validation |

Exploration must not present speculation as fact. Planning does not modify files.
Fast coding does not make architecture decisions. All writers stay inside approved
ownership.

## Agent task packet

Send only:

- objective and confirmed facts;
- allowed files and prohibited actions;
- relevant evidence paths;
- required output and stop conditions.

Use `fork_turns="none"` when supported. Do not forward full conversation history,
raw logs, duplicated investigation, secrets, PII, or speculative conclusions.

Every agent returns a compact receipt: identity, task completed, files inspected,
files changed, evidence established, findings/decision, unresolved boundary, and
one recommended next action. The orchestrator validates it before reuse.

## Focused validation

Run only checks that prove affected behavior. Report command, PASS/FAIL/NOT_RUN,
one-line result, and tool/log reference. A new proven failure boundary or Human Gate
stops unsupported expansion.

## Ponytail LOCAL_NATIVE

Ponytail/`code_review` reviews the exact final diff for correctness, regression,
maintainability, requirement coverage, and validation. It may flag an apparent
security risk as a code-review blocker, but it never performs, approves, or
substitutes for security review.

Valid terminal receipts are exactly:

- `REVIEW_DECISION: APPROVED`
- `REVIEW_DECISION: CHANGES_REQUIRED`

Timeout, partial analysis, launch confirmation, or missing terminal receipt is not
approval.

If `CHANGES_REQUIRED`, do not edit the reviewed diff. Preserve the working tree,
return findings to the owner, set final status `CHANGES_REQUIRED`, and stop.

## Context transfer and storage

The next agent reads only `AGENTS.md`, the active task brief, the exact contribution
boundary, and the latest handoff unless a blocker requires more. Durable facts are
updated in canonical requirements/contracts/ADRs/migrations/code/tests. The latest
handoff is transport context and supersedes prior handoffs; do not append or commit
handoff files unless the owner asks.

Raw logs stay in tool/CI storage. Large artifacts stay outside the repository and
are referenced by immutable URL/path, SHA-256, purpose, and retention. Never paste
raw logs or bundles into prompts or reports.

## Progress updates

Update the owner only when scope is established, a failure boundary is proven, the
phase changes, a Human Gate appears, implementation/validation/review completes, or
the mission pauses/finishes. State current phase, completed result, blocker, changed
files if any, and next action. Do not stream raw tool output or unchanged status.

## Pause checkpoint

If the owner or system requests a pause before terminal owner handoff, finish the
active bounded action and return objective, phase, completed work, last command,
exact checked/changed files, validation, review status, unresolved boundary, Git
state, exact resume action, and `CHECKPOINT_STATUS: PAUSED`. For that requested
pause, do not start another phase or create a repository handoff file.

## Owner handoff and authority

After LOCAL_NATIVE review, preserve the working tree and return the capsule from
`.agents/templates/handoff-report.md`, then stop.

The orchestrator may scope, inspect, delegate bounded exploration/planning/work,
run focused validation, request LOCAL_NATIVE review, and prepare handoff. It must
not automatically fix review findings, continue after review, stage, commit, push,
manage PR/CI, deploy, merge, or make delivery/security decisions.

The owner exclusively decides corrections, additional validation, security review,
contribution/staging/commit strategy, push/PR/CI, deployment, and merge timing.
