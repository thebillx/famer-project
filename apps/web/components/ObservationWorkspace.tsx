"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiFetchBlob } from "../lib/api";
import type { FieldBoundary, FieldChange, Observation, ObservationNdviSummary, ObservationRaster } from "../lib/types";
import { SpatialEvidenceMap } from "./SpatialEvidenceMap";
import styles from "./observation-workspace.module.css";

type Mode = "satellite" | "ndvi" | "change";
type Assets = { requestKey?: string; preview?: string; raster?: string; summary?: ObservationNdviSummary; rasterMeta?: ObservationRaster; error?: unknown };
const TERMINAL_AUTH = new Set(["authentication_required", "invalid_refresh_token"]);
const TERMINATED_EVENT = "agriscope:protected-workspace-terminated";
const thaiDate = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const shortDate = (value: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(value));
const cloudLabel = (value: number | null) => value === null ? "ไม่ระบุ" : `${Math.round(value)}%`;
const revoke = (url?: string) => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); };
const fieldBounds = (field: FieldBoundary): [number, number, number, number] => {
  const ring = field.geometry.coordinates[0] ?? [];
  return [Math.min(...ring.map(([x]) => x)), Math.min(...ring.map(([, y]) => y)), Math.max(...ring.map(([x]) => x)), Math.max(...ring.map(([, y]) => y))];
};

function announceAuth(error: unknown) {
  if (error instanceof ApiError && TERMINAL_AUTH.has(error.code)) window.dispatchEvent(new Event(TERMINATED_EVENT));
}

function useProtectedWorkspaceTermination() {
  const client = useQueryClient();
  const [terminated, setTerminated] = useState(false);
  useEffect(() => {
    const stop = () => { setTerminated(true); void client.cancelQueries(); client.clear(); };
    window.addEventListener(TERMINATED_EVENT, stop);
    return () => window.removeEventListener(TERMINATED_EVENT, stop);
  }, [client]);
  return terminated;
}

function useObservationAssets(fieldId: string, observation: Observation | undefined, mode: Mode) {
  const [assets, setAssets] = useState<Assets>({});
  const [loading, setLoading] = useState(false);
  const assetsRef = useRef<Assets>({});
  const epochRef = useRef(0);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => {
    const epoch = ++epochRef.current;
    setAssets((old) => { revoke(old.preview); revoke(old.raster); return {}; });
    setLoading(false);
    if (!observation || observation.status === "UNAVAILABLE") return;
    const requests: Promise<void>[] = [];
    const requestKey = `${fieldId}:${observation.observation_id}:${observation.acquired_at}:${mode}`;
    setLoading(true);
    if (observation.imagery_available) {
      requests.push(apiFetchBlob(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/preview`).then((blob) => {
        if (epochRef.current !== epoch) return;
        const url = URL.createObjectURL(blob);
        setAssets((old) => old.requestKey === requestKey ? { ...old, preview: url } : { ...old, requestKey, preview: url });
      }).catch((error: unknown) => { announceAuth(error); if (epochRef.current === epoch) setAssets((old) => ({ ...old, error })); }));
    }
    if (observation.analysis_eligible) {
      requests.push(apiFetch<ObservationNdviSummary>(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-summary`).then((summary) => {
        if (summary.field_id !== fieldId || summary.observation_id !== observation.observation_id) throw new ApiError("ข้อมูลตอบกลับไม่ตรงกับพื้นที่ที่ร้องขอ", { status: null, code: "invalid_response", requestId: null });
        if (epochRef.current === epoch) setAssets((old) => ({ ...old, requestKey, summary }));
      }).catch((error: unknown) => { announceAuth(error); if (epochRef.current === epoch) setAssets((old) => ({ ...old, error })); }));
      requests.push(Promise.all([
        apiFetch<ObservationRaster>(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-raster`),
        mode === "ndvi" ? apiFetchBlob(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-raster/image`) : Promise.resolve(undefined),
      ]).then(([rasterMeta, blob]) => {
        if (rasterMeta.observation_id !== observation.observation_id) throw new ApiError("ข้อมูลตอบกลับไม่ตรงกับวันที่เลือก", { status: null, code: "invalid_response", requestId: null });
        if (epochRef.current !== epoch) return;
        const url = blob ? URL.createObjectURL(blob) : undefined;
        setAssets((old) => ({ ...old, requestKey, rasterMeta, raster: url }));
      }).catch((error: unknown) => { announceAuth(error); if (epochRef.current === epoch) setAssets((old) => ({ ...old, error })); }));
    }
    if (!requests.length) setLoading(false);
    else void Promise.all(requests).finally(() => { if (epochRef.current === epoch) setLoading(false); });
    return () => { epochRef.current++; };
  }, [fieldId, mode, observation?.acquired_at, observation?.analysis_eligible, observation?.imagery_available, observation?.observation_id, observation?.status]);
  useEffect(() => () => { epochRef.current++; revoke(assetsRef.current.preview); revoke(assetsRef.current.raster); }, []);
  return { assets, loading };
}

