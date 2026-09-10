"use client";

import maplibregl, { LngLatBounds, type Map } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldBoundary, GeoJsonMultiPolygon } from "../lib/types";
import { unionBounds, type SpatialBounds } from "../lib/spatial-registration";
import styles from "./observation-workspace.module.css";

type SpatialImage = { url: string; bounds: SpatialBounds };
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

function fieldBounds(field: FieldBoundary): SpatialBounds {
  const ring = field.geometry.coordinates[0] ?? [];
  return [
    Math.min(...ring.map(([longitude]) => longitude)),
    Math.min(...ring.map(([, latitude]) => latitude)),
    Math.max(...ring.map(([longitude]) => longitude)),
    Math.max(...ring.map(([, latitude]) => latitude)),
  ];
}

function path(ctx: CanvasRenderingContext2D, map: Map, ring: number[][]) {
  ring.forEach(([longitude, latitude], index) => {
    const point = map.project([longitude, latitude]);
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function polygon(ctx: CanvasRenderingContext2D, map: Map, rings: number[][][]) {
  ctx.beginPath();
  rings.forEach((ring) => path(ctx, map, ring));
  ctx.fill("evenodd");
  ctx.stroke();
}

function placement(map: Map, bounds: SpatialBounds) {
  const northWest = map.project([bounds[0], bounds[3]]);
  const southEast = map.project([bounds[2], bounds[1]]);
  return { x: northWest.x, y: northWest.y, width: southEast.x - northWest.x, height: southEast.y - northWest.y };
}

function draw(
  canvas: HTMLCanvasElement,
  map: Map,
  field: FieldBoundary,
  before: SpatialImage | undefined,
  after: SpatialImage | undefined,
  beforeImage: HTMLImageElement | undefined,
  afterImage: HTMLImageElement | undefined,
  overlayBefore: HTMLImageElement | undefined,
  overlayAfter: HTMLImageElement | undefined,
  change: GeoJsonMultiPolygon | null | undefined,
  split: number,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const container = map.getContainer();
  canvas.width = Math.max(1, container.clientWidth);
  canvas.height = Math.max(1, container.clientHeight);
  context.clearRect(0, 0, canvas.width, canvas.height);
  const fieldExtent = fieldBounds(field);
  const firstBounds = before?.bounds ?? fieldExtent;
  const first = placement(map, firstBounds);
  if (beforeImage) context.drawImage(beforeImage, first.x, first.y, first.width, first.height);
  if (afterImage && after) {
    const second = placement(map, after.bounds);
    context.save();
    context.beginPath();
    context.rect(canvas.width * split / 100, 0, canvas.width, canvas.height);
    context.clip();
    context.drawImage(afterImage, second.x, second.y, second.width, second.height);
    context.restore();
  }
  const clipToField = () => {
    context.beginPath();
    field.geometry.coordinates.forEach((ring) => path(context, map, ring));
    context.clip("evenodd");
  };
  if (overlayBefore) {
    context.save(); clipToField(); context.globalAlpha = 0.82;
    context.drawImage(overlayBefore, first.x, first.y, first.width, first.height); context.restore();
  }
  if (overlayAfter && after) {
    const second = placement(map, after.bounds);
    context.save(); context.beginPath(); context.rect(canvas.width * split / 100, 0, canvas.width, canvas.height); context.clip(); clipToField();
    context.globalAlpha = 0.82; context.drawImage(overlayAfter, second.x, second.y, second.width, second.height); context.restore();
  }
  if (change) {
    context.fillStyle = "rgba(181, 91, 56, .38)"; context.strokeStyle = "#b55b38"; context.lineWidth = 1.5;
    change.coordinates.forEach((rings) => polygon(context, map, rings));
  }
  context.fillStyle = "rgba(181, 101, 67, .06)"; context.strokeStyle = "#f2eee0"; context.lineWidth = 2;
  polygon(context, map, field.geometry.coordinates);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("spatial image failed to load"));
    image.src = url;
  });
}

