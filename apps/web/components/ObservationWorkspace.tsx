"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiFetchBlob } from "../lib/api";
import type { FieldBoundary, FieldChange, Observation, ObservationNdviSummary, ObservationRaster, User } from "../lib/types";
import { SpatialEvidenceMap } from "./SpatialEvidenceMap";
import styles from "./observation-workspace.module.css";

type Mode = "satellite" | "ndvi" | "change";
type AnalysisAttempt = "idle" | "measuring" | "success" | "failed";
type Assets = {
  identityKey: string;
  preview?: string;
  raster?: string;
  summary?: ObservationNdviSummary;
  rasterMeta?: ObservationRaster;
  error?: unknown;
  loading: boolean;
  attempt: AnalysisAttempt;
};
type ChangeState = { identityKey: string; value?: FieldChange; error?: unknown; loading: boolean };

const OBSERVATION_ANALYSIS_VERSION = "agriscope-ndvi-summary-v1+agriscope-ndvi-raster-v1";
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
const sameInstant = (left: string, right: string) => new Date(left).getTime() === new Date(right).getTime();

function observationIdentity(fieldId: string, observation: Observation | undefined) {
  if (!observation) return "";
  return [fieldId, observation.observation_id, observation.acquired_at, observation.geometry_hash ?? "no-geometry", observation.analysis_eligible ? OBSERVATION_ANALYSIS_VERSION : "preview-only"].join(":");
}

function comparisonIdentity(fieldId: string, before: Observation | undefined, after: Observation | undefined) {
  if (!before || !after) return "";
  return [fieldId, before.observation_id, after.observation_id, before.geometry_hash ?? "no-geometry", after.geometry_hash ?? "no-geometry", OBSERVATION_ANALYSIS_VERSION].join(":");
}

