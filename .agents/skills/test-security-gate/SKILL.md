---
name: test-security-gate
description: Perform a read-only AgriScope production release-candidate security review, or an earlier owner-requested review, outside the feature lifecycle.
---

# test-security-gate

## Boundary

This skill is never part of the non-production feature lifecycle and Ponytail never
substitutes for it. Use it only for an immutable production release candidate under
ADR-0007, or earlier when the owner explicitly requests a review. The exact remote
SHA, accumulated change boundary, and matching CI evidence are mandatory.

## Inputs

- Production release-candidate gate under ADR-0007, or an explicit owner request.
- Immutable remote commit SHA and exact accumulated change scope.
- Relevant contracts and validation evidence.
- Matching CI and relevant runtime evidence.

## Review

Check secrets, privacy, authentication, authorization, tenant isolation, input and
GeoJSON validation, CSRF/XSS, logging, rate limiting, dependencies, external
providers, idempotency, quality gates, and safe satellite wording affected by the
scope. Cite direct evidence and return `APPROVED`, `CHANGES_REQUIRED`, or `BLOCKED`.

## Rules

- Read-only; do not fix findings.
- Do not broaden scope or expose sensitive values.
- Do not claim compliance certification.
- Do not trigger staging, commit, push, CI, deployment, or merge.
- Return the release decision to the orchestrator; only the owner can deploy.
