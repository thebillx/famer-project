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
- Persist one quality-approved analysis cache per observation and algorithm version.
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
  quality gates, or have incompatible grids.
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

The forward migration adds one table and one composite uniqueness constraint to
acquisitions. Downgrade drops only the new cache table/constraint. Existing
acquisition data is preserved in both directions.
