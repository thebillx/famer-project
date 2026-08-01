CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'th',
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  status text NOT NULL DEFAULT 'active',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  plan_code text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  default_locale text NOT NULL DEFAULT 'th',
  default_timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES users(id),
  joined_at timestamptz,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  province text,
  district text,
  subdistrict text,
  address_text text,
  centroid geometry(Point, 4326),
  total_area_sqm numeric,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  centroid geometry(Point, 4326),
  area_sqm numeric NOT NULL,
  area_rai numeric NOT NULL,
  monitoring_enabled boolean NOT NULL DEFAULT false,
  preferred_resolution numeric,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crop_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id),
  crop_type text NOT NULL,
  crop_variety text,
  planting_date date,
  expected_harvest_date date,
  actual_harvest_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE acquisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  collection text NOT NULL,
  external_acquisition_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  cloud_coverage_metadata numeric,
  orbit_direction text,
  polarization text,
  source_metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, collection, external_acquisition_id)
);

CREATE TABLE field_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id),
  crop_season_id uuid REFERENCES crop_seasons(id),
  acquisition_id uuid NOT NULL REFERENCES acquisitions(id),
  observation_date date NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  quality_score numeric NOT NULL,
  valid_pixel_ratio numeric NOT NULL,
  cloud_pixel_ratio numeric NOT NULL,
  analysis_confidence text NOT NULL,
  failure_reason text,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, acquisition_id, algorithm_version)
);

CREATE TABLE metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES field_observations(id),
  metric_code text NOT NULL,
  mean numeric,
  median numeric,
  min numeric,
  max numeric,
  stddev numeric,
  p10 numeric,
  p25 numeric,
  p75 numeric,
  p90 numeric,
  valid_sample_count integer NOT NULL,
  affected_area_sqm numeric,
  metadata_json jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE raster_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES field_observations(id),
  artifact_type text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  bbox jsonb NOT NULL,
  resolution_m numeric NOT NULL,
  checksum text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  field_id_nullable uuid REFERENCES fields(id),
  metric_code text NOT NULL,
  rule_type text NOT NULL,
  threshold numeric NOT NULL,
  minimum_affected_area_percent numeric NOT NULL,
  minimum_confidence text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id),
  observation_id uuid NOT NULL REFERENCES field_observations(id),
  alert_rule_id uuid NOT NULL REFERENCES alert_rules(id),
  severity text NOT NULL,
  title_th text NOT NULL,
  title_en text NOT NULL,
  description_th text NOT NULL,
  description_en text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  provider text NOT NULL,
  organization_id_nullable uuid REFERENCES organizations(id),
  request_count integer NOT NULL DEFAULT 0,
  successful_requests integer NOT NULL DEFAULT 0,
  failed_requests integer NOT NULL DEFAULT 0,
  estimated_processing_units numeric NOT NULL DEFAULT 0,
  bytes_downloaded bigint NOT NULL DEFAULT 0
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_json jsonb,
  after_json jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memberships_organization_id ON memberships (organization_id);
CREATE INDEX idx_farms_organization_id ON farms (organization_id);
CREATE INDEX idx_fields_organization_id ON fields (organization_id);
CREATE INDEX idx_fields_farm_id ON fields (farm_id);
CREATE INDEX idx_fields_geometry ON fields USING gist (geometry);
CREATE INDEX idx_crop_seasons_field_id ON crop_seasons (field_id);
CREATE INDEX idx_observations_field_date ON field_observations (field_id, observation_date DESC);
CREATE INDEX idx_metric_snapshots_observation_id ON metric_snapshots (observation_id);
CREATE INDEX idx_alert_events_status ON alert_events (status);
CREATE INDEX idx_alert_events_created_at ON alert_events (created_at DESC);
CREATE INDEX idx_audit_logs_organization_created ON audit_logs (organization_id, created_at DESC);
