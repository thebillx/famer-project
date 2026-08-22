"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../../../components/Button";
import { FieldMap } from "../../../../../components/FieldMap";
import { PageShell } from "../../../../../components/PageShell";
import { Card, EmptyState, FormInput, LoadingBlock } from "../../../../../components/Primitives";
import { apiFetch } from "../../../../../lib/api";
import { useOrganizationPermission } from "../../../../../lib/permissions";
import type { Farm, FieldBoundary, GeoJsonPolygon } from "../../../../../lib/types";

export default function NewFieldPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("Field 1");
  const [geometry, setGeometry] = useState<GeoJsonPolygon | null>(null);
  const farm = useQuery({
    queryKey: ["farm", params.id],
    queryFn: () => apiFetch<Farm>(`/api/v1/farms/${params.id}`)
  });
  const permission = useOrganizationPermission(farm.data?.organization_id);
  const saveField = useMutation({
    mutationFn: () =>
      apiFetch<FieldBoundary>(`/api/v1/farms/${params.id}/fields`, {
        method: "POST",
        body: JSON.stringify({ name, geometry })
      }),
    onSuccess: () => router.push(`/farms/${params.id}`)
  });

  return (
    <PageShell>
      <div className="space-y-5">
        <section className="flex flex-col gap-4 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-5 shadow-[var(--as-shadow-md)] lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="as-kicker">Step 2</p>
            <h1 className="as-heading mt-3">Draw field</h1>
            <p className="mt-4 max-w-2xl text-[var(--as-ink-muted)]">
              Click points around the boundary. Drag markers to adjust before saving.
            </p>
          </div>
          {permission.canManage ? (
            <Button type="button" size="lg" disabled={!geometry || !name || saveField.isPending} onClick={() => saveField.mutate()}>
              {saveField.isPending ? "Saving..." : "Save field"}
            </Button>
          ) : null}
        </section>

        {farm.isLoading || permission.isLoading ? <LoadingBlock label="Loading field access..." /> : null}
        {farm.isError || permission.isError ? (
          <EmptyState
            title={(farm.error ?? permission.error)?.message ?? "Field access could not be loaded."}
            description="Check your connection and organization membership before trying again."
            role="alert"
          />
        ) : null}
        {!farm.isLoading && !farm.isError && !permission.isLoading && !permission.isError && !permission.canManage ? (
          <EmptyState
            title="View-only access"
            description="Field-manager access is required to draw and save a field boundary."
          />
        ) : null}
        {permission.canManage ? (
        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <Card premium className="p-5">
            <FormInput
              label="Field name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              hint="Use a name farmers recognize in the field."
            />
            <div className="mt-6 space-y-3 rounded-[var(--as-radius-md)] bg-[var(--as-surface-soft)] p-4 text-sm text-[var(--as-ink-muted)]">
              <p className="font-bold text-[var(--as-ink)]">Drawing checklist</p>
              <p>1. Add at least 3 vertices.</p>
              <p>2. Drag markers to refine the boundary.</p>
              <p>3. Save to calculate authoritative area.</p>
            </div>
            {saveField.isError ? (
              <p role="alert" className="mt-4 rounded-[var(--as-radius-md)] border border-[var(--as-danger)] bg-[var(--as-danger-soft)] p-3 text-sm font-semibold text-[var(--as-danger)]">
                {saveField.error.message}
              </p>
            ) : null}
          </Card>
          <FieldMap editable onGeometryChange={setGeometry} />
        </div>
        ) : null}
      </div>
    </PageShell>
  );
}
