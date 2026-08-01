"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../components/Button";
import { PageShell } from "../../../components/PageShell";
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
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#173f35]">Create farm</h1>
          <p className="text-[#526057]">This farm will hold the field polygon you draw next.</p>
        </div>
        {organizations.isError ? <p>Please log in before creating a farm.</p> : null}
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => createFarm.mutate(values))}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#173f35]">Organization</span>
            <select
              {...form.register("organization_id")}
              className="h-11 w-full rounded-md border border-[#b8c5b0] bg-white px-3"
            >
              {organizations.data?.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <Input label="Farm name" {...form.register("name")} />
          <Input label="Province" {...form.register("province")} />
          {createFarm.isError ? <p className="text-[#8f2435]">{createFarm.error.message}</p> : null}
          <Button type="submit" disabled={createFarm.isPending || !organizations.data?.length}>
            Save farm
          </Button>
        </form>
      </div>
    </PageShell>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#173f35]">{label}</span>
      <input {...props} className="h-11 w-full rounded-md border border-[#b8c5b0] bg-white px-3" />
    </label>
  );
}
