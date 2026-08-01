---
name: test-security-gate
description: Review AgriScope work for requirement coverage, tests, geospatial correctness, frontend states, security, tenant isolation, regression risk, and release readiness.
---

# test-security-gate

## Purpose

Provide the mandatory QA and security review gate before AgriScope work can be verified or marked done.

## When to use

- Work has been implemented and handed off.
- A task needs review for security, tests, accessibility, geospatial correctness, or regression risk.
- The orchestrator requests release readiness evidence.

## When not to use

- Before implementation exists.
- To replace owner self-verification.
- To approve work without code diff or test evidence.

## Required inputs

- Task brief.
- Handoff report.
- Code diff.
- Test output.
- Contract and acceptance criteria.

## Preconditions

- Implementing agent has completed self-verification.
- Review has access to changed files and commands executed.
- Required contracts are available.

## Procedure

1. Review functional requirement coverage.
2. Check acceptance criteria.
3. Check error behavior.
4. Assess regression risk.
5. Review backend unit, API, integration, migration, organization-scope, and permission tests.
6. Review geospatial numerical fixtures, division by zero, NaN, NoData, invalid geometry, area accuracy, and cloud/quality behavior.
7. Review frontend component states, API error state, mobile behavior, accessibility, keyboard navigation, and color-independent status.
8. Review authentication, authorization, cross-tenant access, secret exposure, logging, input validation, CSRF/XSS considerations, rate-limit considerations, and dependency risk.
9. Detect mock implementations in production flow.
10. Produce a decision: `APPROVED`, `APPROVED_WITH_NOTES`, `CHANGES_REQUIRED`, or `BLOCKED`.

## Expected outputs

- Review report using `.agents/templates/review-report.md`.
- Recommended task status.
- Required changes when applicable.

## Validation

- Every finding cites file diff or test evidence.
- Failed or missing tests are explicitly listed.
- Security findings include impact and required fix.
- `DONE` is recommended only when evidence supports it.

## Failure handling

- If evidence is missing, return `CHANGES_REQUIRED`.
- If review cannot run due to environment or missing contracts, return `BLOCKED` or `CHANGES_REQUIRED` with reason.
- If a severe security issue is found, return `BLOCKED`.

## Security considerations

- Never expose secrets in review output.
- Treat logs and fixtures as possible secret sources.
- Verify tenant isolation for tenant-owned data.
- Verify satellite limitations are preserved in user-facing language.

## Handoff requirements

Return decision, evidence, tests executed, tests passed, tests failed, security findings, regression risks, required changes, and recommended status.

## Prohibited actions

- Do not approve based on implementation claims alone.
- Do not rewrite feature implementation unless assigned.
- Do not ignore missing tests.
- Do not mark `CHANGES_REQUIRED` work as ready.

## References

- `AGENTS.md`
- `.agents/workflows/qa-security-review.md`
- `.agents/templates/review-report.md`
- OWASP ASVS and Playwright documentation as references.

## Review output

```text
Decision:
Evidence:
Tests executed:
Tests passed:
Tests failed:
Security findings:
Regression risks:
Required changes:
Recommended status:
```
