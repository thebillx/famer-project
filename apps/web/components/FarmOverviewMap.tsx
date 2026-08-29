"use client";

import maplibregl, { LngLatBounds, type ExpressionSpecification, type IControl, type Map } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { FieldBoundary } from "../lib/types";
import styles from "./map-workspace.module.css";

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const EMPTY_PRIORITY_FIELD_IDS: string[] = [];

export function FarmOverviewMap({
  fields,
  selectedFieldId,
  onSelect,
  ariaLabel = "Field map",
  visibleFieldIds = null,
  priorityFieldIds = EMPTY_PRIORITY_FIELD_IDS,
  contextLabel,
  contextDetail,
  emptyMessage,
  emptyDetail
}: {
  fields: FieldBoundary[];
  selectedFieldId: string | null;
  onSelect?: (fieldId: string) => void;
  ariaLabel?: string;
  visibleFieldIds?: string[] | null;
  priorityFieldIds?: string[];
  contextLabel?: string;
  contextDetail?: string;
  emptyMessage?: string;
  emptyDetail?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const fieldsRef = useRef(fields);
  const selectedFieldIdRef = useRef(selectedFieldId);
  const visibleFieldIdsRef = useRef(visibleFieldIds);
  const priorityFieldIdsRef = useRef(priorityFieldIds);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_STYLE_URL;
  const selected = fields.find((field) => field.id === selectedFieldId) ?? null;
  const selectedIsPriority = selected ? priorityFieldIds.includes(selected.id) : false;
  const selectedVertexCount = selected
    ? Math.max(0, (selected.geometry.coordinates[0]?.length ?? 1) - 1)
    : 0;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  fieldsRef.current = fields;
  selectedFieldIdRef.current = selectedFieldId;
  visibleFieldIdsRef.current = visibleFieldIds;
  priorityFieldIdsRef.current = priorityFieldIds;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const firstPoint = fields[0]?.geometry.coordinates[0]?.[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: firstPoint ? [firstPoint[0], firstPoint[1]] : [100.5232, 13.7367],
      zoom: firstPoint ? 14 : 5.4,
      attributionControl: { compact: true }
    });
    map.addControl(new FieldWorkspaceControl(fieldsRef), "top-right");
    map.on("load", () => {
      map.resize();
      setError(false);
      setLoaded(true);
      installFieldLayers(
        map,
        fieldsRef.current,
        selectedFieldIdRef.current,
        visibleFieldIdsRef.current,
        priorityFieldIdsRef.current
      );
      fitFields(map, fieldsRef.current, selectedFieldIdRef.current);
      markMapSynchronized(containerRef.current, map, selectedFieldIdRef.current);
    });
    map.on("click", "farm-fields-fill", (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") onSelectRef.current?.(id);
    });
    map.on("mouseenter", "farm-fields-fill", () => {
      map.getCanvas().style.cursor = onSelectRef.current ? "pointer" : "";
    });
    map.on("mouseleave", "farm-fields-fill", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("error", () => {
      if (!map.isStyleLoaded()) setError(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !map.getSource("farm-fields") ||
      !map.getLayer("farm-fields-fill") ||
      !map.getLayer("farm-fields-line")
    ) return;
    updateFieldSource(map, fields, visibleFieldIds, priorityFieldIds);
    setSelectedPaint(map, selectedFieldId);
    map.resize();
    fitFields(map, fields, selectedFieldId);
    markMapSynchronized(containerRef.current, map, selectedFieldId);
  }, [fields, priorityFieldIds, selectedFieldId, visibleFieldIds]);

  return (
    <div className={styles.mapFill}>
      <div
        ref={containerRef}
        className={styles.mapFill}
        aria-label={ariaLabel}
        data-field-count={fields.length}
        data-selected-field-id={selectedFieldId ?? undefined}
        data-vertex-count={selectedVertexCount}
        data-visible-field-count={visibleFieldIds?.length ?? fields.length}
        data-priority-field-count={priorityFieldIds.length}
        data-selected-field-priority={selected ? String(selectedIsPriority) : undefined}
      />
      {contextLabel ? (
        <div className={styles.mapContext} aria-label="บริบทพื้นที่บนแผนที่">
          <strong>{contextLabel}</strong>
          {contextDetail ? <span>{contextDetail}</span> : null}
        </div>
      ) : null}
      {loaded && !error && fields.length === 0 && emptyMessage ? (
        <div className={styles.mapEmpty} role="status">
          <strong>{emptyMessage}</strong>
          {emptyDetail ? <span>{emptyDetail}</span> : null}
        </div>
      ) : null}
      {!loaded && !error ? <div className={styles.loading} role="status">กำลังโหลดแผนที่...</div> : null}
      {error ? (
        <div className={styles.notice} role="alert">
          <h2>โหลดแผนที่พื้นฐานไม่สำเร็จ</h2>
          <p>ข้อมูลแปลงยังอยู่ครบ กรุณาตรวจสอบการเชื่อมต่อแผนที่แล้วลองใหม่</p>
        </div>
      ) : null}
    </div>
  );
}

function markMapSynchronized(
  container: HTMLDivElement | null,
  map: Map,
  selectedFieldId: string | null
) {
  if (!container) return;
  container.dataset.mapLayersReady = map.getLayer("farm-fields-fill") ? "true" : "false";
  container.dataset.mapSyncedFieldId = selectedFieldId ?? "";
}

class FieldWorkspaceControl implements IControl {
  private container: HTMLElement | null = null;
  private labelsVisible = true;

  constructor(private readonly fieldsRef: { current: FieldBoundary[] }) {}

  onAdd(map: Map): HTMLElement {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl agri-map-controls";
    const labelsButton = this.addButton("สลับชื่อแปลงบนแผนที่", "◇", () => this.toggleLabels(map));
    labelsButton.setAttribute("aria-pressed", "true");
    this.addButton("ปรับมุมมองให้เห็นแปลงทั้งหมด", "⌾", () => fitFields(map, this.fieldsRef.current, null));
    this.addButton("ขยายแผนที่", "+", () => map.zoomIn());
    this.addButton("ย่อแผนที่", "−", () => map.zoomOut());
    return this.container;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = null;
  }

  private addButton(label: string, glyph: string, onClick: () => void): HTMLButtonElement {
    if (!this.container) throw new Error("Map controls are not mounted");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = glyph;
    button.addEventListener("click", onClick);
    this.container.append(button);
    return button;
  }

  private toggleLabels(map: Map): void {
    this.labelsVisible = !this.labelsVisible;
    if (map.getLayer("farm-fields-labels")) {
      map.setLayoutProperty("farm-fields-labels", "visibility", this.labelsVisible ? "visible" : "none");
    }
    const button = this.container?.querySelector<HTMLButtonElement>("button");
    button?.setAttribute("aria-pressed", String(this.labelsVisible));
    button?.setAttribute("aria-label", this.labelsVisible ? "ซ่อนชื่อแปลงบนแผนที่" : "แสดงชื่อแปลงบนแผนที่");
  }
}

function fieldCollection(
  fields: FieldBoundary[],
  visibleFieldIds: string[] | null,
  priorityFieldIds: string[]
) {
  const visible = visibleFieldIds ? new Set(visibleFieldIds) : null;
  const priority = new Set(priorityFieldIds);
  return {
    type: "FeatureCollection" as const,
    features: fields.map((field) => ({
      type: "Feature" as const,
      properties: {
        id: field.id,
        name: field.name,
        priority: priority.has(field.id),
        dimmed: visible ? !visible.has(field.id) : false
      },
      geometry: field.geometry
    }))
  };
}

function installFieldLayers(
  map: Map,
  fields: FieldBoundary[],
  selectedFieldId: string | null,
  visibleFieldIds: string[] | null,
  priorityFieldIds: string[]
) {
  map.addSource("farm-fields", {
    type: "geojson",
    data: fieldCollection(fields, visibleFieldIds, priorityFieldIds)
  });
  map.addLayer({
    id: "farm-fields-fill",
    type: "fill",
    source: "farm-fields",
    paint: {
      "fill-color": fieldColorExpression(selectedFieldId),
      "fill-opacity": fieldFillOpacityExpression(selectedFieldId)
    }
  });
  map.addLayer({
    id: "farm-fields-line",
    type: "line",
    source: "farm-fields",
    paint: {
      "line-color": fieldLineColorExpression(selectedFieldId),
      "line-width": fieldLineWidthExpression(selectedFieldId),
      "line-opacity": fieldLineOpacityExpression(selectedFieldId)
    }
  });
  if (map.getStyle().glyphs) {
    try {
      map.addLayer({
        id: "farm-fields-labels",
        type: "symbol",
        source: "farm-fields",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true
        },
        paint: {
          "text-color": ["case", ["==", ["get", "id"], selectedFieldId ?? ""], "#202a24", "#5f6b63"],
          "text-halo-color": "#dde3d5",
          "text-halo-width": 1,
          "text-opacity": fieldLabelOpacityExpression(selectedFieldId)
        }
      });
    } catch {
      // Field labels are optional; geometry and spatial fit must still load.
    }
  }
}