function measurementFreshness(latest: Observation | undefined, measured: Observation | undefined) {
  if (!latest || !measured) return "ยังไม่มีข้อมูลวัดสำเร็จ";
  const days = Math.max(0, Math.round((new Date(latest.acquired_at).getTime() - new Date(measured.acquired_at).getTime()) / 86_400_000));
  return days === 0 ? "ตรงกับภาพล่าสุด" : `${days} วันก่อนภาพล่าสุด`;
}

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
  const queryClient = useQueryClient();
  const identityKey = observationIdentity(fieldId, observation);
  const [assets, setAssets] = useState<Assets>({ identityKey: "", loading: false, attempt: "idle" });
  const assetsRef = useRef(assets);
  const epochRef = useRef(0);
  const imageEpochRef = useRef(0);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  useEffect(() => {
    const epoch = ++epochRef.current;
    const initialAttempt: AnalysisAttempt = observation?.analysis_eligible ? "measuring" : "idle";
    setAssets((old) => {
      if (old.identityKey !== identityKey) {
        revoke(old.preview);
        revoke(old.raster);
        return { identityKey, loading: Boolean(observation && observation.status !== "UNAVAILABLE"), attempt: initialAttempt };
      }
      return { ...old, loading: Boolean(observation && observation.status !== "UNAVAILABLE"), attempt: old.attempt === "success" ? "success" : initialAttempt, error: undefined };
    });
    if (!observation || observation.status === "UNAVAILABLE") return;

    const requests: Promise<void>[] = [];
    if (observation.imagery_available) {
      requests.push(apiFetchBlob(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/preview`).then((blob) => {
        if (epochRef.current !== epoch) return;
        const url = URL.createObjectURL(blob);
        if (epochRef.current !== epoch) { revoke(url); return; }
        setAssets((old) => {
          if (old.identityKey !== identityKey) { revoke(url); return old; }
          revoke(old.preview);
          return { ...old, preview: url };
        });
      }).catch((error: unknown) => {
        announceAuth(error);
        if (epochRef.current === epoch) setAssets((old) => old.identityKey === identityKey ? { ...old, error } : old);
      }));
    }

    if (observation.analysis_eligible) {
      requests.push(apiFetch<ObservationNdviSummary>(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-summary`).then((summary) => {
        if (
          summary.field_id !== fieldId
          || summary.observation_id !== observation.observation_id
          || !sameInstant(summary.acquired_at, observation.acquired_at)
          || summary.geometry_hash !== observation.geometry_hash
          || summary.algorithm_version !== OBSERVATION_ANALYSIS_VERSION
        ) throw new ApiError("ข้อมูลตอบกลับไม่ตรงกับ identity ของภาพที่ร้องขอ", { status: null, code: "invalid_response", requestId: null });
        if (epochRef.current !== epoch) return;
        setAssets((old) => old.identityKey === identityKey ? { ...old, summary, attempt: "success" } : old);
        const principal = queryClient.getQueryData<User>(["current-user"]);
        if (principal) {
          queryClient.setQueryData<Observation[]>(["observations", principal.id, fieldId], (current) => current?.map((item) => item.observation_id === observation.observation_id ? { ...item, analysis_ready: true } : item));
        }
      }).catch((error: unknown) => {
        announceAuth(error);
        if (epochRef.current === epoch) setAssets((old) => old.identityKey === identityKey ? { ...old, error, attempt: "failed" } : old);
      }));

      requests.push(apiFetch<ObservationRaster>(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-raster`).then((rasterMeta) => {
        if (
          rasterMeta.field_id !== fieldId
          || rasterMeta.observation_id !== observation.observation_id
          || !sameInstant(rasterMeta.acquired_at, observation.acquired_at)
          || rasterMeta.geometry_hash !== observation.geometry_hash
          || rasterMeta.algorithm_version !== OBSERVATION_ANALYSIS_VERSION
        ) throw new ApiError("ข้อมูล raster ตอบกลับไม่ตรงกับ identity ของภาพที่เลือก", { status: null, code: "invalid_response", requestId: null });
        if (epochRef.current === epoch) setAssets((old) => old.identityKey === identityKey ? { ...old, rasterMeta } : old);
      }).catch((error: unknown) => {
        announceAuth(error);
        if (epochRef.current === epoch) setAssets((old) => old.identityKey === identityKey ? { ...old, error } : old);
      }));
    }

    if (!requests.length) {
      setAssets((old) => old.identityKey === identityKey ? { ...old, loading: false } : old);
    } else {
      void Promise.all(requests).finally(() => {
        if (epochRef.current === epoch) setAssets((old) => old.identityKey === identityKey ? { ...old, loading: false } : old);
      });
    }
    return () => { epochRef.current++; };
  }, [fieldId, identityKey, observation?.analysis_eligible, observation?.imagery_available, observation?.observation_id, observation?.status, queryClient]);

  const visibleAssets: Assets = assets.identityKey === identityKey
    ? assets
    : {
        identityKey,
        loading: Boolean(observation && observation.status !== "UNAVAILABLE"),
        attempt: observation?.analysis_eligible ? "measuring" : "idle",
      };

  useEffect(() => {
    const current = ++imageEpochRef.current;
    if (mode !== "ndvi" || !observation?.analysis_eligible || !visibleAssets.rasterMeta || visibleAssets.raster || visibleAssets.error) return;
    void apiFetchBlob(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-raster/image`).then((blob) => {
      if (imageEpochRef.current !== current) return;
      const url = URL.createObjectURL(blob);
      if (imageEpochRef.current !== current) { revoke(url); return; }
      setAssets((old) => {
        if (old.identityKey !== identityKey) { revoke(url); return old; }
        revoke(old.raster);
        return { ...old, raster: url };
      });
    }).catch((error: unknown) => {
      announceAuth(error);
      if (imageEpochRef.current === current) setAssets((old) => old.identityKey === identityKey ? { ...old, error } : old);
    });
    return () => { imageEpochRef.current++; };
  }, [fieldId, identityKey, mode, observation?.analysis_eligible, observation?.observation_id, visibleAssets.error, visibleAssets.raster, visibleAssets.rasterMeta]);

  useEffect(() => () => {
    epochRef.current++;
    imageEpochRef.current++;
    revoke(assetsRef.current.preview);
    revoke(assetsRef.current.raster);
  }, []);

  const imageLoading = mode === "ndvi" && Boolean(observation?.analysis_eligible && visibleAssets.rasterMeta && !visibleAssets.raster && !visibleAssets.error);
  return { assets: visibleAssets, loading: visibleAssets.loading || imageLoading, attempt: visibleAssets.attempt };
}

function useObservationChange(field: FieldBoundary, before: Observation | undefined, after: Observation | undefined) {
  const identityKey = comparisonIdentity(field.id, before, after);
  const [state, setState] = useState<ChangeState>({ identityKey: "", loading: false });
  const epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current;
    setState({ identityKey, loading: Boolean(before && after) });
    if (!before || !after) return;
    const query = new URLSearchParams({ before: before.observation_id, after: after.observation_id });
    void apiFetch<FieldChange>(`/api/v1/fields/${field.id}/change?${query}`).then((data) => {
      if (
        data.field_id !== field.id
        || data.before_observation_id !== before.observation_id
        || data.after_observation_id !== after.observation_id
        || data.algorithm_version !== OBSERVATION_ANALYSIS_VERSION
        || data.geometry_hash !== before.geometry_hash
        || data.geometry_hash !== after.geometry_hash
      ) throw new ApiError("ข้อมูลตอบกลับไม่ตรงกับ identity ของช่วงเวลาที่เลือก", { status: null, code: "invalid_response", requestId: null });
      if (epoch.current === current) setState({ identityKey, value: data, loading: false });
    }).catch((error: unknown) => {
      announceAuth(error);
      if (epoch.current === current) setState({ identityKey, error, loading: false });
    });
    return () => { epoch.current++; };
  }, [after?.geometry_hash, after?.observation_id, before?.geometry_hash, before?.observation_id, field.id, identityKey]);
  if (state.identityKey !== identityKey) return { change: null, error: undefined, loading: Boolean(before && after) };
  return { change: state.value ?? null, error: state.error, loading: state.loading };
}