function ModeControl({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return <div className={styles.modeControl} aria-label="ชั้นข้อมูล">{(["satellite", "ndvi", "change"] as Mode[]).map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>{item === "satellite" ? "ภาพดาวเทียม" : item === "ndvi" ? "NDVI" : "พื้นที่เปลี่ยนแปลง"}</button>)}</div>;
}

function Timeline({ observations, selected, before, onSelect }: { observations: Observation[]; selected: string; before?: string; onSelect: (id: string) => void }) {
  return <div className={styles.timeline} aria-label="ช่วงเวลาที่ใช้วิเคราะห์"><span>ช่วงเวลาที่ใช้วิเคราะห์</span><div className={styles.timelineDates}>{observations.slice(0, 8).reverse().map((item) => <button key={item.observation_id} type="button" data-observation-id={item.observation_id} data-current={item.observation_id === selected} data-before={item.observation_id === before} onClick={() => onSelect(item.observation_id)}><i aria-hidden="true" /><strong>{shortDate(item.acquired_at)}</strong><small>{item.observation_id === selected ? "เลือก" : item.status === "POOR_QUALITY" ? "เมฆสูง" : item.comparison_eligible ? "ใช้เปรียบเทียบ" : item.analysis_eligible ? "ใช้วิเคราะห์" : "จำกัด"}</small></button>)}</div></div>;
}

function WorkspaceMessage({ title, body, login = false }: { title: string; body: string; login?: boolean }) {
  return <div className={styles.message} role="alert"><h1>{title}</h1><p>{body}</p>{login ? <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link> : null}</div>;
}

