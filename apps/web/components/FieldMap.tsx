"use client";

import maplibregl, { LngLatBounds, Map, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { GeoJsonPolygon } from "../lib/types";
import { Button } from "./Button";

type LngLat = [number, number];

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const THAILAND_CENTER: LngLat = [100.5232, 13.7367];
const THAILAND_ZOOM = 5.4;

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
  const dragStateRef = useRef({ dragging: false, markerDragging: false });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [geolocationAvailable, setGeolocationAvailable] = useState(false);
  const [points, setPoints] = useState<LngLat[]>(() =>
    initialGeometry ? (initialGeometry.coordinates[0].slice(0, -1) as LngLat[]) : []
  );
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_STYLE_URL;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: points[0] ?? THAILAND_CENTER,
      zoom: points.length ? 14 : THAILAND_ZOOM,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.on("dragstart", () => {
      dragStateRef.current.dragging = true;
    });
    map.on("dragend", () => {
      window.setTimeout(() => {
        dragStateRef.current.dragging = false;
      }, 0);
    });
    map.on("click", (event) => {
      if (!editable) return;
      if (dragStateRef.current.dragging || dragStateRef.current.markerDragging) return;
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest(".maplibregl-ctrl, .maplibregl-marker")) return;
      setPoints((current) => [...current, [event.lngLat.lng, event.lngLat.lat]]);
    });
    map.on("load", () => {
      setMapLoaded(true);
      renderGeometry(map, points);
      fitGeometry(map, points);
    });
    map.on("error", () => {
      setMapError("ไม่สามารถโหลดแผนที่พื้นฐานได้ กรุณาตรวจสอบการเชื่อมต่อหรือค่าแผนที่");
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [editable, styleUrl]);

  useEffect(() => {
    setGeolocationAvailable(typeof navigator !== "undefined" && "geolocation" in navigator);
  }, []);

  useEffect(() => {
    onGeometryChange?.(points.length >= 3 ? closedPolygon(points) : null);
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
        marker.on("dragstart", () => {
          dragStateRef.current.markerDragging = true;
        });
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          setPoints((current) =>
            current.map((existing, existingIndex) =>
              existingIndex === index ? [lngLat.lng, lngLat.lat] : existing
            )
          );
          window.setTimeout(() => {
            dragStateRef.current.markerDragging = false;
          }, 0);
        });
        markersRef.current.push(marker);
      });
    }
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

  function fitGeometry(map: Map, currentPoints: LngLat[]) {
    if (editable || currentPoints.length < 3) return;
    const bounds = new LngLatBounds(currentPoints[0], currentPoints[0]);
    currentPoints.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 72, maxZoom: 16, duration: 0 });
  }

  function locateMe() {
    if (!navigator.geolocation || !mapRef.current) {
      setLocationStatus("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setLocationStatus("กำลังค้นหาตำแหน่ง...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationStatus(null);
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 15,
          essential: true
        });
      },
      () => {
        setLocationStatus("ไม่สามารถใช้ตำแหน่งปัจจุบันได้");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <section className="space-y-3">
      <div className="relative overflow-hidden rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-surface-map)] shadow-[var(--as-shadow-lg)]">
        <div
          ref={containerRef}
          className="bg-[var(--as-surface-map)]"
          style={{ height: "62vh", minHeight: 420 }}
          aria-label="Field map"
          data-map-style-url={styleUrl}
          data-vertex-count={points.length}
        />
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-center justify-between gap-3">
          <div className="pointer-events-auto flex flex-wrap gap-2 rounded-2xl border border-[var(--as-border)] bg-white/90 p-1.5 shadow-[var(--as-shadow-sm)] backdrop-blur">
            <span className={`as-pill ${editable ? "text-[var(--as-primary)]" : ""}`}>
              <span className="as-dot" aria-hidden="true" />
              {editable ? "Draw mode" : "Saved boundary"}
            </span>
            <span className="as-pill">Vertices: {points.length}</span>
          </div>
          <div className="pointer-events-auto rounded-2xl border border-[var(--as-border)] bg-white/90 px-3 py-2 text-xs font-bold text-[var(--as-ink-muted)] shadow-[var(--as-shadow-sm)] backdrop-blur">
            MapLibre
          </div>
        </div>
        {!mapLoaded ? (
          <div className="absolute bottom-4 left-4 rounded-[var(--as-radius-md)] bg-white px-3 py-2 text-sm font-semibold text-[var(--as-primary)] shadow-[var(--as-shadow-sm)]">
            กำลังโหลดแผนที่...
          </div>
        ) : null}
        {mapError ? (
          <div className="absolute bottom-4 left-4 max-w-sm rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--as-danger)] shadow-[var(--as-shadow-sm)]">
            {mapError}
          </div>
        ) : null}
        {geolocationAvailable ? (
          <button
            type="button"
            onClick={locateMe}
            className="absolute bottom-4 right-4 min-h-11 rounded-[var(--as-radius-sm)] border border-[var(--as-border)] bg-white/92 px-4 text-sm font-bold text-[var(--as-primary)] shadow-[var(--as-shadow-sm)] backdrop-blur transition hover:bg-[var(--as-surface-soft)]"
          >
            ใช้ตำแหน่งฉัน
          </button>
        ) : null}
        {locationStatus ? (
          <div className="absolute bottom-4 right-36 rounded-[var(--as-radius-sm)] border border-[var(--as-border)] bg-white/92 px-3 py-2 text-sm text-[var(--as-ink-muted)] shadow-[var(--as-shadow-sm)]">
            {locationStatus}
          </div>
        ) : null}
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-white/80 p-2 shadow-[var(--as-shadow-sm)]">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPoints((current) => current.slice(0, -1))}
            disabled={!points.length}
          >
            Undo
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => setPoints([])} disabled={!points.length}>
            Delete polygon
          </Button>
          <span className="self-center text-sm text-[var(--as-ink-muted)]">
            Click the map to add vertices. Drag markers to edit before saving.
          </span>
        </div>
      ) : null}
    </section>
  );
}
