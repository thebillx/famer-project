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

## FOUNDATION-001 executable models

FOUNDATION-001 implements ORM models for:

- `users`
- `organizations`
- `memberships`
- `refresh_sessions`

The original SQL seed remains as an architectural reference for the broader domain schema. The executable Alembic migration for FOUNDATION-001 is `apps/api/migrations/versions/20260801_0001_foundation.py`; it creates the auth and tenancy tables with upgrade and downgrade paths.

Deletion behavior is intentionally restrictive. Foreign keys use `RESTRICT` for core user, organization, membership, and refresh-session ownership so deletion must be explicit and audited in later privacy/account-deletion slices.
