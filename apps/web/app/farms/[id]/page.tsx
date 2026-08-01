"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "../../../components/Button";
import { FieldMap } from "../../../components/FieldMap";
import { PageShell } from "../../../components/PageShell";
import { apiFetch } from "../../../lib/api";
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
  const firstField = fields.data?.[0];

  return (
    <PageShell>
      {farm.isLoading ? <p>Loading farm...</p> : null}
      {farm.isError ? <p>Farm was not found or you do not have access.</p> : null}
      {farm.data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[#173f35]">{farm.data.name}</h1>
              <p className="text-[#526057]">{farm.data.province ?? "No province set"}</p>
            </div>
            <Link href={`/farms/${farm.data.id}/fields/new`}>
              <Button>Draw field</Button>
            </Link>
          </div>
          {fields.isLoading ? <p>Loading fields...</p> : null}
          {firstField ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Info label="Field" value={firstField.name} />
                <Info label="Area" value={`${firstField.area_sqm} sqm / ${firstField.area_rai} rai`} />
              </div>
              <FieldMap initialGeometry={firstField.geometry} />
            </div>
          ) : (
            <div className="rounded-md border border-[#d7decc] bg-white p-5">
              <p className="mb-4">No field boundary saved yet.</p>
              <Link href={`/farms/${farm.data.id}/fields/new`}>
                <Button>Draw first field</Button>
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d7decc] bg-white p-4">
      <p className="text-sm text-[#526057]">{label}</p>
      <p className="font-semibold text-[#173f35]">{value}</p>
    </div>
  );
}
