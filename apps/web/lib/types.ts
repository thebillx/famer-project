export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type User = {
  id: string;
  email: string;
  display_name: string;
};

export type Member = {
  id: string;
  user_id: string;
  role: "organization_owner" | "organization_admin" | "agronomist" | "field_manager" | "viewer";
  status: string;
};

export type Farm = {
  id: string;
  organization_id: string;
  name: string;
  province: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type FieldBoundary = {
  id: string;
  farm_id: string;
  organization_id: string;
  name: string;
  geometry: GeoJsonPolygon;
  area_sqm: string;
  area_rai: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type SatelliteAcquisition = {
  provider: string;
  collection: string;
  item_id: string;
  acquired_at: string;
  cloud_cover_percent: number | null;
};

export type SatelliteAvailable = {
  field_id: string;
  status: "available";
  acquisition: SatelliteAcquisition;
  searched_at: string;
  message_th: string;
};

export type SatelliteNotSearched = {
  field_id: string;
  status: "not_searched";
  acquisition: null;
  searched_at: null;
  message_th: string;
};

export type SatelliteEmptySearch = {
  field_id: string;
  status: "no_data" | "temporarily_unavailable";
  acquisition: null;
  searched_at: string;
  message_th: string;
};

export type SatelliteLatest = SatelliteAvailable | SatelliteNotSearched | SatelliteEmptySearch;
export type SatelliteSearch = SatelliteAvailable | SatelliteEmptySearch;

export type SatelliteNdviSummary = {
  field_id: string;
  acquired_at: string;
  period_basis: "utc_day";
  algorithm_version: "agriscope-ndvi-summary-v1";
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndvi_stddev: number;
  sample_count: number;
  valid_sample_count: number;
  valid_pixel_ratio: number;
  comparison: SatelliteNdviComparison | null;
  comparison_status: "NOT_ASSESSABLE";
  comparison_reason: "NO_PREVIOUS_OBSERVATION" | "COMMON_SPATIAL_SUPPORT_NOT_PROVEN";
};

export type SatelliteNdviComparison = {
  previous_acquired_at: string;
  previous_ndvi_mean: number;
  ndvi_mean_delta: number;
  direction: "increased" | "decreased" | "unchanged";
};

export type Observation = {
  observation_id: string;
  field_id: string;
  acquired_at: string;
  cloud_percent: number | null;
  source: "Sentinel-2";
  status: "USABLE" | "POOR_QUALITY" | "UNAVAILABLE";
  imagery_available: boolean;
  geometry_hash: string | null;
  analysis_eligible: boolean;
  analysis_ready: boolean;
  comparison_eligible: boolean;
};

export type ObservationNdviSummary = {
  observation_id: string;
  field_id: string;
  acquired_at: string;
  algorithm_version: string;
  geometry_hash: string;
  analysis_eligible: true;
  analysis_ready: true;
  assessable: true;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndvi_stddev: number;
  sample_count: number;
  valid_sample_count: number;
  valid_pixel_ratio: number;
};

export type ObservationRaster = {
  observation_id: string;
  field_id: string;
  acquired_at: string;
  algorithm_version: string;
  geometry_hash: string;
  crs: "EPSG:4326";
  bounds: [number, number, number, number];
  width: number;
  height: number;
  nodata: number;
  value_min: number;
  value_max: number;
  valid_pixel_ratio: number;
  image_url: string;
};

export type GeoJsonMultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };

export type ComparisonSupport = {
  common_valid_pixel_count: number;
  field_grid_pixel_count: number;
  common_support_ratio: number;
  minimum_required_ratio: number;
  policy_version: string;
  denominator: "FIELD_GRID_PIXEL_CENTERS";
  reason: "SUFFICIENT_COMMON_SUPPORT" | "NO_COMMON_SUPPORT" | "BELOW_MINIMUM_COMMON_SUPPORT";
};

export type FieldChange = {
  field_id: string;
  before_observation_id: string;
  after_observation_id: string;
  algorithm_version: string;
  geometry_hash: string;
  before_observation_ndvi_mean: number;
  after_observation_ndvi_mean: number;
  before_ndvi: number | null;
  after_ndvi: number | null;
  ndvi_delta: number | null;
  changed_area_sqm: number | null;
  changed_area_rai: number | null;
  threshold: -0.1;
  highlight_semantics: "NDVI_DECREASE_AT_OR_BELOW_THRESHOLD";
  status: "USABLE" | "NOT_ASSESSABLE";
  support: ComparisonSupport;
  geometry: GeoJsonMultiPolygon | null;
};