function updateFieldSource(
  map: Map,
  fields: FieldBoundary[],
  visibleFieldIds: string[] | null,
  priorityFieldIds: string[]
) {
  const source = map.getSource("farm-fields") as maplibregl.GeoJSONSource | undefined;
  source?.setData(fieldCollection(fields, visibleFieldIds, priorityFieldIds));
}

function setSelectedPaint(map: Map, selectedFieldId: string | null) {
  if (!map.getLayer("farm-fields-fill")) return;
  map.setPaintProperty("farm-fields-fill", "fill-color", fieldColorExpression(selectedFieldId));
  map.setPaintProperty("farm-fields-fill", "fill-opacity", fieldFillOpacityExpression(selectedFieldId));
  map.setPaintProperty("farm-fields-line", "line-color", fieldLineColorExpression(selectedFieldId));
  map.setPaintProperty("farm-fields-line", "line-width", fieldLineWidthExpression(selectedFieldId));
  map.setPaintProperty("farm-fields-line", "line-opacity", fieldLineOpacityExpression(selectedFieldId));
  if (map.getLayer("farm-fields-labels")) {
    map.setPaintProperty("farm-fields-labels", "text-color", [
      "case", ["==", ["get", "id"], selectedFieldId ?? ""], "#202a24", "#5f6b63"
    ]);
    map.setPaintProperty("farm-fields-labels", "text-opacity", fieldLabelOpacityExpression(selectedFieldId));
  }
}

