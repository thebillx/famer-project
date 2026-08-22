# ADR-0006: Owner-controlled lifecycle

Status: Accepted

Date: 2026-08-22

## Context

Repeated handoffs, review artifacts, and automated correction/delivery stages made
the agent loop expensive and blurred owner authority. Agents should finish a bounded
implementation and code review without taking control of delivery.

## Decision

The automated lifecycle ends after Ponytail LOCAL_NATIVE code review and one compact
owner handoff. The orchestrator may scope, delegate bounded exploration/planning/
implementation, run focused validation, and request that review. It then stops.

Ponytail is code review only, never security review. A `CHANGES_REQUIRED` decision
does not trigger automatic correction. The owner decides corrections, additional
validation, security review, staging, commits, push/PR/CI, deployment, and merge.

Agents exchange the smallest relevant context. Durable facts live in canonical
requirements, contracts, ADRs, migrations, code, tests, and the active task brief.
One latest handoff capsule transports current state. Raw logs remain in tool/CI
storage; large artifacts remain external and are referenced by immutable path/URL,
digest, purpose, and retention.

Runtime routing uses the existing profiles:

- Terra/low read-only exploration/test support.
- Sol/xhigh read-only planning/architecture.
- Luna/xhigh bounded implementation.
- Spark/high fast mechanical coding/tests.
- Ponytail read-only LOCAL_NATIVE code review.

## Consequences

- No automatic post-review fix, staging, commit, push, CI, security, or merge loop.
- No duplicate persistent local-native and security reports.
- Resume requires a new owner decision and a new bounded task packet.
- Security review remains available only when explicitly requested by the owner.

This ADR supersedes the earlier ADR-0006 post-push-security delivery sequence while
retaining its governance-cleanup and no-duplicate-harness intent. ADR-0001 and all
product architecture decisions remain unchanged.
