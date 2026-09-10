# ADR-0010: Observation-scoped raster and change cache

Status: Accepted

Date: 2026-08-30

## Context

The approved Field Analysis and Compare workflows require observation history,
spatially registered NDVI, and truthful changed-area evidence. The current API only
computes latest imagery and scalar NDVI. AgriScope already has PostgreSQL/PostGIS and
bounded raster-processing dependencies, while object-storage access is not yet an
implemented application service.

## Decision

- Treat the existing acquisition UUID as stable observation identity.
- Persist one quality-approved analysis cache per observation, algorithm version,
  and persisted geometry fingerprint. The acquisition record also carries the
  fingerprint that proves which field boundary was used when the observation was
  found.
- Store a bounded, compressed float32 GeoTIFF in EPSG:4326 with nodata `-9999` as the
  numeric source of truth. Maximum dimensions are 512×512 at a 10 m target scale.
- Derive the frontend PNG overlay and quantitative metadata from that numeric source;
  colors are presentation only and do not replace numeric semantics.
- Lazy-compute the first request and upsert idempotently. Subsequent scalar, raster,
  and change requests reuse the cache and avoid provider recomputation.
- Define changed cells conservatively as valid aligned pixels whose NDVI delta
  `(after - before)` is at most `-0.10`. Polygonize that real mask, clip it to the
  field, and calculate geodesic area. Return evidence without diagnosis.
- Reject comparison when observations differ by field, are reversed/equal, fail
  quality or provenance gates, or have incompatible grids. If aligned rasters have
  no common valid support, return `NOT_ASSESSABLE` with null change measurements;
  never represent that state as unchanged or zero changed area.
- Keep cache bytes inside PostgreSQL for this bounded first production slice. Moving
  assets to object storage requires a later ADR with lifecycle and signed-access
  policy; API URLs remain stable enough to hide that future implementation change.

## 2026-09-09 comparison-support correction

The original decision required common valid support but did not define how much
common support was enough, how its denominator was measured, or whether the scalar
means used for a comparison were calculated over that same support. PR #10 review
therefore found that independently measured observation means could produce a
misleading comparison even while the spatial change mask used common pixels.

The corrected comparison contract is:

- Individual observation measurements remain observation-scoped and are preserved as
  independent values. They are not reused as the derived before/after comparison
  means.
- Derived `before_ndvi`, `after_ndvi`, and `ndvi_delta` are calculated only from the
  same `common_valid` pixels after raster alignment and field clipping.
- The support denominator is the number of aligned raster-grid pixel centers inside
  the authorized field boundary (`FIELD_GRID_PIXEL_CENTERS`). The numerator is the
  subset of those field-grid pixels that are finite and valid in both observations.
- Policy version `common-field-grid-v1-provisional` makes those semantics explicit in
  every comparison response.
- `SATELLITE_COMPARISON_MIN_COMMON_SUPPORT_RATIO` is independently configurable from
  the single-observation quality gates. The initial value `0.40` is a provisional
  development/pilot guardrail: it is intended to reject comparisons dominated by
  non-overlapping evidence while the team gathers representative field-size,
  season, cloud/shadow, and acquisition-pair data. It is not derived solely from the
  single-observation threshold, has not been calibrated against production outcomes,
  and must not be described as production-validated.
- No common support, or support below that configured threshold, returns
  `NOT_ASSESSABLE`; all derived comparison means, delta, changed area, and geometry
  are null. Only a comparison that passes the support gate may return zero changed
  area when no common pixel crosses the `-0.10` decrease threshold.
- The highlighted geometry specifically means `NDVI_DECREASE_AT_OR_BELOW_THRESHOLD`;
  it is not a generic map of every kind of change.
- The legacy scalar `/satellite/ndvi-summary` history cannot reconstruct a common
  raster support from scalar snapshots alone. It therefore preserves the current
  single-observation summary but suppresses the derived previous-value comparison
  and reports why common spatial support was not proven.

This correction changes calculation and API semantics only. It does not require a
schema or migration change and does not alter the bounded migration decision below.

## Consequences

The slice adds bounded database storage and synchronous first-request processing,
but no new technology or browser credential exposure. Provider cost is controlled by
existing rate limits and idempotent cache reuse. A later worker may precompute the
same products without changing observation contracts.

The common-support policy now has a visible calibration obligation before production
release. Pilot evidence should report the distribution of common-support ratios and
assessment outcomes instead of silently tuning the threshold until tests pass.

## Security impact

Analysis rows use composite observation/field/organization integrity. Authorization
occurs before lookup or processing. Binary products are private and never reveal
provider credentials or storage identifiers.

## Migration or rollback plan

The portable NDVI-history candidate and the real observation-analysis revision
both attempted to create the same acquisition identity constraint from
`20260823_0004`. The candidate was not present in verified repository history,
so its table definition is re-homed in forward-only `20260908_0006_ndvi_history`
after the real applied `20260830_0005` revision. The shared constraint is owned
only by `20260830_0005`; the new revision creates/drops only the NDVI-history
table. `20260908_0007` adds nullable geometry lineage columns while replacing
the old cache uniqueness keys. No applied revision is edited in place.

Downgrade removes only the cache tables/lineage owned by the migration path and
preserves existing acquisition data. A downgrade from `20260908_0007` fails
closed before schema changes when multiple geometry-versioned rows share one
legacy cache key, because collapsing those historical measurements would lose
lineage. Starting states proven on disposable PostGIS are `20260823_0004`,
`20260830_0005`, and the full head, including downgrade/re-upgrade. A database
stamped with the unverified candidate `20260824_0005` is not claimed supported.
