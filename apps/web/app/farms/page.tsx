"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "../../components/Button";
import { PageShell } from "../../components/PageShell";
import { apiFetch } from "../../lib/api";
import type { Farm } from "../../lib/types";

export default function FarmsPage() {
  const farms = useQuery({
    queryKey: ["farms"],
    queryFn: () => apiFetch<Farm[]>("/api/v1/farms")
  });

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#173f35]">Farms</h1>
          <p className="text-[#526057]">Create a farm, then draw and save field boundaries.</p>
        </div>
        <Link href="/farms/new">
          <Button>Create farm</Button>
        </Link>
      </div>
      {farms.isLoading ? <p>Loading farms...</p> : null}
      {farms.isError ? (
        <div className="space-y-3 rounded-md border border-[#d7decc] bg-white p-4">
          <p>Login is required before farms can be shown.</p>
          <Link href="/login">
            <Button>Go to login</Button>
          </Link>
        </div>
      ) : null}
      {farms.data?.length === 0 ? (
        <div className="rounded-md border border-[#d7decc] bg-white p-5">
          <p className="mb-4">No farms yet.</p>
          <Link href="/farms/new">
            <Button>Create your first farm</Button>
          </Link>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {farms.data?.map((farm) => (
          <Link key={farm.id} href={`/farms/${farm.id}`} className="rounded-md border border-[#d7decc] bg-white p-4">
            <h2 className="font-semibold text-[#173f35]">{farm.name}</h2>
            <p className="text-sm text-[#526057]">{farm.province ?? "No province set"}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
