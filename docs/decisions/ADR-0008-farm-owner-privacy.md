# ADR-0008: Farm aggregate ownership privacy

Status: Accepted

Date: 2026-08-23

## Context

Current tenant queries prevent cross-organization access but active members of the
same organization can read every farm and field. The executable schema does not
record a resource owner. AgriScope must let organizations retain accountable
oversight without exposing one member's holdings to unrelated members.

## Decision

- Add immutable `farms.owner_user_id`; fields, acquisitions, metrics, artifacts,
  and alerts inherit ownership through their farm.
- The authenticated creator owns a new farm. Request payloads cannot select an
  owner.
- An active `organization_owner` may read and manage every active farm aggregate
  in that organization, subject to the existing operation role gate.
- Every other active role may see or operate only on aggregates whose
  `owner_user_id` matches the authenticated user. List endpoints omit non-owned
  data; direct farm, field, and satellite endpoints return the existing generic
  `404` before rate limiting, provider work, or mutation.
- Ownership transfer, delegated grants, shared farms, and field-level ownership
  are out of scope until separately contracted.

The database enforces that `(organization_id, owner_user_id)` names a membership
in the same organization. Existing farms are backfilled only when their
organization has exactly one active `organization_owner`; ambiguous organizations
fail migration preflight and require an explicit owner mapping.

## Alternatives considered

- Organization membership grants all farm reads: rejected because it caused the
  intra-organization disclosure this decision closes.
- Strict own-only access for `organization_owner`: rejected because it removes the
  oversight required by company and cooperative accounts.
- Per-field owners or an access-grant table: deferred because farm ownership
  already covers the current aggregate and avoids speculative sharing machinery.

## Consequences

Repository queries gain one ownership predicate and existing frontend empty/404
states remain valid. A migration and API contract update are required. An emergency
downgrade restores organization-wide visibility and loses ownership metadata, so
forward correction is preferred after rollout.

## Security impact

Organization scope remains mandatory. Same-organization non-owner, disabled,
foreign, deleted, and nonexistent resources share the same safe 404 boundary.
Satellite authorization must fail before acquisition lookup, rate limiting, OAuth,
provider calls, or side effects.
