export type SpatialBounds = [west: number, south: number, east: number, north: number];

export function unionBounds(bounds: SpatialBounds[]): SpatialBounds {
  if (!bounds.length) throw new Error("at least one spatial extent is required");
  return [
    Math.min(...bounds.map((item) => item[0])),
    Math.min(...bounds.map((item) => item[1])),
    Math.max(...bounds.map((item) => item[2])),
    Math.max(...bounds.map((item) => item[3])),
  ];
}

export function pointWithinBounds(point: number[], bounds: SpatialBounds): boolean {
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];
}

export function fieldCentroidWithinBounds(ring: number[][], bounds: SpatialBounds): boolean {
  if (ring.length < 3) return false;
  const points = ring.at(-1)?.every((value, index) => value === ring[0]?.[index]) ? ring.slice(0, -1) : ring;
  const centroid = points.reduce(([x, y], [pointX, pointY]) => [x + pointX, y + pointY], [0, 0]).map((value) => value / points.length);
  return pointWithinBounds(centroid, bounds);
}