function ModeControl({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return <div className={styles.modeControl} aria-label="ชั้นข้อมูล">{(["satellite", "ndvi", "change"] as Mode[]).map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>{item === "satellite" ? "ภาพดาวเทียม" : item === "ndvi" ? "NDVI" : "พื้นที่ NDVI ลดลง"}</button>)}</div>;
}

function Timeline({ observations, selected, before, onSelect }: { observations: Observation[]; selected: string; before?: string; onSelect: (id: string) => void }) {
  return <div className={styles.timeline} aria-label="ช่วงเวลาที่ใช้วิเคราะห์"><span>ช่วงเวลาที่ใช้วิเคราะห์</span><div className={styles.timelineDates}>{observations.slice(0, 8).reverse().map((item) => <button key={item.observation_id} type="button" data-observation-id={item.observation_id} data-current={item.observation_id === selected} data-before={item.observation_id === before} data-analysis-ready={item.analysis_ready} data-analysis-eligible={item.analysis_eligible} onClick={() => onSelect(item.observation_id)}><i aria-hidden="true" /><strong>{shortDate(item.acquired_at)}</strong><small>{item.observation_id === selected ? "เลือก" : item.status === "POOR_QUALITY" ? "เมฆสูง" : item.analysis_ready ? "วัดแล้ว" : item.analysis_eligible ? "พร้อมประเมิน" : "จำกัด"}</small></button>)}</div></div>;
}

function WorkspaceMessage({ title, body, login = false }: { title: string; body: string; login?: boolean }) {
  return <div className={styles.message} role="alert"><h1>{title}</h1><p>{body}</p>{login ? <Link href="/login">ไปหน้าเข้าสู่ระบบ</Link> : null}</div>;
}