export function FieldAnalysisWorkspace({ field, observations }: { field: FieldBoundary; observations: Observation[] }) {
  const terminated = useProtectedWorkspaceTermination();
  const ordered = useMemo(() => [...observations].sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime()), [observations]);
  const usable = ordered.filter((item) => item.status === "USABLE");
  const eligible = usable.filter((item) => item.comparison_eligible);
  const [selectedId, setSelectedId] = useState(ordered[0]?.observation_id ?? "");
  const [mode, setMode] = useState<Mode>("satellite");
  useEffect(() => { if (!ordered.some((item) => item.observation_id === selectedId)) setSelectedId(ordered[0]?.observation_id ?? ""); }, [ordered, selectedId]);
  const selected = ordered.find((item) => item.observation_id === selectedId) ?? ordered[0];
  const before = eligible.find((item) => selected && new Date(item.acquired_at).getTime() < new Date(selected.acquired_at).getTime());
  const { assets, loading } = useObservationAssets(field.id, selected, mode);
  const [change, setChange] = useState<FieldChange | null>(null);
  const [changeError, setChangeError] = useState<unknown>(null);
  const changeEpoch = useRef(0);
  useEffect(() => {
    const epoch = ++changeEpoch.current; setChange(null); setChangeError(null);
    if (!before || !selected || selected.status !== "USABLE" || !selected.analysis_eligible) return;
    const query = new URLSearchParams({ before: before.observation_id, after: selected.observation_id });
    void apiFetch<FieldChange>(`/api/v1/fields/${field.id}/change?${query}`).then((data) => {
      if (data.field_id !== field.id || data.before_observation_id !== before.observation_id || data.after_observation_id !== selected.observation_id) throw new ApiError("ข้อมูลตอบกลับไม่ตรงกับช่วงเวลาที่เลือก", { status: null, code: "invalid_response", requestId: null });
      if (changeEpoch.current === epoch) setChange(data);
    }).catch((error: unknown) => { announceAuth(error); if (changeEpoch.current === epoch) setChangeError(error); });
    return () => { changeEpoch.current++; };
  }, [before?.observation_id, field.id, selected?.analysis_eligible, selected?.observation_id, selected?.status]);
  if (observations.some((item) => item.field_id !== field.id)) return <WorkspaceMessage title="ข้อมูลตอบกลับไม่ตรงกับแปลงที่เลือก" body="ระบบหยุดแสดงข้อมูลเพื่อป้องกันการเชื่อมข้อมูลข้ามแปลง" />;
  if (!observations.length) return <WorkspaceMessage title="ยังไม่มีประวัติภาพสำหรับแปลงนี้" body="เมื่อมีภาพที่ผ่านการตรวจคุณภาพ ประวัติการสังเกตจะแสดงที่นี่" />;
  if (terminated || [assets.error, changeError].some((error) => error instanceof ApiError && TERMINAL_AUTH.has(error.code))) return <WorkspaceMessage title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" body="ระบบหยุดแสดงข้อมูลแปลงเพื่อปกป้องข้อมูลขององค์กร" login />;
  if (!selected) return <WorkspaceMessage title="ยังไม่มีภาพสำหรับแปลงนี้" body="ลองค้นหาข้อมูลดาวเทียมอีกครั้งเมื่อมีข้อมูลพร้อมใช้งาน" />;
  const latestAcquired = ordered[0];
  const latestUsable = usable[0];
  const preview = assets.preview ? { url: assets.preview, bounds: fieldBounds(field) as [number, number, number, number] } : undefined;
  const raster = assets.rasterMeta && assets.raster ? { url: assets.raster, bounds: assets.rasterMeta.bounds } : undefined;
  const changeReady = change?.status === "USABLE" && change.geometry !== null ? change.geometry : null;
  const selectedState = selected.status === "POOR_QUALITY" ? "คุณภาพภาพต่ำ" : selected.status === "UNAVAILABLE" ? "ไม่มีภาพใช้งาน" : !selected.analysis_eligible ? "ประเมิน NDVI ไม่ได้" : selected.observation_id === latestAcquired?.observation_id ? "ภาพล่าสุดที่ได้มา" : "ภาพย้อนหลัง";
  return <div className={styles.analysis}>
    <aside className={styles.fieldRail}><h1>แปลง {field.name}</h1><p>{Number(field.area_rai).toFixed(1)} ไร่</p><div className={styles.railRule} /><small>ภาพล่าสุดที่ได้มา<br /><strong>{latestAcquired ? thaiDate(latestAcquired.acquired_at) : "—"}</strong></small><small>ล่าสุดที่ใช้วิเคราะห์ได้<br /><strong>{latestUsable ? thaiDate(latestUsable.acquired_at) : "ยังไม่มี"}</strong></small><small>ประวัติภาพ {observations.length} ครั้ง</small></aside>
    <section className={styles.canvas} aria-label="ภาพวิเคราะห์แปลง"><SpatialEvidenceMap field={field} before={preview} overlayBefore={mode === "ndvi" ? raster : undefined} change={mode === "change" ? changeReady : null} label={`${mode === "ndvi" ? "NDVI" : "ภาพดาวเทียม"} ของแปลง ${field.name}`} renderKey={`${selected.observation_id}:${mode}:${assets.rasterMeta?.bounds.join(",") ?? "pending"}`} /><div className={styles.scope}>← แปลง {field.name}<small>{Number(field.area_rai).toFixed(1)} ไร่</small></div><ModeControl mode={mode} setMode={setMode} />{mode === "ndvi" ? <div className={styles.legend}><strong>NDVI</strong><i aria-hidden="true" /><span>0.2　0.4　0.6　0.8+</span></div> : null}{loading ? <div className={styles.loading}>กำลังโหลดข้อมูลวันที่เลือก…</div> : null}{selected.status === "POOR_QUALITY" ? <div className={styles.quality}>ภาพวันที่เลือกมีเมฆปกคลุมสูง ({cloudLabel(selected.cloud_percent)}) แสดงภาพตัวอย่างได้ แต่ยังไม่ใช้คำนวณ NDVI</div> : null}{selected.status === "UNAVAILABLE" ? <div className={styles.quality}>ภาพวันที่เลือกยังไม่พร้อมใช้งาน</div> : null}{!selected.analysis_eligible && selected.status === "USABLE" ? <div className={styles.quality}>ยังยืนยันขอบเขตและแหล่งที่มาของภาพวันที่นี้ไม่ได้ จึงยังประเมิน NDVI ไม่ได้</div> : null}</section>
    <aside className={styles.inspector}><h2>แปลง {field.name}</h2><p>{thaiDate(selected.acquired_at)} · เมฆ {cloudLabel(selected.cloud_percent)}</p><span className={selected.status === "POOR_QUALITY" ? styles.statusClay : styles.statusNeutral}>{selectedState}</span><dl><div><dt>NDVI</dt><dd>{assets.summary?.ndvi_mean.toFixed(2) ?? "—"}</dd></div><div><dt>จากครั้งก่อน</dt><dd className={styles.clay}>{change?.status === "USABLE" && change.ndvi_delta !== null ? `${change.ndvi_delta > 0 ? "↑" : "↓"} ${Math.abs(change.ndvi_delta).toFixed(2)}` : "—"}</dd></div><div><dt>พื้นที่ที่เปลี่ยน</dt><dd>{change?.status === "USABLE" && change.changed_area_rai !== null ? `${change.changed_area_rai.toFixed(1)} ไร่` : "—"}</dd></div></dl>{before && selected.comparison_eligible ? <div className={styles.comparisonContext}><h3>เปรียบเทียบกับ</h3><p>{thaiDate(before.acquired_at)} → {thaiDate(selected.acquired_at)}</p>{change?.status === "NOT_ASSESSABLE" ? <p className={styles.note}>พื้นที่ร่วมที่ใช้วัดไม่เพียงพอ จึงยังสรุปการเปลี่ยนแปลงไม่ได้</p> : <Link className={styles.primaryAction} href={`/fields/${field.id}/compare?before=${before.observation_id}&after=${selected.observation_id}`}>เปรียบเทียบภาพ</Link>}</div> : <p className={styles.note}>ยังไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบกับภาพก่อนหน้า</p>}<div className={styles.inspectorRule} /><h3>ข้อมูลภาพ</h3><dl className={styles.meta}><div><dt>ภาพที่เลือก</dt><dd>{thaiDate(selected.acquired_at)}</dd></div><div><dt>แหล่งข้อมูล</dt><dd>{selected.source}</dd></div><div><dt>สถานะการวิเคราะห์</dt><dd>{selected.analysis_ready ? "พร้อมจาก cache" : selected.analysis_eligible ? "จะคำนวณเมื่อเรียกใช้" : "จำกัด"}</dd></div></dl><p className={styles.note}>ข้อมูลนี้แสดงการเปลี่ยนแปลงของสัญญาณพืชพรรณ และยังไม่สามารถระบุสาเหตุจากภาพดาวเทียมเพียงอย่างเดียว</p></aside>
    <Timeline observations={ordered} selected={selected.observation_id} before={before?.observation_id} onSelect={setSelectedId} />
  </div>;
}

