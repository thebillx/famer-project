"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../components/Button";
import { PageShell } from "../../../components/PageShell";
import { Card, FormInput, LoadingBlock } from "../../../components/Primitives";
import { apiFetch } from "../../../lib/api";
import type { Farm, Organization } from "../../../lib/types";

const schema = z.object({
  organization_id: z.string().min(1),
  name: z.string().min(1),
  province: z.string().optional()
});

type FarmForm = z.infer<typeof schema>;

export default function NewFarmPage() {
  const router = useRouter();
  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => apiFetch<Organization[]>("/api/v1/organizations")
  });
  const form = useForm<FarmForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      organization_id: organizations.data?.[0]?.id ?? "",
      name: "",
      province: ""
    }
  });
  useEffect(() => {
    const current = form.getValues("organization_id");
    const firstOrganization = organizations.data?.[0]?.id;
    if (!current && firstOrganization) {
      form.setValue("organization_id", firstOrganization);
    }
  }, [form, organizations.data]);
  const createFarm = useMutation({
    mutationFn: (values: FarmForm) =>
      apiFetch<Farm>("/api/v1/farms", {
        method: "POST",
        body: JSON.stringify({ ...values, province: values.province || null })
      }),
    onSuccess: (farm) => router.push(`/farms/${farm.id}`)
  });

  return (
    <PageShell>
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.75fr_1fr]">
        <section className="space-y-5">
          <div>
            <p className="as-kicker">Step 1</p>
            <h1 className="as-heading mt-3">Create farm</h1>
            <p className="mt-4 text-[var(--as-ink-muted)]">
              This farm becomes the workspace that holds field boundaries and satellite metadata.
            </p>
          </div>
          <Card className="p-5">
            <p className="font-bold text-[var(--as-ink)]">Next</p>
            <p className="mt-2 text-sm text-[var(--as-ink-muted)]">
              After saving, draw the field polygon on a real basemap and the backend will calculate authoritative area.
            </p>
          </Card>
        </section>

        <Card premium className="p-5 sm:p-6">
          {organizations.isLoading ? <LoadingBlock label="Loading organizations..." /> : null}
          {organizations.isError ? (
            <p className="rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
              Please log in before creating a farm.
            </p>
          ) : null}
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => createFarm.mutate(values))}>
            <label className="block">
              <span className="as-label">Organization</span>
              <select {...form.register("organization_id")} className="as-input">
                {organizations.data?.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <FormInput label="Farm name" {...form.register("name")} />
            <FormInput label="Province" {...form.register("province")} />
            {createFarm.isError ? (
              <p className="rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
                {createFarm.error.message}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={createFarm.isPending || !organizations.data?.length}>
              {createFarm.isPending ? "Saving..." : "Save farm"}
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
