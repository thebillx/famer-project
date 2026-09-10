"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import type React from "react";
import { buttonClassName } from "../../components/Button";
import { FarmCollection } from "../../components/farms/FarmCollection";
import { PageShell } from "../../components/PageShell";
import { LoadingBlock } from "../../components/Primitives";
import { ApiError, apiFetch } from "../../lib/api";
import { useFarmListPermissions } from "../../lib/permissions";
import type { Farm, User } from "../../lib/types";

const AUTH_FAILURES = new Set(["authentication_required", "invalid_refresh_token"]);
const TENANT_QUERY_ROOTS = new Set([
  "current-user",
  "farms",
  "farm",
  "fields",
  "organizations",
  "organization-members",
  "satellite-latest",
  "observations"
]);

function isTerminalAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && AUTH_FAILURES.has(error.code);
}

function farmErrorCopy(error: unknown): { title: string; description: string } {
  if (!(error instanceof ApiError)) {
    return {
      title: "โหลดรายการฟาร์มไม่สำเร็จ",
      description: "ไม่สามารถเชื่อมต่อบริการได้ กรุณาลองใหม่อีกครั้ง"
    };
  }
  if (error.status === 403) {
    return {
      title: "บัญชีนี้ไม่มีสิทธิ์เปิดรายการฟาร์ม",
      description: "ระบบไม่แสดงรายละเอียดของพื้นที่ทำงานที่บัญชีนี้เข้าถึงไม่ได้"
    };
  }
  if (error.status === 404 || error.status === 422) {
    return {
      title: "ไม่พบรายการที่มองเห็นได้",
      description: "ตัวเลือกพื้นที่ทำงานไม่ถูกต้องหรือไม่พร้อมให้บัญชีนี้ใช้งาน"
    };
  }
  if (error.status === 429) {
    return {
      title: "มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง",
      description: "ระบบหยุดการลองซ้ำอัตโนมัติแล้ว คุณสามารถลองใหม่เมื่อพร้อม"
    };
  }
  return {
    title: "โหลดรายการฟาร์มไม่สำเร็จ",
    description: "บริการรายการฟาร์มยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง"
  };
}

function StatePanel({
  title,
  description,
  role,
  action
}: {
  title: string;
  description: string;
  role?: "alert" | "status";
  action?: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--as-radius-lg)] border border-[var(--as-border)] bg-[var(--as-surface)] p-6 shadow-[var(--as-shadow-sm)]"
      role={role}
    >
      <h2 className="text-lg font-bold text-[var(--as-ink)]">{title}</h2>
      <p className="mt-2 max-w-2xl text-[var(--as-ink-muted)]">{description}</p>
      {action ? <div className="mt-5 flex flex-wrap gap-3">{action}</div> : null}
    </section>
  );
}

