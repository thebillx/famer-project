# Engineering Reviews

Review reports are permanent evidence for architecture, security, database, migration, API, and quality decisions. They keep each feature reviewable after the branch is merged and prevent status changes based only on summaries.

## Lifecycle

Every feature follows this flow:

```text
Requirement
-> Task Brief
-> Contract Review
-> Implementation
-> Internal QA
-> CTO Review
-> Fix
-> Approve
-> Merge
```

The internal agent review lives under `.agents/reviews/`. The permanent CTO or engineering review lives under `docs/reviews/`.

## Reviewer Responsibilities

- Inspect the actual branch diff, contract, migrations, tests, and documentation.
- Verify that required evidence is linked or summarized.
- Confirm tenant scope, RBAC, authentication, secret handling, and migration safety when relevant.
- Record tests that passed, failed, or were not run.
- Require fixes for blocking issues before approval.
- Avoid marking a task `DONE` until external review and merge requirements are satisfied.

## Approval Flow

1. The implementing agent prepares the task brief and contract.
2. The owning specialist implements the scoped change.
3. QA Security Agent writes the internal review.
4. CTO review records the durable engineering decision in this directory.
5. Required changes are fixed on the same feature branch.
6. Approval allows merge according to repository policy.

## Required Evidence

- Feature branch and commit SHA.
- Files or contracts reviewed.
- Commands executed and direct test results.
- Migration upgrade/downgrade evidence, or a clear `NOT_RUN` reason.
- Security and tenant-isolation findings.
- Known limitations and follow-up risks.

## Review Status Meanings

- `APPROVED`: No required changes remain.
- `APPROVED_WITH_NOTES`: Merge may proceed after reviewer judgment; documented risks or non-blocking follow-up remain.
- `CHANGES_REQUIRED`: The branch must be fixed and reviewed again.
- `BLOCKED`: Review cannot complete without external input, missing access, missing environment, or a dependency decision.
