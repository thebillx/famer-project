"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { buttonClassName } from "../../../components/Button";
import { FieldMap } from "../../../components/FieldMap";
import { PageShell } from "../../../components/PageShell";
import { EmptyState, LoadingBlock, MetricCard } from "../../../components/Primitives";
import { SatelliteStatusCard } from "../../../components/SatelliteStatusCard";
import { apiFetch } from "../../../lib/api";
import { useOrganizationPermission } from "../../../lib/permissions";
import type { Farm, FieldBoundary } from "../../../lib/types";

export default function FarmDetailPage() {
  const params = useParams<{ id: string }>();
  const farm = useQuery({
    queryKey: ["farm", params.id],
    queryFn: () => apiFetch<Farm>(`/api/v1/farms/${params.id}`)
  });
  const fields = useQuery({
    queryKey: ["fields", params.id],
    queryFn: () => apiFetch<FieldBoundary[]>(`/api/v1/farms/${params.id}/fields`),
    enabled: Boolean(params.id)
  });
  const permission = useOrganizationPermission(farm.data?.organization_id);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const selectedField = fields.data?.find((field) => field.id === selectedFieldId) ?? fields.data?.[0];

  return (
    <PageShell>
      {farm.isLoading ? <LoadingBlock label="กำลังโหลดข้อมูลฟาร์ม..." /> : null}
      {farm.isError ? (
        <EmptyState
          title="ไม่พบฟาร์มหรือคุณไม่มีสิทธิ์เข้าถึง"
          description="ตรวจสอบว่าบัญชีของคุณยังเป็นสมาชิกที่ใช้งานอยู่ในองค์กรนี้"
          role="alert"
        />
      ) : null}
      {farm.data ? (
        <div className="space-y-6">
          <section className="flex flex-col gap-5 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-6 shadow-[var(--as-shadow-md)] lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="as-kicker">รายละเอียดฟาร์ม</p>
              <h1 className="as-heading mt-3">{farm.data.name}</h1>
              <p className="mt-3 text-[var(--as-ink-muted)]">{farm.data.province ?? "ยังไม่ได้ระบุจังหวัด"}</p>
            </div>
            {permission.canManage ? (
              <Link href={`/farms/${farm.data.id}/fields/new`} className={buttonClassName({ size: "lg" })}>เพิ่มแปลง</Link>
            ) : !permission.isLoading && !permission.isError ? (
              <span className="as-pill">ดูข้อมูลได้อย่างเดียว</span>
            ) : null}
          </section>
          {!permission.isLoading && permission.isError ? (
            <EmptyState
              title="ตรวจสอบสิทธิ์การจัดการไม่สำเร็จ"
              description="คุณยังอ่านข้อมูลแปลงได้ แต่ระบบจะซ่อนปุ่มเพิ่มแปลงจนกว่าจะตรวจสอบบทบาทได้"
              role="alert"
            />
          ) : null}
          {fields.isLoading ? <LoadingBlock label="กำลังโหลดแปลงที่บันทึกไว้..." /> : null}
          {fields.isError ? (
            <EmptyState
              title="โหลดข้อมูลแปลงไม่สำเร็จ"
              description="ยังไม่สามารถแสดงขอบเขตแปลงที่บันทึกไว้ได้ กรุณาตรวจสอบการเชื่อมต่อและสิทธิ์แล้วลองอีกครั้ง"
              role="alert"
            />
          ) : null}
          {!fields.isLoading && !fields.isError && selectedField ? (
            <div className="space-y-5">
              <section
                aria-labelledby="saved-fields-heading"
                className="min-w-0 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-5 shadow-[var(--as-shadow-sm)]"
              >
                <h2 id="saved-fields-heading" className="text-xl font-bold text-[var(--as-ink)]">แปลงที่บันทึกไว้</h2>
                <p className="mt-1 text-sm text-[var(--as-ink-muted)]">เลือกหนึ่งแปลงเพื่อดูพื้นที่ ขอบเขต และข้อมูลดาวเทียมล่าสุด</p>
                <ul aria-label="แปลงที่บันทึกไว้" className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fields.data?.map((field) => {
                    const active = field.id === selectedField.id;
                    return (
                      <li key={field.id} className="min-w-0">
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedFieldId(field.id)}
                          className={`min-h-11 w-full min-w-0 rounded-[var(--as-radius-md)] border px-4 py-3 text-left font-bold transition ${
                            active
                              ? "border-[var(--as-primary)] bg-[var(--as-surface-soft)] text-[var(--as-primary)] shadow-[var(--as-shadow-sm)]"
                              : "border-[var(--as-border)] bg-[var(--as-bg)] text-[var(--as-ink)] hover:bg-[var(--as-surface-soft)]"
                          }`}
                        >
                          <span className="block break-words">{field.name}</span>
                          {active ? <span className="mt-1 block text-xs font-semibold">กำลังดูแปลงนี้</span> : null}
                        </button>
                        <Link
                          href={`/fields/${field.id}`}
                          aria-label={`เปิดพื้นที่ทำงานของ ${field.name}`}
                          className={buttonClassName({ variant: "secondary", className: "mt-2 w-full" })}
                        >
                          เปิดพื้นที่ทำงานแปลง
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
              <div aria-live="polite" className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricCard label="แปลงที่เลือก" value={selectedField.name} detail="ขอบเขตที่บันทึกไว้" />
                  <MetricCard
                    label="พื้นที่คำนวณโดยเซิร์ฟเวอร์"
                    value={`${selectedField.area_rai} ไร่`}
                    detail={`${selectedField.area_sqm} ตร.ม. / ${selectedField.area_rai} ไร่`}
                    tone="success"
                  />
                  <MetricCard
                    label="ข้อมูลดาวเทียม"
                    value="ตรวจสอบเมื่อพร้อม"
                    detail="ค้นหาเฉพาะข้อมูลประกอบภาพล่าสุด"
                    tone="satellite"
                  />
                </div>
                <SatelliteStatusCard key={selectedField.id} fieldId={selectedField.id} />
                <FieldMap key={selectedField.id} initialGeometry={selectedField.geometry} />
              </div>
            </div>
          ) : null}
          {!fields.isLoading && !fields.isError && !selectedField ? (
            <EmptyState
              title="ยังไม่มีขอบเขตแปลงที่บันทึกไว้"
              description="เพิ่มรูปหลายเหลี่ยมแปลงแรกเพื่อให้เซิร์ฟเวอร์คำนวณพื้นที่และใช้ตรวจสอบข้อมูลดาวเทียม"
              action={permission.canManage ? (
                <Link href={`/farms/${farm.data.id}/fields/new`} className={buttonClassName()}>เพิ่มแปลงแรก</Link>
              ) : undefined}
            />
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