export function FieldAnalysisWorkspace({ field, observations }: { field: FieldBoundary; observations: Observation[] }) {
  const terminated = useProtectedWorkspaceTermination();
  const ordered = useMemo(() => [...observations].sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime()), [observations]);
  const comparisonEligible = ordered.filter((item) => item.status === "USABLE" && item.comparison_eligible);
  const [selectedId, setSelectedId] = useState(ordered[0]?.observation_id ?? "");
  const [mode, setMode] = useState<Mode>("satellite");
  useEffect(() => { if (!ordered.some((item) => item.observation_id === selectedId)) setSelectedId(ordered[0]?.observation_id ?? ""); }, [ordered, selectedId]);
  const selected = ordered.find((item) => item.observation_id === selectedId) ?? ordered[0];
  const before = comparisonEligible.find((item) => selected && new Date(item.acquired_at).getTime() < new Date(selected.acquired_at).getTime());
  const { assets, loading, attempt } = useObservationAssets(field.id, selected, mode);
  const changeState = useObservationChange(field, before, selected?.status === "USABLE" && selected.analysis_eligible ? selected : undefined);
  const change = changeState.change;
  if (observations.some((item) => item.field_id !== field.id)) return <WorkspaceMessage title="ข้อมูลตอบกลับไม่ตรงกับแปลงที่เลือก" body="ระบบหยุดแสดงข้อมูลเพื่อป้องกันการเชื่อมข้อมูลข้ามแปลง" />;
  if (!observations.length) return <WorkspaceMessage title="ยังไม่มีประวัติภาพสำหรับแปลงนี้" body="เมื่อมีภาพที่ผ่านการตรวจคุณภาพ ประวัติการสังเกตจะแสดงที่นี่" />;
  if (terminated || [assets.error, changeState.error].some((error) => error instanceof ApiError && TERMINAL_AUTH.has(error.code))) return <WorkspaceMessage title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" body="ระบบหยุดแสดงข้อมูลแปลงเพื่อปกป้องข้อมูลขององค์กร" login />;
  if (!selected) return <WorkspaceMessage title="ยังไม่มีภาพสำหรับแปลงนี้" body="ลองค้นหาข้อมูลดาวเทียมอีกครั้งเมื่อมีข้อมูลพร้อมใช้งาน" />;

  const latestAcquired = ordered[0];
  const latestEligible = ordered.find((item) => item.analysis_eligible);
  const latestMeasured = ordered.find((item) => item.analysis_ready);
  const freshness = measurementFreshness(latestAcquired, latestMeasured);
  const preview = assets.preview ? { url: assets.preview, bounds: fieldBounds(field) as [number, number, number, number] } : undefined;
  const raster = assets.rasterMeta && assets.raster ? { url: assets.raster, bounds: assets.rasterMeta.bounds } : undefined;
  const changeReady = change?.status === "USABLE" && change.geometry !== null ? change.geometry : null;
  const selectedState = selected.status === "POOR_QUALITY" ? "คุณภาพภาพต่ำ" : selected.status === "UNAVAILABLE" ? "ไม่มีภาพใช้งาน" : !selected.analysis_eligible ? "ประเมิน NDVI ไม่ได้" : selected.analysis_ready ? "วัด NDVI แล้ว" : selected.observation_id === latestAcquired?.observation_id ? "ภาพล่าสุด · พร้อมประเมิน" : "ภาพย้อนหลัง · พร้อมประเมิน";
  const attemptLabel = !selected.analysis_eligible ? "จำกัด" : selected.analysis_ready ? "วัดสำเร็จและบันทึกแล้ว" : attempt === "measuring" ? "กำลังประเมิน" : attempt === "success" ? "วัดสำเร็จ" : attempt === "failed" ? "การประเมินครั้งล่าสุดไม่สำเร็จ" : "พร้อมประเมิน";
  const supportNote = change?.status === "NOT_ASSESSABLE" ? `พื้นที่ร่วมที่ใช้วัดได้ ${(change.support.common_support_ratio * 100).toFixed(1)}% จาก grid ในขอบเขตแปลง ต่ำกว่าเกณฑ์ ${(change.support.minimum_required_ratio * 100).toFixed(1)}% จึงยังสรุปการเปลี่ยนแปลงไม่ได้` : null;

  return <div className={styles.analysis}>
    <aside className={styles.fieldRail}><h1>แปลง {field.name}</h1><p>{Number(field.area_rai).toFixed(1)} ไร่</p><div className={styles.railRule} /><small>ภาพล่าสุดที่ได้มา<br /><strong>{latestAcquired ? thaiDate(latestAcquired.acquired_at) : "—"}</strong></small><small>ล่าสุดที่พร้อมประเมิน<br /><strong>{latestEligible ? thaiDate(latestEligible.acquired_at) : "ยังไม่มี"}</strong></small><small>ล่าสุดที่วัด NDVI สำเร็จ<br /><strong>{latestMeasured ? thaiDate(latestMeasured.acquired_at) : "ยังไม่มี"}</strong><br />{freshness}</small><small>ประวัติภาพ {observations.length} ครั้ง</small></aside>
    <section className={styles.canvas} aria-label="ภาพวิเคราะห์แปลง"><SpatialEvidenceMap field={field} before={preview} overlayBefore={mode === "ndvi" ? raster : undefined} change={mode === "change" ? changeReady : null} label={`${mode === "ndvi" ? "NDVI" : mode === "change" ? "พื้นที่ NDVI ลดลง" : "ภาพดาวเทียม"} ของแปลง ${field.name}`} renderKey={`${selected.observation_id}:${mode}:${assets.rasterMeta?.bounds.join(",") ?? "pending"}`} /><div className={styles.scope}>← แปลง {field.name}<small>{Number(field.area_rai).toFixed(1)} ไร่</small></div><ModeControl mode={mode} setMode={setMode} />{mode === "ndvi" ? <div className={styles.legend}><strong>NDVI</strong><i aria-hidden="true" /><span>0.2　0.4　0.6　0.8+</span></div> : null}{loading || changeState.loading ? <div className={styles.loading}>กำลังโหลดข้อมูลวันที่เลือก…</div> : null}{selected.status === "POOR_QUALITY" ? <div className={styles.quality}>ภาพวันที่เลือกมีเมฆปกคลุมสูง ({cloudLabel(selected.cloud_percent)}) แสดงภาพตัวอย่างได้ แต่ยังไม่ใช้คำนวณ NDVI</div> : null}{selected.status === "UNAVAILABLE" ? <div className={styles.quality}>ภาพวันที่เลือกยังไม่พร้อมใช้งาน</div> : null}{!selected.analysis_eligible && selected.status === "USABLE" ? <div className={styles.quality}>ยังยืนยันขอบเขตและแหล่งที่มาของภาพวันที่นี้ไม่ได้ จึงยังประเมิน NDVI ไม่ได้</div> : null}</section>
    <aside className={styles.inspector}><h2>แปลง {field.name}</h2><p>{thaiDate(selected.acquired_at)} · เมฆ {cloudLabel(selected.cloud_percent)}</p><span className={selected.status === "POOR_QUALITY" ? styles.statusClay : styles.statusNeutral}>{selectedState}</span><dl><div><dt>NDVI ของภาพนี้</dt><dd>{assets.summary?.ndvi_mean.toFixed(2) ?? "—"}</dd></div><div><dt>การเปลี่ยนแปลงบนพื้นที่ร่วม</dt><dd className={styles.clay}>{change?.status === "USABLE" && change.ndvi_delta !== null ? `${change.ndvi_delta > 0 ? "↑" : change.ndvi_delta < 0 ? "↓" : "→"} ${Math.abs(change.ndvi_delta).toFixed(2)}` : "—"}</dd></div><div><dt>พื้นที่ NDVI ลดลง</dt><dd>{change?.status === "USABLE" && change.changed_area_rai !== null ? `${change.changed_area_rai.toFixed(1)} ไร่` : "—"}</dd></div></dl>{before && selected.comparison_eligible ? <div className={styles.comparisonContext}><h3>เปรียบเทียบกับ</h3><p>{thaiDate(before.acquired_at)} → {thaiDate(selected.acquired_at)}</p>{changeState.loading ? <p className={styles.note}>กำลังตรวจพื้นที่ร่วมที่ใช้วัดได้…</p> : supportNote ? <p className={styles.note}>{supportNote}</p> : change?.status === "USABLE" ? <Link className={styles.primaryAction} href={`/fields/${field.id}/compare?before=${before.observation_id}&after=${selected.observation_id}`}>เปรียบเทียบภาพ</Link> : <p className={styles.note}>ยังไม่มีผลเปรียบเทียบที่ประเมินได้</p>}</div> : <p className={styles.note}>ยังไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบกับภาพก่อนหน้า</p>}<div className={styles.inspectorRule} /><h3>ข้อมูลภาพ</h3><dl className={styles.meta}><div><dt>ภาพที่เลือก</dt><dd>{thaiDate(selected.acquired_at)}</dd></div><div><dt>แหล่งข้อมูล</dt><dd>{selected.source}</dd></div><div><dt>สถานะการวิเคราะห์</dt><dd>{attemptLabel}</dd></div><div><dt>last-good</dt><dd>{latestMeasured ? `${thaiDate(latestMeasured.acquired_at)} · ${freshness}` : "ยังไม่มี"}</dd></div></dl><p className={styles.note}>ข้อมูลนี้แสดงการเปลี่ยนแปลงของสัญญาณพืชพรรณ และยังไม่สามารถระบุสาเหตุจากภาพดาวเทียมเพียงอย่างเดียว</p></aside>
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
  const beforeAssets = useObservationAssets(field.id, before, mode);
  const afterAssets = useObservationAssets(field.id, after, mode);
  const changeState = useObservationChange(field, before, after);
  const change = changeState.change;
  if (observations.some((item) => item.field_id !== field.id)) return <WorkspaceMessage title="ข้อมูลตอบกลับไม่ตรงกับแปลงที่เลือก" body="ระบบหยุดแสดงข้อมูลเพื่อป้องกันการเชื่อมข้อมูลข้ามแปลง" />;
  if (terminated || [beforeAssets.assets.error, afterAssets.assets.error, changeState.error].some((error) => error instanceof ApiError && TERMINAL_AUTH.has(error.code))) return <WorkspaceMessage title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" body="ระบบหยุดแสดงหลักฐานเชิงพื้นที่เพื่อปกป้องข้อมูลขององค์กร" login />;
  if (!before || !after) return <div className={styles.compare}><div className={styles.compareCanvas}><SpatialEvidenceMap field={field} before={afterAssets.assets.preview ? { url: afterAssets.assets.preview, bounds: fieldBounds(field) } : undefined} label={`บริบทแปลง ${field.name} ข้อมูลยังไม่เพียงพอสำหรับเปรียบเทียบ`} renderKey={`insufficient:${field.id}`} /><div className={styles.scope}>← แปลง {field.name}</div><div className={styles.insufficient}><h1>ยังไม่มีภาพที่เหมาะสำหรับเปรียบเทียบ</h1><p>ต้องมีภาพอย่างน้อยสองครั้งที่ยืนยันแหล่งที่มาและผ่านเงื่อนไขการวิเคราะห์</p><Link href={`/fields/${field.id}`}>เลือกวันที่อื่น →</Link></div></div></div>;
  const preview = (value: Assets) => value.preview ? { url: value.preview, bounds: value.rasterMeta?.bounds ?? fieldBounds(field) } : undefined;
  const beforeRaster = beforeAssets.assets.rasterMeta && beforeAssets.assets.raster ? { url: beforeAssets.assets.raster, bounds: beforeAssets.assets.rasterMeta.bounds } : undefined;
  const afterRaster = afterAssets.assets.rasterMeta && afterAssets.assets.raster ? { url: afterAssets.assets.raster, bounds: afterAssets.assets.rasterMeta.bounds } : undefined;
  const supportText = change?.status === "NOT_ASSESSABLE" ? `พื้นที่ร่วมที่ใช้วัดได้ ${(change.support.common_support_ratio * 100).toFixed(1)}% จาก grid ในขอบเขตแปลง ต่ำกว่าเกณฑ์ ${(change.support.minimum_required_ratio * 100).toFixed(1)}% จึงไม่สรุปการเปลี่ยนแปลง` : null;
  return <div className={styles.compare}><div className={styles.compareCanvas}><SpatialEvidenceMap field={field} before={preview(beforeAssets.assets)} after={preview(afterAssets.assets)} overlayBefore={mode === "ndvi" ? beforeRaster : undefined} overlayAfter={mode === "ndvi" ? afterRaster : undefined} change={mode === "change" && change?.status === "USABLE" ? change.geometry : null} split={split} label={`เปรียบเทียบแปลง ${field.name}`} renderKey={`${before.observation_id}:${after.observation_id}:${mode}`} /><div className={styles.scope}>← แปลง {field.name}</div><ModeControl mode={mode} setMode={setMode} /><div className={styles.beforeLabel}><strong>ภาพก่อน</strong><span>{thaiDate(before.acquired_at)} · เมฆ {cloudLabel(before.cloud_percent)}</span></div><div className={styles.afterLabel}><strong>ภาพล่าสุดที่เลือก</strong><span>{thaiDate(after.acquired_at)} · เมฆ {cloudLabel(after.cloud_percent)}</span></div><label className={styles.swipe}>เลื่อนแบ่งภาพ<input type="range" min="10" max="90" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="เลื่อนเพื่อเปรียบเทียบภาพก่อนและภาพล่าสุด" /></label>{mode === "ndvi" ? <div className={styles.legend}><strong>NDVI</strong><i aria-hidden="true" /><span>0.2　0.4　0.6　0.8+</span></div> : null}{changeState.loading ? <p className={styles.uncertainty}>กำลังตรวจพื้นที่ร่วมที่ใช้วัดได้…</p> : supportText ? <p className={styles.uncertainty}>{supportText}</p> : <p className={styles.uncertainty}>พื้นที่ที่ไฮไลต์คือพิกเซลบนพื้นที่ร่วมที่ค่า NDVI ลดลงอย่างน้อย 0.10 ตามเกณฑ์การเปรียบเทียบ และยังไม่สามารถระบุสาเหตุจากภาพดาวเทียมเพียงอย่างเดียว</p>}<div className={styles.evidence}><small>หลักฐานการเปลี่ยนแปลง</small><strong>{thaiDate(before.acquired_at)} → {thaiDate(after.acquired_at)}</strong><dl><div><dt>NDVI บนพื้นที่ร่วม</dt><dd>{change?.before_ndvi !== null && change?.before_ndvi !== undefined && change?.after_ndvi !== null && change?.after_ndvi !== undefined ? `${change.before_ndvi.toFixed(2)} → ${change.after_ndvi.toFixed(2)}` : "—"}</dd></div><div><dt>การเปลี่ยนแปลง</dt><dd>{change?.ndvi_delta !== null && change?.ndvi_delta !== undefined ? change.ndvi_delta.toFixed(2) : "—"}</dd></div><div><dt>พื้นที่ NDVI ลดลง</dt><dd>{change?.changed_area_rai !== null && change?.changed_area_rai !== undefined ? `${change.changed_area_rai.toFixed(1)} ไร่` : "—"}</dd></div><div><dt>พื้นที่ร่วมที่ใช้วัด</dt><dd>{change ? `${(change.support.common_support_ratio * 100).toFixed(1)}%` : "—"}</dd></div></dl><Link href={`/fields/${field.id}`}>กลับไปแปลง {field.name}</Link></div></div></div>;
}
