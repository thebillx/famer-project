"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, buttonClassName } from "../../../../../components/Button";
import { FieldMap } from "../../../../../components/FieldMap";
import { PageShell } from "../../../../../components/PageShell";
import { Card, EmptyState, FormInput, LoadingBlock } from "../../../../../components/Primitives";
import { apiFetch } from "../../../../../lib/api";
import { useOrganizationPermission } from "../../../../../lib/permissions";
import type { Farm, FieldBoundary, GeoJsonPolygon } from "../../../../../lib/types";

export default function NewFieldPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("แปลง 1");
  const [geometry, setGeometry] = useState<GeoJsonPolygon | null>(null);
  const [pointCount, setPointCount] = useState(0);

  const farm = useQuery({
    queryKey: ["farm", params.id],
    queryFn: () => apiFetch<Farm>(`/api/v1/farms/${params.id}`)
  });
  const permission = useOrganizationPermission(farm.data?.organization_id);
  const saveField = useMutation({
    mutationFn: () =>
      apiFetch<FieldBoundary>(`/api/v1/farms/${params.id}/fields`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), geometry })
      }),
    onSuccess: () => router.push(`/farms/${params.id}`)
  });

  const saveState = useMemo(() => {
    if (!name.trim()) return "กรุณาตั้งชื่อแปลง";
    if (pointCount < 3) return `เพิ่มอีก ${3 - pointCount} จุดเพื่อสร้างขอบเขต`;
    return "ขอบเขตพร้อมบันทึก พื้นที่จะคำนวณโดยเซิร์ฟเวอร์";
  }, [name, pointCount]);

  return (
    <PageShell>
      <div className="mx-auto max-w-[1500px] space-y-5 pb-28">
        <nav aria-label="ขั้นตอนการเพิ่มพื้นที่" className="flex items-center gap-3 text-sm font-semibold text-[var(--as-ink-muted)]">
          <span>1 ข้อมูลฟาร์ม</span>
          <span aria-hidden="true">→</span>
          <span className="rounded-full bg-[var(--as-primary)] px-3 py-1.5 text-white">2 ขอบเขตแปลง</span>
        </nav>

        <section className="flex flex-col gap-4 border-b border-[var(--as-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="as-kicker">กำหนดพื้นที่จริง</p>
            <h1 className="as-heading mt-3">เพิ่มแปลงใน{farm.data ? ` ${farm.data.name}` : "ฟาร์ม"}</h1>
            <p className="mt-4 max-w-2xl text-[var(--as-ink-muted)]">
              เลือกวาดขอบเขตบนแผนที่หรือกรอกพิกัด ทั้งสองวิธีใช้จุดชุดเดียวกันและสลับไปมาได้
            </p>
          </div>
          <Link href={`/farms/${params.id}`} className={buttonClassName({ variant: "ghost" })}>
            กลับไปที่ฟาร์ม
          </Link>
        </section>

        {farm.isLoading || permission.isLoading ? <LoadingBlock label="กำลังตรวจสอบสิทธิ์การเพิ่มแปลง…" /> : null}

        {farm.isError || permission.isError ? (
          <EmptyState
            title="ยังเปิดหน้าสร้างแปลงไม่ได้"
            description="ตรวจสอบการเชื่อมต่อและสิทธิ์ของบัญชี แล้วลองอีกครั้ง"
            role="alert"
          />
        ) : null}

        {!farm.isLoading && !farm.isError && !permission.isLoading && !permission.isError && !permission.canManage ? (
          <EmptyState
            title="บัญชีนี้มีสิทธิ์ดูข้อมูลเท่านั้น"
            description="ต้องมีสิทธิ์ผู้จัดการแปลงขึ้นไปจึงจะเพิ่มขอบเขตแปลงได้"
          />
        ) : null}

        {permission.canManage ? (
          <>
            <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
              <Card className="self-start p-5 xl:sticky xl:top-20">
                <FormInput
                  label="ชื่อแปลง"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="เช่น แปลงเหนือ"
                  hint="ใช้ชื่อที่คุณจำได้ง่ายเมื่ออยู่ในพื้นที่จริง"
                  aria-required="true"
                />

                <div className="mt-5 space-y-2 border-t border-[var(--as-border)] pt-5 text-sm text-[var(--as-ink-muted)]">
                  <p className="font-bold text-[var(--as-ink)]">วิธีกำหนดขอบเขต</p>
                  <p>• วาดบนแผนที่: แตะตามมุมของแปลง</p>
                  <p>• กรอกพิกัด: ใช้ WGS84 แบบทศนิยม</p>
                  <p>• ครบอย่างน้อย 3 จุดแล้วจึงบันทึกได้</p>
                </div>

                <div
                  className="mt-5 rounded-[var(--as-radius-md)] bg-[var(--as-surface-soft)] px-4 py-3"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-xs font-bold text-[var(--as-primary)]">สถานะขอบเขต</p>
                  <p className="mt-1 text-sm text-[var(--as-ink-muted)]">
                    {pointCount} จุด · {saveState}
                  </p>
                </div>

                {saveField.isError ? (
                  <p role="alert" className="mt-4 rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
                    บันทึกแปลงไม่สำเร็จ กรุณาตรวจสอบขอบเขตและลองอีกครั้ง
                  </p>
                ) : null}
              </Card>

              <FieldMap
                editable
                onGeometryChange={setGeometry}
                onPointCountChange={setPointCount}
              />
            </div>

            <div className="sticky bottom-3 z-30">
              <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[var(--as-radius-lg)] border border-[var(--as-border-strong)] bg-[var(--as-surface)] p-3 shadow-[var(--as-shadow-lg)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--as-ink)]">
                    {pointCount >= 3 && name.trim() ? "พร้อมบันทึกแปลง" : "ยังบันทึกไม่ได้"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--as-ink-muted)]">{saveState}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/farms/${params.id}`} className={buttonClassName({ variant: "ghost", size: "lg" })}>
                    ยกเลิก
                  </Link>
                  <Button
                    type="button"
                    size="lg"
                    isLoading={saveField.isPending}
                    loadingLabel="กำลังบันทึก…"
                    disabled={!geometry || !name.trim()}
                    onClick={() => saveField.mutate()}
                  >
                    บันทึกแปลง
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
