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

## Consequences

The slice adds bounded database storage and synchronous first-request processing,
but no new technology or browser credential exposure. Provider cost is controlled by
existing rate limits and idempotent cache reuse. A later worker may precompute the
same products without changing observation contracts.

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
