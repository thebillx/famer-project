# Database Schema

## Core entities

The schema follows:

```text
User
  -> Organization
    -> Farm
      -> Field
        -> Crop Season
          -> Observation
```

## Geometry

Field geometry is stored as PostGIS Polygon or MultiPolygon in EPSG:4326. Area is calculated with a suitable projection/geodesic method, never directly from latitude/longitude degrees.

## Indexes

Required indexes:

- `organization_id`
- `field_id`
- `observation_date`
- unique provider + collection + acquisition ID
- spatial geometry index
- alert status
- `created_at`
- unique field + acquisition + algorithm version

## Multi-tenant rule

Every tenant-owned table includes or joins to `organization_id`. Queries must enforce organization scope before returning records.
