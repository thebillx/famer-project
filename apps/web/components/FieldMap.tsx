"use client";

import maplibregl, { Map, Marker } from "maplibre-gl";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { GeoJsonPolygon } from "../lib/types";
import { Button } from "./Button";

type LngLat = [number, number];

const emptyStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e6efe8" }
    }
  ]
};

function closedPolygon(points: LngLat[]): GeoJsonPolygon {
  return { type: "Polygon", coordinates: [[...points, points[0]]] };
}

export function FieldMap({
  initialGeometry,
  onGeometryChange,
  editable = false
}: {
  initialGeometry?: GeoJsonPolygon;
  onGeometryChange?: (geometry: GeoJsonPolygon | null) => void;
  editable?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [points, setPoints] = useState<LngLat[]>(() =>
    initialGeometry ? (initialGeometry.coordinates[0].slice(0, -1) as LngLat[]) : []
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: emptyStyle,
      center: points[0] ?? [100.5018, 13.7563],
      zoom: points.length ? 14 : 5
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("load", () => renderGeometry(map, points));
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [editable]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    renderGeometry(map, points);
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (editable) {
      points.forEach((point, index) => {
        const marker = new maplibregl.Marker({ color: "#173f35", draggable: true })
          .setLngLat(point)
          .addTo(map);
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          setPoints((current) =>
            current.map((existing, existingIndex) =>
              existingIndex === index ? [lngLat.lng, lngLat.lat] : existing
            )
          );
        });
        markersRef.current.push(marker);
      });
    }
    onGeometryChange?.(points.length >= 3 ? closedPolygon(points) : null);
  }, [editable, onGeometryChange, points]);

  function renderGeometry(map: Map, currentPoints: LngLat[]) {
    const geometry = currentPoints.length >= 3 ? closedPolygon(currentPoints) : null;
    const feature = geometry
      ? {
          type: "Feature" as const,
          properties: {},
          geometry
        }
      : {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Polygon" as const, coordinates: [] }
        };
    const collection = { type: "FeatureCollection" as const, features: [feature] };
    if (!map.getSource("field")) {
      map.addSource("field", { type: "geojson", data: collection });
      map.addLayer({
        id: "field-fill",
        type: "fill",
        source: "field",
        paint: { "fill-color": "#2f8f55", "fill-opacity": 0.22 }
      });
      map.addLayer({
        id: "field-line",
        type: "line",
        source: "field",
        paint: { "line-color": "#173f35", "line-width": 3 }
      });
      return;
    }
    const source = map.getSource("field") as maplibregl.GeoJSONSource;
    source.setData(collection);
  }

  function addPointFromMouse(event: React.MouseEvent<HTMLDivElement>) {
    if (!editable || !mapRef.current || !containerRef.current) return;
    if ((event.target as HTMLElement).closest(".maplibregl-ctrl, .maplibregl-marker")) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const point = mapRef.current.unproject([event.clientX - bounds.left, event.clientY - bounds.top]);
    setPoints((current) => [...current, [point.lng, point.lat]]);
  }

  return (
    <section className="space-y-3">
      <div
        ref={containerRef}
        onMouseDownCapture={addPointFromMouse}
        className="overflow-hidden rounded-md border border-[#b8c5b0] bg-[#e6efe8]"
        style={{ height: "62vh", minHeight: 420 }}
        aria-label="Field map"
      />
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPoints((current) => current.slice(0, -1))}
            disabled={!points.length}
          >
            Undo
          </Button>
          <Button type="button" variant="danger" onClick={() => setPoints([])} disabled={!points.length}>
            Delete polygon
          </Button>
          <span className="self-center text-sm text-[#526057]">
            Click the map to add vertices. Drag markers to edit before saving.
          </span>
        </div>
      ) : null}
    </section>
  );
}
