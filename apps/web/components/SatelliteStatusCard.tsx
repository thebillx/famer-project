"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { ApiError, apiFetch, apiFetchBlob } from "../lib/api";
import type { SatelliteLatest, SatelliteNdviSummary, SatelliteSearch } from "../lib/types";
import { Badge, Card } from "./Primitives";

const AUTH_FAILURES = new Set(["authentication_required", "invalid_refresh_token"]);

export function SatelliteStatusCard({
  fieldId,
  identityId,
  onTerminalAuth
}: {
  fieldId: string;
  identityId: string;
  onTerminalAuth: () => void;
}) {
  const queryClient = useQueryClient();
  const previewEpoch = useRef(0);
  const ndviEpoch = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [ndviSummary, setNdviSummary] = useState<SatelliteNdviSummary | null>(null);
  const [ndviError, setNdviError] = useState<unknown>(null);
  const [ndviPending, setNdviPending] = useState(false);
  const latestQueryKey = ["satellite-latest", identityId, fieldId] as const;
  const latest = useQuery({
    queryKey: latestQueryKey,
    queryFn: () => apiFetch<SatelliteLatest>(`/api/v1/fields/${fieldId}/satellite/latest`),
    enabled: Boolean(fieldId && identityId),
    retry: false
  });
  const search = useMutation({
    mutationFn: () =>
      apiFetch<SatelliteSearch>(`/api/v1/fields/${fieldId}/satellite/search-latest`, {
        method: "POST"
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(latestQueryKey, data);
    },
    retry: false
  });
  const result = search.data ?? latest.data;
  const acquisitionId = result?.status === "available" ? result.acquisition.item_id : null;
  const requestError = search.error ?? (search.data ? null : latest.error);
  const unavailable = search.isError || (!search.data && latest.isError) || result?.status === "temporarily_unavailable";

  useEffect(() => {
    const error = search.error ?? latest.error;
    if (error instanceof ApiError && AUTH_FAILURES.has(error.code)) onTerminalAuth();
  }, [latest.error, onTerminalAuth, search.error]);

  function replacePreviewUrl(nextUrl: string | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  useEffect(() => {
    previewEpoch.current += 1;
    ndviEpoch.current += 1;
    replacePreviewUrl(null);
    setPreviewError(null);
    setPreviewPending(false);
    setNdviSummary(null);
    setNdviError(null);
    setNdviPending(false);
  }, [fieldId, acquisitionId]);

  useEffect(() => () => {
    previewEpoch.current += 1;
    ndviEpoch.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  async function loadPreview() {
    const epoch = previewEpoch.current + 1;
    previewEpoch.current = epoch;
    replacePreviewUrl(null);
    setPreviewError(null);
    setPreviewPending(true);
    try {
      const blob = await apiFetchBlob(`/api/v1/fields/${fieldId}/satellite/preview`);
      const objectUrl = URL.createObjectURL(blob);
      if (previewEpoch.current !== epoch) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      replacePreviewUrl(objectUrl);
    } catch (error) {
      if (previewEpoch.current === epoch) setPreviewError(error);
    } finally {
      if (previewEpoch.current === epoch) setPreviewPending(false);
    }
  }

  async function loadNdviSummary() {
    const epoch = ndviEpoch.current + 1;
    ndviEpoch.current = epoch;
    setNdviSummary(null);
    setNdviError(null);
    setNdviPending(true);
    try {
      const summary = await apiFetch<SatelliteNdviSummary>(
        `/api/v1/fields/${fieldId}/satellite/ndvi-summary`
      );
      if (ndviEpoch.current === epoch) setNdviSummary(summary);
    } catch (error) {
      if (ndviEpoch.current === epoch) setNdviError(error);
    } finally {
      if (ndviEpoch.current === epoch) setNdviPending(false);
    }
  }

  return (
    <Card premium className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="satellite">Sentinel metadata</Badge>
          <h2 className="mt-3 text-xl font-bold text-[var(--as-ink)]">ภาพดาวเทียมล่าสุด</h2>
          <p className="mt-1 text-sm text-[var(--as-ink-muted)]">ค้นหาเฉพาะข้อมูล Sentinel-2 Level-2A จากแปลงที่บันทึกไว้</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => search.mutate()}
          disabled={search.isPending || previewPending || ndviPending}
        >
          {search.isPending ? "กำลังตรวจสอบ..." : "ตรวจสอบภาพดาวเทียมล่าสุด"}
        </Button>
      </div>

      <div className="mt-5 rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-[var(--as-blue-soft)] p-4" aria-live="polite">
        {latest.isLoading ? <p className="text-[var(--as-ink-muted)]">กำลังโหลดสถานะดาวเทียม...</p> : null}
        {unavailable ? (
          <p role="alert" className="font-semibold text-[var(--as-warning)]">
            {satelliteErrorCopy(requestError)}
          </p>
        ) : null}
        {!unavailable && result?.status === "available" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-bold text-[var(--as-ink)]">พบภาพล่าสุด</p>
              <span className="as-pill text-[var(--as-satellite)]">มีข้อมูลประกอบภาพล่าสุด</span>
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
            <div className="border-t border-[var(--as-border)] pt-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => void loadPreview()}
                  disabled={previewPending}
                  isLoading={previewPending}
                  loadingLabel="กำลังเตรียมภาพสีจริง…"
                >
                  ดูภาพสีจริงของแปลง
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadNdviSummary()}
                  disabled={ndviPending}
                  isLoading={ndviPending}
                  loadingLabel="กำลังคำนวณ NDVI…"
                >
                  ดูสรุป NDVI
                </Button>
              </div>
              <p className="mt-2 text-sm text-[var(--as-ink-muted)]">
                ระบบจะเรียกภาพหรือค่าสถิติเมื่อคุณกดเท่านั้น เพื่อควบคุมเวลาและปริมาณการใช้งานผู้ให้บริการ
              </p>
              {previewError ? (
                <p role="alert" className="mt-3 font-semibold text-[var(--as-warning)]">
                  {satellitePreviewErrorCopy(previewError)}
                </p>
              ) : null}
              {previewUrl ? (
                <figure className="mt-4 overflow-hidden rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-white">
                  <img
                    src={previewUrl}
                    alt={`ภาพสีจริง Sentinel-2 ของขอบเขตแปลงที่เลือก วันที่ ${formatThaiDate(result.acquisition.acquired_at)}`}
                    className="aspect-square w-full object-contain"
                  />
                  <figcaption className="space-y-1 border-t border-[var(--as-border)] p-3 text-sm text-[var(--as-ink-muted)]">
                    <p>ประกอบด้วยข้อมูล Sentinel-2 Level-2A จาก Copernicus Data Space Ecosystem</p>
                    <p>ใช้ประกอบการตรวจแปลงด้วยสายตาเท่านั้น ไม่ใช่ผลวิเคราะห์สุขภาพพืช</p>
                  </figcaption>
                </figure>
              ) : null}
              {ndviError ? (
                <p role="alert" className="mt-3 font-semibold text-[var(--as-warning)]">
                  {satelliteNdviErrorCopy(ndviError)}
                </p>
              ) : null}
              {ndviSummary ? (
                <section
                  aria-label="สรุป NDVI ของแปลง"
                  className="mt-4 rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-white p-4"
                >
                  <h3 className="font-bold text-[var(--as-ink)]">สรุปค่าความต่างการสะท้อนแสง NDVI</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Info label="NDVI เฉลี่ย" value={formatNdvi(ndviSummary.ndvi_mean)} />
                    <Info
                      label="ช่วงค่าที่พบ"
                      value={`${formatNdvi(ndviSummary.ndvi_min)} ถึง ${formatNdvi(ndviSummary.ndvi_max)}`}
                    />
                    <Info
                      label="พิกเซลที่ใช้ได้"
                      value={`${(ndviSummary.valid_pixel_ratio * 100).toFixed(1)}%`}
                    />
                  </div>
                  <p className="mt-3 text-sm text-[var(--as-ink-muted)]">
                    คำนวณจาก Sentinel-2 Level-2A ในวัน UTC ของภาพล่าสุด ({formatThaiDate(ndviSummary.acquired_at)})
                  </p>
                  <p className="mt-1 text-sm text-[var(--as-ink-muted)]">
                    อัลกอริทึม: {ndviSummary.algorithm_version}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--as-ink-muted)]">
                    ค่าดัชนีช่วยเปรียบเทียบการสะท้อนแสงของพืช ไม่ใช่การวินิจฉัย
                  </p>
                </section>
              ) : null}
            </div>
          </div>
        ) : null}
        {!unavailable && result?.status === "no_data" ? (
          <p className="font-semibold text-[var(--as-ink-muted)]">ข้อมูลยังไม่เพียงพอ: ยังไม่พบภาพ Sentinel-2 ที่ตรงกับเงื่อนไขในช่วงเวลาที่ค้นหา</p>
        ) : null}
        {!unavailable && result?.status === "not_searched" ? (
          <div>
            <p className="font-semibold text-[var(--as-ink)]">ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้</p>
            <p className="mt-1 text-sm text-[var(--as-ink-muted)]">
              เริ่มตรวจสอบเมื่อพร้อม ระบบจะแสดงเฉพาะข้อมูลประกอบภาพที่ค้นพบ
            </p>
          </div>
        ) : null}
        {!latest.isLoading && !result && !unavailable ? (
          <p className="text-[var(--as-ink-muted)]">ยังไม่มีการตรวจสอบภาพดาวเทียมล่าสุด</p>
        ) : null}
      </div>
    </Card>
  );
}

