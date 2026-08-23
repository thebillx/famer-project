"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { buttonClassName } from "../../../components/Button";
import { FieldMap } from "../../../components/FieldMap";
import { PageShell } from "../../../components/PageShell";
import { EmptyState, LoadingBlock, MetricCard } from "../../../components/Primitives";
import { SatelliteStatusCard } from "../../../components/SatelliteStatusCard";
import { ApiError, apiFetch } from "../../../lib/api";
import type { FieldBoundary, User } from "../../../lib/types";

const AUTH_FAILURES = new Set(["authentication_required", "invalid_refresh_token"]);
const TENANT_QUERY_ROOTS = new Set([
  "current-user",
  "farms",
  "farm",
  "fields",
  "field",
  "organizations",
  "organization-members",
  "satellite-latest"
]);

function isTerminalAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && AUTH_FAILURES.has(error.code);
}

export default function FieldWorkspacePage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const identity = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => apiFetch<User>("/api/v1/auth/me", { signal }),
    retry: false
  });
  const identitySettled = identity.isSuccess && !identity.isFetching;
  const field = useQuery({
    queryKey: ["field", identity.data?.id, params.id],
    queryFn: ({ signal }) => apiFetch<FieldBoundary>(`/api/v1/fields/${params.id}`, { signal }),
    enabled: identitySettled && Boolean(params.id),
    retry: false
  });
  const terminalAuth = [identity.error, field.error].some(isTerminalAuthError);
  const notFound = field.error instanceof ApiError && field.error.status === 404;
  const otherError = field.isError && !terminalAuth && !notFound;

  useEffect(() => {
    if (!terminalAuth) return;
    void queryClient.cancelQueries({
      predicate: (query) => TENANT_QUERY_ROOTS.has(String(query.queryKey[0]))
    });
    queryClient.removeQueries({
      predicate: (query) => TENANT_QUERY_ROOTS.has(String(query.queryKey[0]))
    });
  }, [queryClient, terminalAuth]);

  return (
    <PageShell>
      <div className="space-y-6">
        {identity.isPending || identity.isFetching ? (
          <LoadingBlock label="กำลังตรวจสอบบัญชี..." />
        ) : null}

        {!terminalAuth && !identity.isFetching && identity.isError ? (
          <EmptyState
            title="ตรวจสอบบัญชีไม่สำเร็จ"
            description="ยังไม่สามารถยืนยันบัญชีที่กำลังใช้งานได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
            role="alert"
            action={(
              <button type="button" className={buttonClassName()} onClick={() => void identity.refetch()}>
                ลองตรวจสอบบัญชีอีกครั้ง
              </button>
            )}
          />
        ) : null}

        {!terminalAuth && identitySettled && (field.isPending || (field.isFetching && !field.data)) ? (
          <LoadingBlock label="กำลังโหลดพื้นที่ทำงานแปลง..." />
        ) : null}

        {terminalAuth ? (
          <EmptyState
            title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"
            description="ระบบซ่อนข้อมูลแปลงไว้จนกว่าคุณจะเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์อีกครั้ง"
            role="alert"
            action={<Link href="/login" className={buttonClassName()}>ไปหน้าเข้าสู่ระบบ</Link>}
          />
        ) : null}

        {!terminalAuth && identitySettled && notFound ? (
          <EmptyState
            title="ไม่พบแปลงหรือคุณไม่มีสิทธิ์เข้าถึง"
            description="ตรวจสอบว่าบัญชีของคุณยังเป็นสมาชิกที่ใช้งานอยู่และเปิดแปลงจากฟาร์มที่เข้าถึงได้"
            role="alert"
          />
        ) : null}

        {identitySettled && otherError ? (
          <EmptyState
            title="โหลดข้อมูลแปลงไม่สำเร็จ"
            description="ยังไม่สามารถเปิดพื้นที่ทำงานแปลงได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"
            role="alert"
            action={(
              <button type="button" className={buttonClassName()} onClick={() => void field.refetch()}>
                ลองโหลดอีกครั้ง
              </button>
            )}
          />
        ) : null}

        {!terminalAuth && identitySettled && field.data && !field.isError ? (
          <>
            <section className="flex min-w-0 flex-col gap-5 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-6 shadow-[var(--as-shadow-md)] md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="as-kicker">พื้นที่ทำงานแปลง</p>
                <h1 className="as-heading mt-3 break-words">{field.data.name}</h1>
                <p className="mt-3 text-[var(--as-ink-muted)]">ขอบเขตที่บันทึกไว้และข้อมูลประกอบภาพ Sentinel-2 ล่าสุด</p>
              </div>
              <Link href={`/farms/${field.data.farm_id}`} className={buttonClassName({ variant: "secondary" })}>
                กลับไปฟาร์ม
              </Link>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard
                label="พื้นที่คำนวณโดยเซิร์ฟเวอร์"
                value={`${field.data.area_rai} ไร่`}
                detail={`${field.data.area_sqm} ตร.ม. / ${field.data.area_rai} ไร่`}
                tone="success"
              />
              <MetricCard
                label="ข้อมูลดาวเทียม"
                value="ตรวจสอบเมื่อพร้อม"
                detail="ค้นหาเฉพาะข้อมูลประกอบภาพล่าสุด"
                tone="satellite"
              />
            </div>

            <SatelliteStatusCard fieldId={field.data.id} />

            <section aria-labelledby="saved-boundary-heading" className="space-y-3">
              <div>
                <h2 id="saved-boundary-heading" className="text-xl font-bold text-[var(--as-ink)]">ขอบเขตแปลงที่บันทึกไว้</h2>
                <p className="mt-1 text-sm text-[var(--as-ink-muted)]">แผนที่นี้แสดงขอบเขตแบบอ่านอย่างเดียวจากข้อมูลที่บันทึกไว้</p>
              </div>
              <FieldMap initialGeometry={field.data.geometry} />
            </section>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
