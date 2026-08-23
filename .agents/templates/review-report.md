# Ponytail LOCAL_NATIVE review

```text
TASK: <id>
REVIEWER: Ponytail / code_review
BOUNDARY: base=<sha/worktree> paths=<exact final diff>
SCOPE REVIEWED: <one sentence>
FILES INSPECTED: <exact paths>
VALIDATION REVIEWED: <commands/results or NOT_RUN>
FINDINGS: <blocking findings with evidence and minimal required change, or NONE>
REGRESSION RISKS: <compact list or NONE>
DECISION: APPROVED | CHANGES_REQUIRED
RECOMMENDED LIFECYCLE ACTION: <one bounded action>
```

Ponytail performs code/native review only. It may report an apparent security risk
as a code-review blocker, but it cannot issue security approval or authorize a
correction, commit, push, CI, deployment, or merge. The accepted lifecycle policy
decides whether an in-contract correction or non-production delivery is eligible.

Terminal transport receipt must be exactly one line:

- `REVIEW_DECISION: APPROVED`
- `REVIEW_DECISION: CHANGES_REQUIRED`
