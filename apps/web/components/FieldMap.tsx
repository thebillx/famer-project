"use client";

import maplibregl, { LngLatBounds, Map, Marker } from "maplibre-gl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GeoJsonPolygon } from "../lib/types";
import { Button } from "./Button";
import { FormInput } from "./Primitives";

type LngLat = [number, number];
type EntryMode = "map" | "coordinates";

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const THAILAND_CENTER: LngLat = [100.5232, 13.7367];
const THAILAND_ZOOM = 5.4;
const THAILAND_BOUNDS: [LngLat, LngLat] = [
  [97.34, 5.61],
  [105.64, 20.47]
];
const THAILAND_BOUNDS_ERROR = "พิกัดต้องอยู่ในกรอบพื้นที่ให้บริการประเทศไทยโดยประมาณ";

function isWithinThailandBounds([longitude, latitude]: LngLat) {
  return (
    longitude >= THAILAND_BOUNDS[0][0] &&
    longitude <= THAILAND_BOUNDS[1][0] &&
    latitude >= THAILAND_BOUNDS[0][1] &&
    latitude <= THAILAND_BOUNDS[1][1]
  );
}

function closedPolygon(points: LngLat[]): GeoJsonPolygon {
  return { type: "Polygon", coordinates: [[...points, points[0]]] };
}

function drawingInstruction(mode: EntryMode, pointCount: number) {
  if (mode === "coordinates") {
    return pointCount >= 3
      ? "ขอบเขตพร้อมบันทึก คุณยังเพิ่มพิกัดหรือลากจุดบนแผนที่เพื่อปรับได้"
      : `กรอกพิกัดด้านล่างอีก ${Math.max(3 - pointCount, 1)} จุดเพื่อสร้างขอบเขต`;
  }
  if (pointCount === 0) return "แตะบนแผนที่เพื่อเพิ่มจุดที่ 1";
  if (pointCount === 1) return "แตะบนแผนที่เพื่อเพิ่มจุดที่ 2";
  if (pointCount === 2) return "เพิ่มอีก 1 จุดเพื่อสร้างขอบเขต";
  return "ขอบเขตพร้อมบันทึก เพิ่มจุดต่อหรือลากหมุดเพื่อปรับได้";
}