export function CompareWorkspace({ field, observations, initialBefore, initialAfter }: { field: FieldBoundary; observations: Observation[]; initialBefore?: string; initialAfter?: string }) {
  const terminated = useProtectedWorkspaceTermination();
  const eligible = useMemo(() => [...observations].filter((item) => item.status === "USABLE" && item.comparison_eligible).sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime()), [observations]);
  const requestedAfter = eligible.find((item) => item.observation_id === initialAfter) ?? eligible[0];
  const requestedBefore = eligible.find((item) => item.observation_id === initialBefore && requestedAfter && new Date(item.acquired_at) < new Date(requestedAfter.acquired_at)) ?? eligible.find((item) => requestedAfter && new Date(item.acquired_at) < new Date(requestedAfter.acquired_at));
  const [beforeId, setBeforeId] = useState(requestedBefore?.observation_id ?? "");
  const [mode, setMode] = useState<Mode>("satellite");
  const [split, setSplit] = useState(50);
  const before = eligible.find((item) => item.observation_id === beforeId);
  const after = eligible.find((item) => item.observation_id === requestedAfter?.observation_id);
  const beforeAssets = useObservationAssets(field.id, before, mode); const afterAssets = useObservationAssets(field.id, after, mode);
  const [change, setChange] = useState<FieldChange | null>(null); const [changeError, setChangeError] = useState<unknown>(null); const epoch = useRef(0);
  useEffect(() => { const current = ++epoch.current; setChange(null); setChangeError(null); if (!before || !after) return; const query = new URLSearchParams({ before: before.observation_id, after: after.observation_id }); void apiFetch<FieldChange>(`/api/v1/fields/${field.id}/change?${query}`).then((data) => { if (data.field_id !== field.id || data.before_observation_id !== before.observation_id || data.after_observation_id !== after.observation_id) throw new ApiError("ข้อมูลตอบกลับไม่ตรงกับช่วงเวลาที่เลือก", { status: null, code: "invalid_response", requestId: null }); if (epoch.current === current) setChange(data); }).catch((error: unknown) => { announceAuth(error); if (epoch.current === current) setChangeError(error); }); return () => { epoch.current++; }; }, [after?.observation_id, before?.observation_id, field.id]);
  if (observations.some((item) => item.field_id !== field.id)) return <WorkspaceMessage title="ข้อมูลตอบกลับไม่ตรงกับแปลงที่เลือก" body="ระบบหยุดแสดงข้อมูลเพื่อป้องกันการเชื่อมข้อมูลข้ามแปลง" />;
  if (terminated || [beforeAssets.assets.error, afterAssets.assets.error, changeError].some((error) => error instanceof ApiError && TERMINAL_AUTH.has(error.code))) return <WorkspaceMessage title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" body="ระบบหยุดแสดงหลักฐานเชิงพื้นที่เพื่อปกป้องข้อมูลขององค์กร" login />;
  if (!before || !after) return <div className={styles.compare}><div className={styles.compareCanvas}><SpatialEvidenceMap field={field} before={afterAssets.assets.preview ? { url: afterAssets.assets.preview, bounds: fieldBounds(field) } : undefined} label={`บริบทแปลง ${field.name} ข้อมูลยังไม่เพียงพอสำหรับเปรียบเทียบ`} renderKey={`insufficient:${field.id}`} /><div className={styles.scope}>← แปลง {field.name}</div><div className={styles.insufficient}><h1>ยังไม่มีภาพที่เหมาะสำหรับเปรียบเทียบ</h1><p>ต้องมีภาพอย่างน้อยสองครั้งที่ยืนยันแหล่งที่มาและผ่านเงื่อนไขการวิเคราะห์</p><Link href={`/fields/${field.id}`}>เลือกวันที่อื่น →</Link></div></div></div>;
  const preview = (value: Assets) => value.preview ? { url: value.preview, bounds: value.rasterMeta?.bounds ?? fieldBounds(field) } : undefined;
  const beforeRaster = beforeAssets.assets.rasterMeta && beforeAssets.assets.raster ? { url: beforeAssets.assets.raster, bounds: beforeAssets.assets.rasterMeta.bounds } : undefined;
  const afterRaster = afterAssets.assets.rasterMeta && afterAssets.assets.raster ? { url: afterAssets.assets.raster, bounds: afterAssets.assets.rasterMeta.bounds } : undefined;
  return <div className={styles.compare}><div className={styles.compareCanvas}><SpatialEvidenceMap field={field} before={preview(beforeAssets.assets)} after={preview(afterAssets.assets)} overlayBefore={mode === "ndvi" ? beforeRaster : undefined} overlayAfter={mode === "ndvi" ? afterRaster : undefined} change={mode === "change" && change?.status === "USABLE" ? change.geometry : null} split={split} label={`เปรียบเทียบแปลง ${field.name}`} renderKey={`${before.observation_id}:${after.observation_id}:${mode}`} /><div className={styles.scope}>← แปลง {field.name}</div><ModeControl mode={mode} setMode={setMode} /><div className={styles.beforeLabel}><strong>ภาพก่อน</strong><span>{thaiDate(before.acquired_at)} · เมฆ {cloudLabel(before.cloud_percent)}</span></div><div className={styles.afterLabel}><strong>ภาพล่าสุดที่เลือก</strong><span>{thaiDate(after.acquired_at)} · เมฆ {cloudLabel(after.cloud_percent)}</span></div><label className={styles.swipe}>เลื่อนแบ่งภาพ<input type="range" min="10" max="90" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="เลื่อนเพื่อเปรียบเทียบภาพก่อนและภาพล่าสุด" /></label>{mode === "ndvi" ? <div className={styles.legend}><strong>NDVI</strong><i aria-hidden="true" /><span>0.2　0.4　0.6　0.8+</span></div> : null}{change?.status === "NOT_ASSESSABLE" ? <p className={styles.uncertainty}>ยังไม่มีพื้นที่ร่วมที่ใช้วัดได้เพียงพอ จึงไม่สรุปการเปลี่ยนแปลง</p> : <p className={styles.uncertainty}>พื้นที่ที่ไฮไลต์แสดงสัญญาณพืชพรรณที่เปลี่ยนไป แต่ยังไม่สามารถระบุสาเหตุจากภาพดาวเทียมเพียงอย่างเดียว</p>}<div className={styles.evidence}><small>หลักฐานการเปลี่ยนแปลง</small><strong>{thaiDate(before.acquired_at)} → {thaiDate(after.acquired_at)}</strong><dl><div><dt>NDVI</dt><dd>{change?.before_ndvi !== null && change?.before_ndvi !== undefined && change?.after_ndvi !== null && change?.after_ndvi !== undefined ? `${change.before_ndvi.toFixed(2)} → ${change.after_ndvi.toFixed(2)}` : "—"}</dd></div><div><dt>การเปลี่ยนแปลง</dt><dd>{change?.ndvi_delta !== null && change?.ndvi_delta !== undefined ? change.ndvi_delta.toFixed(2) : "—"}</dd></div><div><dt>พื้นที่ที่เปลี่ยน</dt><dd>{change?.changed_area_rai !== null && change?.changed_area_rai !== undefined ? `${change.changed_area_rai.toFixed(1)} ไร่` : "—"}</dd></div></dl><Link href={`/fields/${field.id}`}>กลับไปแปลง {field.name}</Link></div></div></div>;
}
