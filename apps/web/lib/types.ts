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
};