function selectedExpression(selectedFieldId: string | null): ExpressionSpecification {
  return ["==", ["get", "id"], selectedFieldId ?? ""];
}

function priorityExpression(): ExpressionSpecification {
  return ["==", ["get", "priority"], true];
}

function fieldColorExpression(selectedFieldId: string | null): ExpressionSpecification {
  return ["case", selectedExpression(selectedFieldId), "#ab7d4a", priorityExpression(), "#ab7d4a", "#8a978c"];
}

function fieldFillOpacityExpression(selectedFieldId: string | null): ExpressionSpecification {
  return [
    "case",
    ["get", "dimmed"], 0.012,
    ["all", selectedExpression(selectedFieldId), priorityExpression()], 0.18,
    selectedExpression(selectedFieldId), 0.12,
    priorityExpression(), 0.08,
    0.025
  ];
}

function fieldLineColorExpression(selectedFieldId: string | null): ExpressionSpecification {
  return ["case", selectedExpression(selectedFieldId), "#202a24", priorityExpression(), "#ab7d4a", "#8a978c"];
}

function fieldLineWidthExpression(selectedFieldId: string | null): ExpressionSpecification {
  return ["case", selectedExpression(selectedFieldId), 2.2, priorityExpression(), 1.4, 1.1];
}

function fieldLineOpacityExpression(selectedFieldId: string | null): ExpressionSpecification {
  return ["case", ["get", "dimmed"], 0.22, selectedExpression(selectedFieldId), 1, priorityExpression(), 0.86, 0.78];
}

function fieldLabelOpacityExpression(selectedFieldId: string | null): ExpressionSpecification {
  return ["case", ["get", "dimmed"], 0.24, selectedExpression(selectedFieldId), 1, 0.78];
}

function fitFields(map: Map, fields: FieldBoundary[], selectedFieldId: string | null) {
  const selected = fields.find((field) => field.id === selectedFieldId);
  const candidates = fields.length > 1 ? fields : selected ? [selected] : fields;
  const points = candidates.flatMap((field) => field.geometry.coordinates[0] ?? []);
  if (!points.length) return;
  const bounds = new LngLatBounds([points[0][0], points[0][1]], [points[0][0], points[0][1]]);
  points.forEach(([longitude, latitude]) => bounds.extend([longitude, latitude]));
  map.fitBounds(bounds, { padding: selected ? 120 : 80, maxZoom: 16, duration: 0 });
}
