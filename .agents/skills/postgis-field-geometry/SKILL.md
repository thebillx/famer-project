---
name: postgis-field-geometry
description: Validate and persist AgriScope field geometries with PostGIS, EPSG:4326 storage, normalization, projected area calculations, numerical fixtures, and tenant-isolation tests.
---

# postgis-field-geometry

## Purpose

Guide authoritative backend geometry validation, storage, and area calculation for farm and field boundaries.

## When to use

- Implementing Polygon or MultiPolygon persistence.
- Validating GeoJSON geometry.
- Calculating area, centroid, or spatial indexes.
- Testing geospatial correctness or tenant isolation.

## When not to use

- Browser-only map drawing behavior.
- Satellite API calls.
- Bootstrap-only work where product migrations are prohibited.

## Required inputs

- Geometry contract.
- Database model and migration ownership.
- Numerical fixtures.
- Organization-scope requirements.

## Preconditions

- Backend owns authoritative geometry validation and area.
- Storage CRS is defined as EPSG:4326 unless an ADR changes it.
- Area projection strategy is defined and testable.

## Procedure

1. Accept Polygon and MultiPolygon only when contract permits them.
2. Store geometry in EPSG:4326.
3. Normalize geometry before persistence.
4. Ensure ring closure.
5. Enforce GeoJSON coordinate order: longitude, latitude.
6. Reject self-intersection.
7. Reject empty geometry.
8. Reject invalid geometry.
9. Enforce polygon size limits from contract.
10. Add spatial indexes where queries require them.
11. Calculate centroid for map display or indexing when required.
12. Calculate area using an appropriate projection, geography type, or agreed geodesic method.
13. Convert area to square meters, rai, and hectares.
14. Add numerical fixtures for known geometries.
15. Add cross-tenant access tests.
16. Produce a handoff report.

## Expected outputs

- Validated geometry persistence.
- Authoritative area values.
- Numerical tests.
- Tenant-isolation tests.

## Validation

- Invalid, empty, unclosed, self-intersecting, and oversize geometry cases fail safely.
- Area accuracy is within contract tolerance.
- Cross-tenant access is denied.
- Spatial index is present for required spatial queries.

## Failure handling

- If projection choice is ambiguous, stop for ADR or task-brief clarification.
- If numerical tolerance is missing, request contract update.
- If geometry library behavior differs by environment, capture fixtures and versions.

## Security considerations

- Enforce organization scope on reads and writes.
- Treat GeoJSON as untrusted input.
- Avoid unbounded geometry complexity.
- Avoid logging full private field boundaries unless explicitly approved.

## Handoff requirements

Report geometry types, CRS, projection strategy, conversion formulas, fixture results, and tenant-isolation evidence.

## Prohibited actions

- Do not calculate production area directly from latitude/longitude degrees.
- Do not accept invalid geometry to unblock UI.
- Do not create product migrations during bootstrap.
- Do not change formulas without numerical tests.

## References

- `AGENTS.md`
- `.agents/skills/maplibre-field-drawing/SKILL.md`
- PostGIS and GeoAlchemy2 documentation as references.

## Unit conversions

- 1 rai = 1,600 square meters.
- 1 hectare = 10,000 square meters.