export default function FarmsPage() {
  const queryClient = useQueryClient();
  const identity = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => apiFetch<User>("/api/v1/auth/me", { signal }),
    retry: false
  });
  const farms = useQuery({
    queryKey: ["farms", identity.data?.id],
    queryFn: ({ signal }) => apiFetch<Farm[]>("/api/v1/farms", { signal }),
    enabled: Boolean(identity.data),
    retry: false
  });
  const permissions = useFarmListPermissions(identity.data);

  const terminalAuth = [identity.error, farms.error, ...permissions.errors].some(isTerminalAuthError);
  const identitySettled = identity.isSuccess && !identity.isFetching;
  const canCreateFarm = identitySettled && permissions.manageableOrganizations.length > 0;
  const farmData = identitySettled ? farms.data : undefined;
  const hasFarms = Boolean(farmData?.length);
  const hasResolvedFarmData = farmData !== undefined;

  useEffect(() => {
    if (!terminalAuth) return;
    void queryClient.cancelQueries({
      predicate: (query) => TENANT_QUERY_ROOTS.has(String(query.queryKey[0]))
    });
    queryClient.removeQueries({
      predicate: (query) => TENANT_QUERY_ROOTS.has(String(query.queryKey[0]))
    });
  }, [queryClient, terminalAuth]);

  const retryIdentity = () => void identity.refetch();
  const retryFarms = () => void farms.refetch();
  const retryPermissions = () => void permissions.retry();

  return (
    <PageShell>
      <div className="space-y-6">
        <section className="flex flex-col gap-5 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-6 shadow-[var(--as-shadow-md)] md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <p className="as-kicker">พื้นที่ทำงานฟาร์ม</p>
            <h1 className="as-heading mt-3">ฟาร์มของคุณ</h1>
            <p className="mt-4 text-[var(--as-ink-muted)]">
              เลือกฟาร์มเพื่อดูแปลงที่บันทึกไว้ หรือสร้างฟาร์มใหม่เมื่อบัญชีของคุณมีสิทธิ์
            </p>
            {farmData && !(farms.isError && farmData.length === 0) ? (
              <p className="mt-4 font-bold text-[var(--as-primary)]" aria-live="polite">
                ฟาร์มที่เข้าถึงได้ {farmData.length} แห่ง
              </p>
            ) : null}
          </div>
          {canCreateFarm && hasFarms && !terminalAuth ? (
            <Link href="/farms/new" className={buttonClassName({ size: "lg" })}>
              สร้างฟาร์ม
            </Link>
          ) : null}
        </section>

        {identity.isPending || identity.isFetching ? (
          <LoadingBlock label="กำลังตรวจสอบบัญชี…" />
        ) : null}

        {terminalAuth ? (
          <StatePanel
            role="alert"
            title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"
            description="ข้อมูลพื้นที่ทำงานถูกซ่อนแล้วเพื่อป้องกันการแสดงข้อมูลจากบัญชีก่อนหน้า"
            action={<Link href="/login" className={buttonClassName()}>ไปหน้าเข้าสู่ระบบ</Link>}
          />
        ) : null}

        {!terminalAuth && identity.isError ? (
          <StatePanel
            role="alert"
            title="ตรวจสอบบัญชีไม่สำเร็จ"
            description={identity.error instanceof Error ? identity.error.message : "กรุณาลองใหม่อีกครั้ง"}
            action={<button type="button" className={buttonClassName()} onClick={retryIdentity}>ลองใหม่</button>}
          />
        ) : null}

        {!terminalAuth && identitySettled && farms.isPending ? (
          <LoadingBlock label="กำลังโหลดรายการฟาร์ม…" />
        ) : null}

        {!terminalAuth && identitySettled && farms.isError && !hasFarms ? (
          <StatePanel
            role="alert"
            {...(hasResolvedFarmData
              ? {
                  title: "ยังยืนยันไม่ได้ว่ารายการฟาร์มว่างอยู่",
                  description: "การอัปเดตครั้งล่าสุดไม่สำเร็จ ระบบจึงไม่แสดงสถานะไม่มีฟาร์มจนกว่าจะตรวจสอบใหม่"
                }
              : farmErrorCopy(farms.error))}
            action={<button type="button" className={buttonClassName()} onClick={retryFarms}>ลองโหลดอีกครั้ง</button>}
          />
        ) : null}

        {!terminalAuth && hasFarms ? (
          <>
            {farms.isFetching ? (
              <p role="status" className="font-semibold text-[var(--as-ink-muted)]">
                กำลังอัปเดตรายการ…
              </p>
            ) : null}
            {farms.isError ? (
              <StatePanel
                role="alert"
                title="รายการที่แสดงอาจไม่ใช่ข้อมูลล่าสุด"
                description="การอัปเดตครั้งล่าสุดไม่สำเร็จ คุณยังเปิดข้อมูลที่ตรวจสอบแล้วของบัญชีเดิมได้"
                action={<button type="button" className={buttonClassName({ variant: "secondary" })} onClick={retryFarms}>ลองอัปเดตอีกครั้ง</button>}
              />
            ) : null}
            {permissions.isPending || permissions.isFetching ? (
              <p role="status" className="rounded-[var(--as-radius-md)] border border-[var(--as-border)] bg-[var(--as-surface-soft)] p-4 text-[var(--as-ink-muted)]">
                กำลังตรวจสอบสิทธิ์การสร้างฟาร์ม…
              </p>
            ) : null}
            {permissions.isError ? (
              <StatePanel
                role="alert"
                title="ยังตรวจสอบสิทธิ์การสร้างฟาร์มไม่ได้"
                description="ปุ่มสร้างฟาร์มจึงถูกปิดไว้เพื่อความปลอดภัย"
                action={<button type="button" className={buttonClassName({ variant: "secondary" })} onClick={retryPermissions}>ลองตรวจสอบสิทธิ์อีกครั้ง</button>}
              />
            ) : null}
            {!permissions.isPending && !permissions.isFetching && !permissions.isError && !canCreateFarm ? (
              <StatePanel
                title="สิทธิ์สำหรับการดูข้อมูล"
                description="คุณเปิดดูฟาร์มและแปลงได้ แต่การสร้างฟาร์มต้องใช้สิทธิ์ผู้จัดการแปลงขึ้นไป"
              />
            ) : null}
            <FarmCollection farms={farmData ?? []} organizationNames={permissions.organizationNames} />
          </>
        ) : null}

        {!terminalAuth && identitySettled && !farms.isError && farmData?.length === 0 && (permissions.isPending || permissions.isFetching) ? (
          <StatePanel
            role="status"
            title="กำลังตรวจสอบสิทธิ์การสร้างฟาร์ม…"
            description="ระบบจะแสดงทางเลือกที่เหมาะกับบทบาทของบัญชีหลังตรวจสอบสิทธิ์เสร็จ"
          />
        ) : null}

        {!terminalAuth && identitySettled && !farms.isError && farmData?.length === 0 && !permissions.isPending && !permissions.isFetching ? (
          permissions.isError ? (
            <StatePanel
              role="alert"
              title="ยังตรวจสอบสิทธิ์การสร้างฟาร์มไม่ได้"
              description="ปุ่มสร้างฟาร์มจึงถูกปิดไว้เพื่อความปลอดภัย"
              action={<button type="button" className={buttonClassName({ variant: "secondary" })} onClick={retryPermissions}>ลองตรวจสอบสิทธิ์อีกครั้ง</button>}
            />
          ) : permissions.organizations.length === 0 ? (
            <StatePanel
              title="บัญชีนี้ยังไม่มีพื้นที่ทำงานขององค์กร"
              description="เมื่อบัญชีได้รับสมาชิกภาพที่ใช้งานอยู่ รายการฟาร์มที่เข้าถึงได้จะแสดงที่นี่"
            />
          ) : canCreateFarm ? (
            <StatePanel
              title="ยังไม่มีฟาร์ม"
              description="เริ่มสร้างพื้นที่ทำงานฟาร์มแรกขององค์กรที่คุณมีสิทธิ์จัดการ"
              action={<Link href="/farms/new" className={buttonClassName()}>สร้างฟาร์มแรก</Link>}
            />
          ) : (
            <StatePanel
              title="ยังไม่มีฟาร์มที่เข้าถึงได้"
              description="บัญชีนี้ยังไม่มีรายการฟาร์มที่เปิดดูได้ในพื้นที่ทำงานปัจจุบัน"
            />
          )
        ) : null}
      </div>
    </PageShell>
  );
}
