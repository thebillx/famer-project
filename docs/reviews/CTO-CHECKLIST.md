# CTO Review Checklist

Use one value for each item: `PASS`, `FAIL`, or `N/A`.

| Area | Result | Evidence / Notes |
| --- | --- | --- |
| Architecture |  |  |
| Folder Structure |  |  |
| Dependency Direction |  |  |
| Database |  |  |
| Migration |  |  |
| RBAC |  |  |
| Tenant Scope |  |  |
| Authentication |  |  |
| Secrets |  |  |
| Docker |  |  |
| API |  |  |
| OpenAPI |  |  |
| Tests |  |  |
| Coverage |  |  |
| Technical Debt |  |  |
| Performance |  |  |
| Production Readiness |  |  |

## Required Review Inputs

- Pull request diff.
- `docs/reviews/FOUNDATION-001.md`.
- `.agents/reviews/ARCH-001-review.md`.
- `.agents/reviews/FOUNDATION-001-review.md`.
- `docs/api/openapi.yaml`.
- `apps/api/migrations/versions/20260801_0001_foundation.py`.
- Unit and contract test output.

## Decision

- [ ] APPROVED
- [ ] APPROVED_WITH_NOTES
- [ ] CHANGES_REQUIRED
- [ ] BLOCKED
