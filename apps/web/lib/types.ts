export type Organization = {
  id: string;
  name: string;
  slug: string;
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

export type SatelliteLatest = {
  field_id: string;
  status: "available" | "no_data" | "temporarily_unavailable";
  acquisition: SatelliteAcquisition | null;
  searched_at: string;
  message_th: string;
};
