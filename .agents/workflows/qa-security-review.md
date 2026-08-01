# QA Security Review Workflow

## Gate

QA/Security Review is mandatory after implementation and before orchestrator verification.

## Inputs

- Task brief from `.agents/templates/task-brief.md`
- Handoff report from `.agents/templates/handoff-report.md`
- Code diff
- Test output
- API/data contracts

## Decisions

- `APPROVED`: Evidence supports verification.
- `APPROVED_WITH_NOTES`: Evidence supports verification with non-blocking follow-up.
- `CHANGES_REQUIRED`: Blocking gaps exist and owner must fix them.
- `BLOCKED`: Review cannot proceed or severe security/architecture issue exists.

## Rules

- `CHANGES_REQUIRED` and `BLOCKED` cannot move to `DONE`.
- Findings must cite evidence.
- Missing tests must be explicit.
- Security findings must include required change.
- Review output uses `.agents/templates/review-report.md`.
