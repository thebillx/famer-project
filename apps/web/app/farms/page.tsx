"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "../../components/Button";
import { PageShell } from "../../components/PageShell";
import { EmptyState, LoadingBlock, MetricCard } from "../../components/Primitives";
import { apiFetch } from "../../lib/api";
import type { Farm } from "../../lib/types";

export default function FarmsPage() {
  const farms = useQuery({
    queryKey: ["farms"],
    queryFn: () => apiFetch<Farm[]>("/api/v1/farms")
  });
  const farmCount = farms.data?.length ?? 0;

  return (
    <PageShell>
      <div className="space-y-7">
        <section className="flex flex-col gap-5 rounded-[var(--as-radius-xl)] border border-[var(--as-border)] bg-[var(--as-bg-elevated)] p-6 shadow-[var(--as-shadow-md)] md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="as-kicker">Farm workspace</p>
            <h1 className="as-heading mt-3">Your fields, organized for inspection.</h1>
            <p className="mt-4 text-[var(--as-ink-muted)]">
              Create farms, draw verified boundaries, and keep satellite catalogue checks tied to the saved field.
            </p>
          </div>
          <Link href="/farms/new">
            <Button size="lg">Create farm</Button>
          </Link>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard label="Farms" value={farms.isLoading ? "-" : String(farmCount)} detail="Active saved workspaces" />
          <MetricCard label="Satellite" value="Ready" detail="Latest Sentinel metadata" tone="satellite" />
          <MetricCard label="Map" value="Live" detail="Draw and reload boundaries" tone="success" />
        </div>

        {farms.isLoading ? <LoadingBlock label="Loading farms..." /> : null}

        {farms.isError ? (
          <EmptyState
            title="Login is required before farms can be shown."
            description="Sign in to load your organization workspace and saved field boundaries."
            action={
              <Link href="/login">
                <Button>Go to login</Button>
              </Link>
            }
          />
        ) : null}

        {farms.data?.length === 0 ? (
          <EmptyState
            title="No farms yet."
            description="Create your first farm to unlock the map workflow and save a field boundary."
            action={
              <Link href="/farms/new">
                <Button>Create your first farm</Button>
              </Link>
            }
          />
        ) : null}

        {farms.data?.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {farms.data.map((farm) => (
              <Link
                key={farm.id}
                href={`/farms/${farm.id}`}
                className="as-link-card as-card rounded-[var(--as-radius-lg)] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="as-kicker">Farm</p>
                    <h2 className="mt-2 text-xl font-bold text-[var(--as-ink)]">{farm.name}</h2>
                    <p className="mt-1 text-sm text-[var(--as-ink-muted)]">{farm.province ?? "No province set"}</p>
                  </div>
                  <span className="as-pill">Open</span>
                </div>
                <div className="mt-8 h-28 rounded-[var(--as-radius-md)] border border-[var(--as-border)] bg-[var(--as-surface-map)] p-3">
                  <div className="h-full rounded-[32px] border-2 border-[var(--as-primary)] bg-[rgba(63,141,77,0.15)]" />
                </div>
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
