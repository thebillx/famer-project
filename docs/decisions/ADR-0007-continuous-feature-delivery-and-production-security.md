# ADR-0007: Continuous feature delivery and production security gate

Status: Accepted

Date: 2026-08-23

## Context

ADR-0006 deliberately stopped after every LOCAL_NATIVE review so the owner could
decide corrections and delivery. In practice, repeated owner round-trips after
bounded code-review findings and green feature validation interrupt the roadmap
without adding a distinct production assurance fact. The owner has granted
standing authority to correct and merge non-production vertical slices while
reserving production deployment and release security decisions.

## Decision

The orchestrator may continuously deliver a bounded non-production vertical slice:

1. establish contract, ownership, sensitive-data boundary, validation, and stops;
2. implement and run focused validation;
3. obtain Ponytail LOCAL_NATIVE code review;
4. apply at most two in-contract correction submissions per stable root cause,
   revalidating and obtaining delta review each time;
5. after approval, stage only reviewed paths, commit, push a feature PR, wait for
   matching CI, and merge only when CI passes;
6. continue the next already-supported contract-ready slice.

The continuous authority does not cover a new product/API/architecture choice,
ownership expansion, dependency installation, destructive operation, credential,
production data, failed CI bypass, deployment, or a correction root that exhausts
its budget. Those conditions return a Human Gate.

Ponytail remains code review only. Formal security review is not repeated for each
feature PR. It runs against an immutable production release-candidate SHA with
green CI and covers the accumulated change since the last security-approved
production SHA, including deployment, dependency, authentication, authorization,
tenant, provider, secret, and production-data boundaries. Only the independent
`security_review` role may issue the production security decision. The owner alone
authorizes deployment, and deployment requires security `APPROVED`.

Raw logs remain in CI/tool storage. Feature PRs keep compact commit, validation,
LOCAL_NATIVE, CI, scope, and rollback evidence; they do not store duplicate
security reports or claim production readiness.

## Consequences

- Routine reviewed slices no longer pause for correction, commit, PR, CI, or merge
  decisions.
- Correction loops remain bounded and cannot silently expand contract or authority.
- Security review evaluates one real release candidate rather than many transient
  working trees.
- Feature merge and production readiness are explicitly different states.
- Production deployment, secrets, production data, and release security remain
  owner-controlled Human Gates.

This ADR supersedes ADR-0006 lifecycle-stop and per-action owner-handoff clauses.
ADR-0006 remains historical evidence for why context, evidence, and reviewer roles
stay compact and separate.
