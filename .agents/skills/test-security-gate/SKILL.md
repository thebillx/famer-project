---
name: test-security-gate
description: Perform an owner-requested, read-only AgriScope security review outside the automated lifecycle.
---

# test-security-gate

## Boundary

This skill is never part of the automated lifecycle and Ponytail never substitutes
for it. Use it only after the owner explicitly decides that a security review is
required and supplies the exact contribution boundary and evidence.

## Inputs

- Owner request and exact scope.
- Commit/diff or working-tree boundary selected by the owner.
- Relevant contracts and validation evidence.
- CI or runtime evidence when the owner chooses to include it.

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
- Return control to the owner after the decision.
