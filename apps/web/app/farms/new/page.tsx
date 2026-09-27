"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, buttonClassName } from "../../../components/Button";
import { PageShell } from "../../../components/PageShell";
import { Card, EmptyState, FormInput, LoadingBlock } from "../../../components/Primitives";
import { apiFetch } from "../../../lib/api";
import { useManageableOrganizations } from "../../../lib/permissions";
import type { Farm } from "../../../lib/types";

const schema = z.object({
  organization_id: z.string().min(1),
  name: z.string().min(1, "กรุณากรอกชื่อฟาร์ม"),
  province: z.string().optional()
});

type FarmForm = z.infer<typeof schema>;

export default function NewFarmPage() {
  const router = useRouter();
  const access = useManageableOrganizations();
  const form = useForm<FarmForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      organization_id: "",
      name: "",
      province: ""
    }
  });

  useEffect(() => {
    const current = form.getValues("organization_id");
    const firstOrganization = access.manageableOrganizations[0]?.id;
    if (!current && firstOrganization) {
      form.setValue("organization_id", firstOrganization);
    }
  }, [access.manageableOrganizations, form]);

  const createFarm = useMutation({
    mutationFn: (values: FarmForm) =>
      apiFetch<Farm>("/api/v1/farms", {
        method: "POST",
        body: JSON.stringify({ ...values, province: values.province || null })
      }),
    onSuccess: (farm) => router.push(`/farms/${farm.id}/fields/new?onboarding=1`)
  });

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <nav aria-label="ขั้นตอนการเพิ่มพื้นที่" className="flex items-center gap-3 text-sm font-semibold text-[var(--as-ink-muted)]">
          <span className="rounded-full bg-[var(--as-primary)] px-3 py-1.5 text-white">1 ข้อมูลฟาร์ม</span>
          <span aria-hidden="true">→</span>
          <span>2 ขอบเขตแปลง</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[0.78fr_1fr]">
          <section className="space-y-5">
            <div>
              <p className="as-kicker">เริ่มต้นใช้งาน</p>
              <h1 className="as-heading mt-3">สร้างฟาร์ม</h1>
              <p className="mt-4 max-w-xl text-[var(--as-ink-muted)]">
                ตั้งชื่อพื้นที่ทำงานของคุณก่อน แล้วระบบจะพาไปกำหนดขอบเขตแปลงแรกทันที
              </p>
            </div>

            <Card className="p-5">
              <p className="font-bold text-[var(--as-ink)]">ขั้นตอนถัดไป</p>
              <p className="mt-2 text-sm leading-6 text-[var(--as-ink-muted)]">
                คุณสามารถกำหนดขอบเขตแปลงโดยแตะบนแผนที่ หรือกรอกละติจูดและลองจิจูดแบบ WGS84
                ทีละจุดก็ได้ ทั้งสองวิธีใช้ขอบเขตเดียวกันและปรับแก้ต่อกันได้
              </p>
            </Card>
          </section>

          <Card premium className="p-5 sm:p-6">
            {access.isLoading ? <LoadingBlock label="กำลังตรวจสอบสิทธิ์ขององค์กร…" /> : null}
            {access.isError ? (
              <p role="alert" className="rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
                {access.error instanceof Error ? access.error.message : "ไม่สามารถตรวจสอบสิทธิ์ขององค์กรได้"}
              </p>
            ) : null}

            {!access.isLoading && !access.isError && access.manageableOrganizations.length === 0 ? (
              <EmptyState
                title="บัญชีนี้มีสิทธิ์ดูข้อมูลเท่านั้น"
                description="ต้องมีสิทธิ์ผู้จัดการแปลงขึ้นไปจึงจะสร้างฟาร์มใหม่ได้"
              />
            ) : null}

            {access.manageableOrganizations.length > 0 ? (
              <form
                className="space-y-5"
                onSubmit={form.handleSubmit((values) => createFarm.mutate(values))}
              >
                <label className="block">
                  <span className="as-label">องค์กร</span>
                  <select {...form.register("organization_id")} className="as-input">
                    {access.manageableOrganizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>

                <FormInput
                  label="ชื่อฟาร์ม"
                  placeholder="เช่น สวนเชียงใหม่"
                  error={form.formState.errors.name?.message}
                  {...form.register("name")}
                />
                <FormInput
                  label="จังหวัด"
                  placeholder="เช่น เชียงใหม่"
                  hint="ใช้สำหรับช่วยระบุพื้นที่ของฟาร์ม"
                  {...form.register("province")}
                />

                {createFarm.isError ? (
                  <p role="alert" className="rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
                    สร้างฟาร์มไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="lg" isLoading={createFarm.isPending} loadingLabel="กำลังสร้างฟาร์ม…">
                    บันทึกและเพิ่มแปลง
                  </Button>
                  <Link href="/farms" className={buttonClassName({ variant: "ghost", size: "lg" })}>
                    ยกเลิก
                  </Link>
                </div>
              </form>
            ) : null}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
