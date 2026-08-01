"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { apiFetch } from "../lib/api";
import type { SatelliteLatest } from "../lib/types";

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
    <section className="rounded-md border border-[#d7decc] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#173f35]">ภาพดาวเทียมล่าสุด</h2>
          <p className="text-sm text-[#526057]">ค้นหาเฉพาะข้อมูล Sentinel-2 Level-2A จากแปลงที่บันทึกไว้</p>
        </div>
        <Button type="button" onClick={() => search.mutate()} disabled={search.isPending}>
          {search.isPending ? "กำลังตรวจสอบ..." : "ตรวจสอบภาพดาวเทียมล่าสุด"}
        </Button>
      </div>

      <div className="mt-4 rounded-md bg-[#f7f4ea] p-4" aria-live="polite">
        {latest.isLoading ? <p className="text-[#526057]">กำลังโหลดสถานะดาวเทียม...</p> : null}
        {unavailable ? (
          <p className="font-medium text-[#8a4b18]">ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง</p>
        ) : null}
        {!unavailable && result?.status === "available" && result.acquisition ? (
          <div className="space-y-2">
            <p className="font-semibold text-[#173f35]">พบภาพล่าสุด</p>
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
            <details className="text-sm text-[#526057]">
              <summary className="cursor-pointer font-medium text-[#173f35]">Product / item ID</summary>
              <p className="mt-1 break-all">{result.acquisition.item_id}</p>
            </details>
          </div>
        ) : null}
        {!unavailable && result?.status === "no_data" ? (
          <p className="font-medium text-[#526057]">ยังไม่พบภาพ Sentinel-2 ที่ตรงกับเงื่อนไขในช่วงเวลาที่ค้นหา</p>
        ) : null}
        {!latest.isLoading && !result && !unavailable ? (
          <p className="text-[#526057]">ยังไม่มีการตรวจสอบภาพดาวเทียมล่าสุด</p>
        ) : null}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-[#526057]">{label}</p>
      <p className="font-medium text-[#173f35]">{value}</p>
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
