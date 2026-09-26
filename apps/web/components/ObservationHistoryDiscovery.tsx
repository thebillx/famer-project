"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { canManageFields } from "../lib/permissions";
import type { BackfillReceipt, FieldBoundary, Member } from "../lib/types";
import styles from "./observation-history-discovery.module.css";

const terminalAuth = (error: unknown) => error instanceof ApiError
  && ["authentication_required", "invalid_refresh_token"].includes(error.code);

function failureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "backfill_result_truncated") return "ช่วงนี้มีภาพมากเกินกว่าจะค้นหาได้ครบ กรุณาลดช่วงวันที่แล้วค้นหาอีกครั้ง";
    if (["invalid_backfill_range", "backfill_range_too_large", "validation_error"].includes(error.code)) return "กรุณาตรวจสอบวันที่เริ่มต้นและสิ้นสุด โดยเลือกช่วงไม่เกิน 730 วัน";
    if (error.status === 429) return "มีคำขอค้นหามากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง";
    if (error.status === 403 || error.status === 404) return "คุณไม่มีสิทธิ์ค้นหาภาพย้อนหลังของแปลงนี้ หรือแปลงนี้ไม่พร้อมใช้งาน";
  }
  return "ค้นหาภาพย้อนหลังไม่สำเร็จ กรุณาลองอีกครั้ง ข้อมูลที่บันทึกไว้ก่อนหน้ายังอยู่";
}

export function ObservationHistoryDiscovery({ field, identityId, onTerminalAuth }: {
  field: FieldBoundary;
  identityId: string;
  onTerminalAuth: () => void;
}) {
  const client = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<BackfillReceipt | null>(null);
  const [error, setError] = useState<unknown>(null);
  const request = useRef<AbortController | null>(null);
  const members = useQuery({
    queryKey: ["organization-members", identityId, field.organization_id],
    queryFn: ({ signal }) => apiFetch<Member[]>(`/api/v1/organizations/${field.organization_id}/members`, { signal }),
    retry: false
  });
  const membership = members.data?.find((member) => member.user_id === identityId && member.status === "active");
  const allowed = members.isSuccess && !members.isFetching && Boolean(membership && canManageFields(membership.role));

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (terminalAuth(members.error)) onTerminalAuth(); }, [members.error, onTerminalAuth]);

  async function discover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setReceipt(null);
    setError(null);
    try {
      const result = await apiFetch<BackfillReceipt>(`/api/v1/fields/${field.id}/observations/backfill`, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ start_date: startDate, end_date: endDate })
      });
      if (controller.signal.aborted) return;
      if (result.field_id !== field.id || result.status !== "COMPLETED"
        || ![result.catalog_found_count, result.persisted_count, result.rejected_count, result.pages_discovered].every((value) => Number.isInteger(value) && value >= 0)) {
        throw new Error("Invalid discovery receipt");
      }
      await client.invalidateQueries({ queryKey: ["observations", identityId, field.id] });
      if (!controller.signal.aborted) setReceipt(result);
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      if (terminalAuth(caught)) onTerminalAuth();
      else setError(caught);
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(false);
      }
    }
  }

  return <details className={styles.discovery}>
    <summary>ค้นหาภาพย้อนหลัง</summary>
    <div className={styles.content}>
      <p>เลือกช่วงวันที่ไม่เกิน 730 วัน ค้นหาช่วงเดิมจะแสดงผลที่เคยบันทึกไว้ ภาพที่พบยังต้องผ่านการประเมินก่อนสรุป NDVI</p>
      {members.isPending || members.isFetching ? <p role="status">กำลังตรวจสอบสิทธิ์ค้นหา…</p>
        : members.isError ? <div role="alert"><p>ตรวจสอบสิทธิ์ค้นหาไม่สำเร็จ</p><button className={styles.action} type="button" onClick={() => void members.refetch()}>ลองตรวจสอบสิทธิ์อีกครั้ง</button></div>
        : !allowed ? <p>บัญชีนี้ดูประวัติภาพได้ แต่การค้นหาเพิ่มเติมต้องใช้สิทธิ์ผู้จัดการแปลงขึ้นไป</p>
        : <form onSubmit={discover} aria-label="ค้นหาประวัติภาพดาวเทียม" aria-busy={pending}>
          <fieldset className={styles.controls} disabled={pending}>
            <legend className={styles.legend}>ช่วงวันที่ค้นหา</legend>
            <label>ตั้งแต่วันที่<input type="date" required value={startDate} onChange={(event) => { setStartDate(event.target.value); setReceipt(null); setError(null); }} /></label>
            <label>ถึงวันที่<input type="date" required min={startDate || undefined} value={endDate} onChange={(event) => { setEndDate(event.target.value); setReceipt(null); setError(null); }} /></label>
            <button type="submit" className={styles.action}>{pending ? "กำลังค้นหารายการภาพ…" : "ค้นหารายการภาพ"}</button>
          </fieldset>
        </form>}
      {pending ? <p role="status">กำลังค้นหารายการภาพตามช่วงวันที่เลือก…</p> : null}
      {error ? <p role="alert">{failureMessage(error)}</p> : null}
      {receipt ? <p role="status">{receipt.catalog_found_count === 0 ? "ไม่พบภาพในช่วงเวลานี้" : `ผลรอบค้นหา: พบ ${receipt.catalog_found_count} ภาพ · บันทึกใหม่ ${receipt.persisted_count} ภาพ · ไม่ผ่านคุณภาพ ${receipt.rejected_count} ภาพ`}</p> : null}
    </div>
  </details>;
}
