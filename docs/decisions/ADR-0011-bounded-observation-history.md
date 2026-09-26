# ADR-0011: Bounded atomic observation history

Status: Accepted within the owner-approved history completion scope (2026-09-26).

## Context

The observation cache foundation already records acquisitions and raster results. The pending M01/M02 contribution adds bounded catalog history and proposed geometry-version records, which this slice does not need. A field workspace needs an explicit way to discover prior observations without automatic provider work, false completeness, or misregistered historical imagery.

## Decision

Use a synchronous, single-database-transaction discovery request and a completed receipt keyed by field, current geometry fingerprint and normalized time range. No worker, polling or durable failure job is introduced. Exceptions roll back the receipt and acquisitions, allowing safe retries; concurrent identical requests use database uniqueness. Receipt reads apply the existing owner/organization boundary.

Follow provider continuations only on the configured STAC origin and retain the original collection, geometry and date filter. Reject partial results at the page cap before persistence. Provenance is allowlisted metadata rather than raw provider responses.

Reuse the existing acquisition geometry fingerprint and cache identity. No new geometry-version table or duplicated observation status/readiness columns are introduced. Historical inserts preserve first-recorded geometry lineage on acquisition conflicts. Numeric analysis/comparison remain ineligible when the stored hash is missing or differs from the current server-authoritative geometry. True-colour preview retains baseline behavior: render the requested observation date on the current saved geometry, matching the browser bounds. Historic clipped geometry visualization requires its own future contract.

The only new table is an organization-scoped completed discovery receipt. Uncommitted receipt insertion serializes identical concurrent discovery. Successful processing commits counts and completion time; any failure rolls back everything. No public RUNNING/FAILED state or polling is promised.

No NDVI algorithm, cloud/support threshold, or diagnostic interpretation changes. Acquisition discovery does not itself imply successful analysis.

## Consequences

Users explicitly select a bounded range and may retry failures or shorten an excessive result range. Successful receipts prevent duplicate provider work and rows for identical requests. Transactions may stay open during a bounded catalog request; this is appropriate for the existing request-time architecture, with configured timeouts/page bounds/rate limits. Larger async acquisition, durable progress/failure tracking, and historical-boundary visualization require later contracts. Real-provider validation and production calibration remain separate release evidence.
