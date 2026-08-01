# Feature Development Workflow

## Sequence

```text
Requirement
-> Task Brief
-> Contract
-> Ownership
-> Implementation
-> Self-verification
-> Handoff
-> QA/Security Review
-> Fix
-> Verification
-> Done
```

## Rules

- The orchestrator owns routing and status changes.
- Use `.agents/templates/task-brief.md` before implementation.
- Use `.agents/workflows/contract-first.md` before frontend or backend code.
- Assign file ownership before editing.
- Implement as a vertical slice with testable value.
- Every implementing agent produces `.agents/templates/handoff-report.md` format.
- QA/Security review uses `.agents/workflows/qa-security-review.md`.
- A task may not move from `IMPLEMENTED` directly to `DONE`.
- `DONE` requires review evidence and orchestrator verification.