export function FieldMap({
  initialGeometry,
  onGeometryChange,
  onPointCountChange,
  editable = false
}: {
  initialGeometry?: GeoJsonPolygon;
  onGeometryChange?: (geometry: GeoJsonPolygon | null) => void;
  onPointCountChange?: (count: number) => void;
  editable?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const dragStateRef = useRef({ dragging: false, markerDragging: false });
  const entryModeRef = useRef<EntryMode>("map");
  const [entryMode, setEntryMode] = useState<EntryMode>("map");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [geolocationAvailable, setGeolocationAvailable] = useState(false);
  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [points, setPoints] = useState<LngLat[]>(() =>
    initialGeometry ? (initialGeometry.coordinates[0].slice(0, -1) as LngLat[]) : []
  );
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_STYLE_URL;

  const changeEntryMode = (mode: EntryMode) => {
    entryModeRef.current = mode;
    setEntryMode(mode);
    setCoordinateError(null);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: points[0] ?? THAILAND_CENTER,
      zoom: points.length ? 14 : THAILAND_ZOOM,
      maxBounds: editable ? THAILAND_BOUNDS : undefined,
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
      if (!editable || entryModeRef.current !== "map") return;
      if (dragStateRef.current.dragging || dragStateRef.current.markerDragging) return;
      const target = event.originalEvent.target as HTMLElement | null;
      if (target?.closest(".maplibregl-ctrl, .maplibregl-marker")) return;
      const point: LngLat = [event.lngLat.lng, event.lngLat.lat];
      if (!isWithinThailandBounds(point)) {
        setCoordinateError(THAILAND_BOUNDS_ERROR);
        return;
      }
      setCoordinateError(null);
      setPoints((current) => [...current, point]);
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
    onPointCountChange?.(points.length);
    onGeometryChange?.(points.length >= 3 ? closedPolygon(points) : null);
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    renderGeometry(map, points);
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (editable) {
      points.forEach((point, index) => {
        const element = document.createElement("div");
        element.className = "as-field-vertex-marker";
        element.textContent = String(index + 1);
        element.setAttribute("aria-hidden", "true");
        const marker = new maplibregl.Marker({ element, draggable: true })
          .setLngLat(point)
          .addTo(map);
        marker.on("dragstart", () => {
          dragStateRef.current.markerDragging = true;
        });
        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          const nextPoint: LngLat = [lngLat.lng, lngLat.lat];
          if (!isWithinThailandBounds(nextPoint)) {
            marker.setLngLat(point);
            setCoordinateError(THAILAND_BOUNDS_ERROR);
            window.setTimeout(() => {
              dragStateRef.current.markerDragging = false;
            }, 0);
            return;
          }
          setCoordinateError(null);
          setPoints((current) =>
            current.map((existing, existingIndex) =>
              existingIndex === index ? nextPoint : existing
            )
          );
          window.setTimeout(() => {
            dragStateRef.current.markerDragging = false;
          }, 0);
        });
        markersRef.current.push(marker);
      });
    }
  }, [editable, mapLoaded, onGeometryChange, onPointCountChange, points]);

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
    setLocationStatus("กำลังค้นหาตำแหน่ง…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: LngLat = [position.coords.longitude, position.coords.latitude];
        if (!isWithinThailandBounds(point)) {
          setLocationStatus("ตำแหน่งปัจจุบันอยู่นอกกรอบพื้นที่ให้บริการประเทศไทยโดยประมาณ");
          return;
        }
        setLocationStatus(null);
        mapRef.current?.flyTo({
          center: point,
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

  function addCoordinatePoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latitude = Number(latitudeInput.trim());
    const longitude = Number(longitudeInput.trim());
    if (!latitudeInput.trim() || !longitudeInput.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setCoordinateError("กรุณากรอกละติจูดและลองจิจูดเป็นเลขทศนิยม");
      return;
    }
    const point: LngLat = [longitude, latitude];
    if (!isWithinThailandBounds(point)) {
      setCoordinateError(THAILAND_BOUNDS_ERROR);
      return;
    }
    const duplicate = points.some(
      ([existingLongitude, existingLatitude]) =>
        Math.abs(existingLongitude - longitude) < 1e-9 && Math.abs(existingLatitude - latitude) < 1e-9
    );
    if (duplicate) {
      setCoordinateError("พิกัดนี้ถูกเพิ่มแล้ว");
      return;
    }

    setPoints((current) => [...current, point]);
    setLatitudeInput("");
    setLongitudeInput("");
    setCoordinateError(null);
    const map = mapRef.current;
    if (map) {
      map.jumpTo({ center: point, zoom: Math.max(map.getZoom(), 16) });
    }
    window.requestAnimationFrame(() => {
      document.getElementById("field-coordinate-latitude")?.focus();
    });
  }

  function removePoint(index: number) {
    setCoordinateError(null);
    setPoints((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <section className="space-y-3">
      {editable ? (
        <div className="rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-[var(--as-surface)] p-2 shadow-[var(--as-shadow-sm)]">
          <p className="px-2 pb-2 text-sm font-bold text-[var(--as-ink)]">เลือกวิธีกำหนดขอบเขต</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="วิธีกำหนดขอบเขตแปลง">
            <button
              type="button"
              className="as-field-entry-mode"
              aria-pressed={entryMode === "map"}
              onClick={() => changeEntryMode("map")}
            >
              <strong>วาดบนแผนที่</strong>
              <span>แตะตามมุมของแปลง</span>
            </button>
            <button
              type="button"
              className="as-field-entry-mode"
              aria-pressed={entryMode === "coordinates"}
              onClick={() => changeEntryMode("coordinates")}
            >
              <strong>กรอกพิกัด</strong>
              <span>ละติจูด / ลองจิจูด</span>
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="relative overflow-hidden rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-surface-map)] shadow-[var(--as-shadow-lg)]"
        data-entry-mode={editable ? entryMode : undefined}
      >
        <div
          ref={containerRef}
          className="bg-[var(--as-surface-map)]"
          style={{ height: "62vh", minHeight: 420 }}
          aria-label="Field map"
          data-map-style-url={styleUrl}
          data-vertex-count={points.length}
          data-map-bounds={editable ? "97.34,5.61,105.64,20.47" : undefined}
        />
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[min(82%,34rem)] rounded-2xl border border-[var(--as-border)] bg-white/94 px-3 py-2 shadow-[var(--as-shadow-sm)] backdrop-blur">
            <p className="text-xs font-bold text-[var(--as-primary)]">
              {editable ? `กำหนดขอบเขต · ${points.length} จุด` : "ขอบเขตที่บันทึกแล้ว"}
            </p>
            {editable ? (
              <p role="status" className="mt-1 text-xs leading-5 text-[var(--as-ink-muted)]">
                {drawingInstruction(entryMode, points.length)}
              </p>
            ) : null}
          </div>
        </div>

        {!mapLoaded ? (
          <div className="absolute bottom-4 left-4 rounded-[var(--as-radius-md)] bg-white px-3 py-2 text-sm font-semibold text-[var(--as-primary)] shadow-[var(--as-shadow-sm)]">
            กำลังโหลดแผนที่…
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
            ไปที่ตำแหน่งฉัน
          </button>
        ) : null}
        {locationStatus ? (
          <div className="absolute bottom-16 right-4 max-w-xs rounded-[var(--as-radius-sm)] border border-[var(--as-border)] bg-white/94 px-3 py-2 text-sm text-[var(--as-ink-muted)] shadow-[var(--as-shadow-sm)]">
            {locationStatus}
          </div>
        ) : null}
      </div>

      {editable ? (
        <div className="space-y-3">
          {coordinateError ? (
            <p
              role="alert"
              className="rounded-[var(--as-radius-sm)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--as-danger)]"
            >
              {coordinateError}
            </p>
          ) : null}

          {entryMode === "coordinates" ? (
            <section
              className="rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-[var(--as-surface)] p-4 shadow-[var(--as-shadow-sm)]"
              aria-label="เพิ่มจุดด้วยพิกัด"
            >
              <h2 className="font-bold text-[var(--as-primary)]">เพิ่มจุดด้วยพิกัด</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--as-ink-muted)]">
                กรอก WGS84 แบบทศนิยมตามลำดับรอบขอบเขตอย่างน้อย 3 จุด ระบบจะปิดรูปให้อัตโนมัติเมื่อบันทึก
              </p>
              <form className="mt-4 space-y-3" noValidate onSubmit={addCoordinatePoint}>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormInput
                    id="field-coordinate-latitude"
                    label="ละติจูด"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={THAILAND_BOUNDS[0][1]}
                    max={THAILAND_BOUNDS[1][1]}
                    value={latitudeInput}
                    onChange={(event) => setLatitudeInput(event.target.value)}
                    hint="เช่น 18.7901"
                    aria-required="true"
                  />
                  <FormInput
                    label="ลองจิจูด"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={THAILAND_BOUNDS[0][0]}
                    max={THAILAND_BOUNDS[1][0]}
                    value={longitudeInput}
                    onChange={(event) => setLongitudeInput(event.target.value)}
                    hint="เช่น 98.9801"
                    aria-required="true"
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  เพิ่มจุดที่ {points.length + 1}
                </Button>
              </form>

              {points.length ? (
                <ol aria-label="รายการจุดพิกัด" className="mt-4 grid gap-2 text-sm text-[var(--as-ink-muted)]">
                  {points.map(([longitude, latitude], index) => (
                    <li
                      key={`${longitude}-${latitude}-${index}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--as-radius-sm)] bg-[var(--as-surface-soft)] px-3 py-2"
                    >
                      <span>
                        <strong className="text-[var(--as-ink)]">จุด {index + 1}</strong>
                        {` · ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`}
                      </span>
                      <button
                        type="button"
                        className="min-h-11 min-w-11 rounded-[var(--as-radius-sm)] px-2 font-bold text-[var(--as-danger)] hover:bg-[var(--as-danger-soft)]"
                        aria-label={`ลบจุดที่ ${index + 1}`}
                        onClick={() => removePoint(index)}
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : (
            <p className="rounded-[var(--as-radius-md)] bg-[var(--as-surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--as-ink-muted)]">
              แตะตามมุมของแปลงอย่างน้อย 3 จุด คุณสามารถลากหมายเลขบนแผนที่เพื่อปรับตำแหน่งได้
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-[var(--as-surface)] p-2 shadow-[var(--as-shadow-sm)]">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setCoordinateError(null);
                setPoints((current) => current.slice(0, -1));
              }}
              disabled={!points.length}
            >
              ย้อนกลับ 1 จุด
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCoordinateError(null);
                setPoints([]);
              }}
              disabled={!points.length}
            >
              ล้างขอบเขต
            </Button>
            <span className="self-center text-sm text-[var(--as-ink-muted)]">
              {points.length >= 3 ? "ขอบเขตพร้อมบันทึก" : `ต้องมีอย่างน้อย 3 จุด · ตอนนี้ ${points.length} จุด`}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