function satelliteErrorCopy(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return "มีคำขอตรวจสอบข้อมูลดาวเทียมมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
  }
  return "ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง";
}

function satellitePreviewErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "มีคำขอภาพดาวเทียมมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
    }
    if (error.code === "satellite_not_searched") {
      return "กรุณาตรวจสอบภาพดาวเทียมล่าสุดก่อนขอภาพสีจริง";
    }
    if (error.code === "satellite_no_data") {
      return "ยังไม่มีพิกเซลภาพที่ใช้ได้สำหรับวันที่เลือก";
    }
    if (error.code === "satellite_insufficient_quality") {
      return "ภาพครั้งนี้ครอบคลุมแปลงไม่เพียงพอ กรุณาลองค้นหาภาพใหม่ภายหลัง";
    }
  }
  return "ยังไม่สามารถเตรียมภาพสีจริงได้ กรุณาลองใหม่ภายหลัง";
}

function satelliteNdviErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "มีคำขอสถิติดาวเทียมมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
    }
    if (error.code === "satellite_not_searched") {
      return "กรุณาตรวจสอบภาพดาวเทียมล่าสุดก่อนขอสรุป NDVI";
    }
    if (error.code === "satellite_no_data") {
      return "ยังไม่มีพิกเซลที่ใช้คำนวณ NDVI ได้สำหรับวันที่เลือก";
    }
    if (error.code === "satellite_insufficient_quality") {
      return "ข้อมูลครั้งนี้ครอบคลุมแปลงไม่เพียงพอสำหรับสรุป NDVI";
    }
    if (error.code === "satellite_request_too_large") {
      return "ขอบเขตแปลงกว้างเกินไปสำหรับคำนวณ NDVI ในครั้งเดียว";
    }
  }
  return "ยังไม่สามารถคำนวณสรุป NDVI ได้ กรุณาลองใหม่ภายหลัง";
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

function formatNdvi(value: number): string {
  return value.toFixed(3);
}