export function SpatialEvidenceMap({
  field, before, after, overlayBefore, overlayAfter, change, split = 50, label, renderKey,
}: {
  field: FieldBoundary;
  before?: SpatialImage;
  after?: SpatialImage;
  overlayBefore?: SpatialImage;
  overlayAfter?: SpatialImage;
  change?: GeoJsonMultiPolygon | null;
  split?: number;
  label: string;
  renderKey: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const imagesRef = useRef<{ before?: HTMLImageElement; after?: HTMLImageElement; overlayBefore?: HTMLImageElement; overlayAfter?: HTMLImageElement }>({});
  const epochRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const extent = useMemo(() => unionBounds([fieldBounds(field), ...(before ? [before.bounds] : []), ...(after ? [after.bounds] : [])]), [after?.bounds, before?.bounds, field]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement("canvas");
    canvas.className = styles.evidenceCanvas;
    canvas.dataset.evidenceCanvas = "true";
    container.appendChild(canvas); canvasRef.current = canvas;
    const map = new maplibregl.Map({
      container, style: STYLE_URL, center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2], zoom: 14,
      bearing: 0, pitch: 0, maxPitch: 0, dragRotate: false, touchPitch: false, attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation(); map.keyboard.disable(); mapRef.current = map;
    const onLoad = () => { map.resize(); map.fitBounds(new LngLatBounds([extent[0], extent[1]], [extent[2], extent[3]]), { padding: 0, duration: 0 }); setMapError(false); setMapReady(true); };
    const onError = () => setMapError(true);
    map.on("load", onLoad); map.on("error", onError);
    const resize = new ResizeObserver(() => map.resize()); resize.observe(container);
    return () => { resize.disconnect(); map.off("load", onLoad); map.off("error", onError); map.remove(); if (mapRef.current === map) mapRef.current = null; canvas.remove(); canvasRef.current = null; setMapReady(false); };
  }, [extent, retryToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.resize(); map.fitBounds(new LngLatBounds([extent[0], extent[1]], [extent[2], extent[3]]), { padding: 0, duration: 0 });
  }, [extent, mapReady]);

  useEffect(() => {
    const map = mapRef.current; const canvas = canvasRef.current; const epoch = ++epochRef.current;
    imagesRef.current = {}; setImageReady(false); setImageError(false);
    if (!map || !canvas || !mapReady) return;
    const drawCurrent = () => draw(canvas, map, field, before, after, imagesRef.current.before, imagesRef.current.after, imagesRef.current.overlayBefore, imagesRef.current.overlayAfter, change, split);
    const urls = [before, after, overlayBefore, overlayAfter].filter((item): item is SpatialImage => Boolean(item));
    if (!urls.length) { drawCurrent(); return; }
    void Promise.all(urls.map((item) => loadImage(item.url))).then((images) => {
      if (epochRef.current !== epoch) return;
      imagesRef.current = { before: before ? images[urls.indexOf(before)] : undefined, after: after ? images[urls.indexOf(after)] : undefined, overlayBefore: overlayBefore ? images[urls.indexOf(overlayBefore)] : undefined, overlayAfter: overlayAfter ? images[urls.indexOf(overlayAfter)] : undefined };
      drawCurrent(); setImageReady(true);
    }).catch(() => { if (epochRef.current === epoch) setImageError(true); });
    map.on("move", drawCurrent); map.on("resize", drawCurrent);
    return () => { epochRef.current++; map.off("move", drawCurrent); map.off("resize", drawCurrent); };
  }, [after, before, change, field, mapReady, overlayAfter, overlayBefore, split]);

  return <div ref={containerRef} className={styles.spatialMap} role="img" aria-label={label} data-spatial-extent={extent.join(",")} data-field-id={field.id} data-render-key={renderKey} data-map-ready={mapReady ? "true" : "false"} data-image-ready={imageReady ? "true" : "false"} data-map-error={mapError ? "true" : "false"}>
    {mapError ? <div className={styles.mapError} role="alert"><strong>แผนที่โหลดไม่สำเร็จ</strong><button type="button" onClick={() => { setMapError(false); setMapReady(false); setRetryToken((value) => value + 1); }}>ลองแผนที่อีกครั้ง</button></div> : null}
    {imageError ? <div className={styles.mapError} role="alert"><strong>โหลดภาพประกอบไม่สำเร็จ</strong><span>ขอบเขตแปลงยังแสดงอยู่บนแผนที่</span></div> : null}
  </div>;
}
