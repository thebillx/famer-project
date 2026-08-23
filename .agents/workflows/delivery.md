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
-> Bounded Correction (only when findings stay in contract)
-> Feature Commit / Push / PR / CI / Merge
-> Next Contract-Ready Slice or Production Gate
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

If `CHANGES_REQUIRED`, classify each finding by a stable root cause. The
orchestrator may assign a correction only when it stays inside the same accepted
contract, ownership, sensitive-data boundary, and authority. Re-run focused
validation and request a delta LOCAL_NATIVE review. Permit at most two correction
submissions per stable root cause. A repeated finding after that budget, contract
or ownership expansion, destructive action, dependency installation, credential,
production data, or ambiguous product decision returns a Human Gate and stops.

## Feature delivery

After `APPROVED`, the orchestrator may deliver the exact reviewed contribution:

1. reauthenticate the reviewed path set and ensure no unrelated owner work enters;
2. stage only those paths and commit on a `codex/` feature branch;
3. push, open a PR, and bind its evidence to the commit SHA;
4. wait for matching CI; never bypass or relabel a failed check;
5. merge only after CI passes, then verify the commit is reachable from remote
   `main`.

Any byte change after approval reopens focused validation and LOCAL_NATIVE review.
A CI failure may receive one bounded correction under the same rules. Feature PRs
do not require formal security review and do not claim production readiness.

After a successful merge, continue only with the next requirement-supported,
contract-ready vertical slice. Stop for a new product choice, API/ADR change,
ownership conflict, or any Human Gate above.

## Production gate

Formal security review runs once against an immutable production release-candidate
SHA with matching green CI, covering the accumulated change since the last
security-approved production SHA plus deployment, dependency, authentication,
tenant, provider, secret, and data boundaries. Only `security_review` may issue
that decision. Production deployment requires owner approval and security
`APPROVED`; `CHANGES_REQUIRED` or `BLOCKED` prevents deployment but does not rewrite
historical feature evidence.

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

## Handoff and authority

The orchestrator may scope, delegate bounded work, validate, request LOCAL_NATIVE,
apply the bounded correction policy, deliver approved non-production features, and
continue the existing roadmap. Return the compact capsule when a Human Gate,
correction budget, blocked CI, production gate, or owner pause is reached.

The owner retains all new product/API/architecture decisions, dependency installs,
destructive or credential-bearing actions, production security disposition, and
deployment authority.
