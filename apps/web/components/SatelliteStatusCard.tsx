"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { apiFetch } from "../lib/api";
import type { SatelliteLatest } from "../lib/types";
import { Badge, Card } from "./Primitives";

export function SatelliteStatusCard({ fieldId }: { fieldId: string }) {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: ["satellite-latest", fieldId],
    queryFn: () => apiFetch<SatelliteLatest>(`/api/v1/fields/${fieldId}/satellite/latest`),
    enabled: Boolean(fieldId)
  });
  const search = useMutation({
    mutationFn: () =>
      apiFetch<SatelliteLatest>(`/api/v1/fields/${fieldId}/satellite/search-latest`, {
        method: "POST"
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["satellite-latest", fieldId], data);
    }
  });
  const result = search.data ?? latest.data;
  const unavailable = search.isError || result?.status === "temporarily_unavailable";

  return (
    <Card premium className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="satellite">Sentinel metadata</Badge>
          <h2 className="mt-3 text-xl font-bold text-[var(--as-ink)]">ภาพดาวเทียมล่าสุด</h2>
          <p className="mt-1 text-sm text-[var(--as-ink-muted)]">ค้นหาเฉพาะข้อมูล Sentinel-2 Level-2A จากแปลงที่บันทึกไว้</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => search.mutate()} disabled={search.isPending}>
          {search.isPending ? "กำลังตรวจสอบ..." : "ตรวจสอบภาพดาวเทียมล่าสุด"}
        </Button>
      </div>

      <div className="mt-5 rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-[var(--as-blue-soft)] p-4" aria-live="polite">
        {latest.isLoading ? <p className="text-[var(--as-ink-muted)]">กำลังโหลดสถานะดาวเทียม...</p> : null}
        {unavailable ? (
          <p className="font-semibold text-[var(--as-warning)]">ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง</p>
        ) : null}
        {!unavailable && result?.status === "available" && result.acquisition ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold text-[var(--as-ink)]">พบภาพล่าสุด</p>
              <span className="as-pill text-[var(--as-satellite)]">ข้อมูลพร้อมสำหรับการวิเคราะห์ขั้นถัดไป</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="วันที่ดาวเทียมบันทึกภาพ" value={formatThaiDate(result.acquisition.acquired_at)} />
              <Info
                label="ปริมาณเมฆตามข้อมูลประกอบภาพ"
                value={
                  result.acquisition.cloud_cover_percent === null
                    ? "ไม่มีข้อมูลเมฆ"
                    : `${result.acquisition.cloud_cover_percent.toFixed(1)}%`
                }
              />
              <Info label="แหล่งข้อมูล" value="Sentinel-2 Level-2A" />
              <Info label="เวลาที่ค้นหา" value={formatThaiDate(result.searched_at)} />
            </div>
            <details className="text-sm text-[var(--as-ink-muted)]">
              <summary className="cursor-pointer font-semibold text-[var(--as-primary)]">Product / item ID</summary>
              <p className="mt-1 break-all">{result.acquisition.item_id}</p>
            </details>
          </div>
        ) : null}
        {!unavailable && result?.status === "no_data" ? (
          <p className="font-semibold text-[var(--as-ink-muted)]">ยังไม่พบภาพ Sentinel-2 ที่ตรงกับเงื่อนไขในช่วงเวลาที่ค้นหา</p>
        ) : null}
        {!latest.isLoading && !result && !unavailable ? (
          <p className="text-[var(--as-ink-muted)]">ยังไม่มีการตรวจสอบภาพดาวเทียมล่าสุด</p>
        ) : null}
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--as-radius-md)] bg-white/70 p-3">
      <p className="text-xs font-bold uppercase text-[var(--as-ink-muted)]">{label}</p>
      <p className="as-number mt-1 font-bold text-[var(--as-ink)]">{value}</p>
    </div>
  );
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}
