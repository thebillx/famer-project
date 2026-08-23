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

Refresh sessions store only token hashes. `refresh_sessions.rotated_from` is a nullable self-referencing foreign key with `SET NULL` on delete so refresh-token rotation can be audited without storing raw refresh tokens.

Deletion behavior is intentionally restrictive. Foreign keys use `RESTRICT` for core user, organization, membership, and refresh-session ownership so deletion must be explicit and audited in later privacy/account-deletion slices.

## FIELD-001 executable models

FIELD-001 adds executable Alembic migration `apps/api/migrations/versions/20260801_0002_farm_field.py` and ORM models for:

- `farms`
- `fields`

`farms.organization_id` is required and indexed. Reads and mutations are scoped through active user membership before returning records. `farms` also has `UNIQUE (id, organization_id)` so child rows can enforce tenant consistency at the database layer.

`farms.owner_user_id` is required and indexed. It is constrained with the composite foreign key `(organization_id, owner_user_id) REFERENCES memberships (organization_id, user_id) ON DELETE RESTRICT`, so a farm owner must be a member of the same organization. New farms take the authenticated creator as owner; ownership is immutable. Organization owners can oversee all active farms in their organization, while other active members can access only farms they own. Fields and satellite records inherit this boundary through their farm relationship. Farm responses do not expose `owner_user_id`.

`fields.geometry` is stored as PostGIS `geometry(Polygon, 4326)`. The backend validates GeoJSON Polygon input before persistence and calculates:

- `area_sqm` with `ST_Area(geometry::geography)`.
- `area_rai` as `area_sqm / 1600`.

`fields` keeps `organization_id` for tenant-scoped queries and enforces `FOREIGN KEY (farm_id, organization_id) REFERENCES farms (id, organization_id) ON DELETE RESTRICT`, preventing a field from pointing to a farm in another organization.

Field and farm deletes are soft deletes using `status = 'deleted'` for this slice. Foreign keys remain `RESTRICT`; destructive cascading is intentionally avoided.

## SATELLITE-001 executable persistence

SATELLITE-001 adds executable Alembic migration `apps/api/migrations/versions/20260801_0003_satellite_acquisitions.py` and ORM model:

- `field_acquisitions`

The table stores only selected Sentinel-2 Level-2A catalogue metadata needed by the UI:

- `field_id`
- `organization_id`
- `provider`
- `collection`
- `provider_item_id`
- `acquired_at`
- `cloud_cover_percent`
- `search_status`
- `searched_at`
- limited non-sensitive `provider_metadata`

`field_acquisitions` enforces `UNIQUE (field_id, provider, provider_item_id)` so repeated latest-image searches are idempotent. It also enforces `FOREIGN KEY (field_id, organization_id) REFERENCES fields (id, organization_id) ON DELETE RESTRICT`, preventing an acquisition row from being attached to a field in another organization.

Complete raw STAC provider responses, raster assets, NDVI values, overlays, and analysis outputs are intentionally not stored in SATELLITE-001.
