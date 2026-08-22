"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  const firstField = fields.data?.[0];

  return (
    <PageShell>
      {farm.isLoading ? <LoadingBlock label="Loading farm..." /> : null}
      {farm.isError ? (
        <EmptyState
          title="Farm was not found or you do not have access."
          description="Check that you are logged in with an active organization membership."
          role="alert"
        />
      ) : null}
      {farm.data ? (
        <div className="space-y-6">
          <section className="flex flex-col gap-5 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-6 shadow-[var(--as-shadow-md)] lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="as-kicker">Farm detail</p>
              <h1 className="as-heading mt-3">{farm.data.name}</h1>
              <p className="mt-3 text-[var(--as-ink-muted)]">{farm.data.province ?? "No province set"}</p>
            </div>
            {permission.canManage ? (
              <Link href={`/farms/${farm.data.id}/fields/new`} className={buttonClassName({ size: "lg" })}>Draw field</Link>
            ) : !permission.isLoading && !permission.isError ? (
              <span className="as-pill">View-only access</span>
            ) : null}
          </section>
          {!permission.isLoading && permission.isError ? (
            <EmptyState
              title={permission.error?.message ?? "Organization permission could not be loaded."}
              description="Mutation controls are unavailable until your organization role can be verified."
              role="alert"
            />
          ) : null}
          {fields.isLoading ? <LoadingBlock label="Loading fields..." /> : null}
          {fields.isError ? (
            <EmptyState
              title={fields.error.message}
              description="The saved field boundaries could not be loaded. Try again after checking your connection and access."
              role="alert"
            />
          ) : null}
          {!fields.isLoading && !fields.isError && firstField ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Field" value={firstField.name} detail="Saved active boundary" />
                <MetricCard
                  label="Area"
                  value={`${firstField.area_rai} rai`}
                  detail={`${firstField.area_sqm} sqm / ${firstField.area_rai} rai`}
                  tone="success"
                />
                <MetricCard label="Satellite" value="On demand" detail="Run a latest-acquisition metadata check" tone="satellite" />
              </div>
              <SatelliteStatusCard fieldId={firstField.id} />
              <FieldMap initialGeometry={firstField.geometry} />
            </div>
          ) : null}
          {!fields.isLoading && !fields.isError && !firstField ? (
            <EmptyState
              title="No field boundary saved yet."
              description="Draw the first polygon to calculate authoritative area and unlock satellite metadata checks."
              action={permission.canManage ? (
                <Link href={`/farms/${farm.data.id}/fields/new`} className={buttonClassName()}>Draw first field</Link>
              ) : undefined}
            />
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
