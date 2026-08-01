"use client";

import { useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../../../components/Button";
import { FieldMap } from "../../../../../components/FieldMap";
import { PageShell } from "../../../../../components/PageShell";
import { apiFetch } from "../../../../../lib/api";
import type { FieldBoundary, GeoJsonPolygon } from "../../../../../lib/types";

export default function NewFieldPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("Field 1");
  const [geometry, setGeometry] = useState<GeoJsonPolygon | null>(null);
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
        <div>
          <h1 className="text-2xl font-semibold text-[#173f35]">Draw field</h1>
          <p className="text-[#526057]">Click points around the boundary. Drag markers to adjust before saving.</p>
        </div>
        <label className="block max-w-md">
          <span className="mb-1 block text-sm font-medium text-[#173f35]">Field name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-md border border-[#b8c5b0] bg-white px-3"
          />
        </label>
        <FieldMap editable onGeometryChange={setGeometry} />
        {saveField.isError ? <p className="text-[#8f2435]">{saveField.error.message}</p> : null}
        <Button type="button" disabled={!geometry || !name || saveField.isPending} onClick={() => saveField.mutate()}>
          Save field
        </Button>
      </div>
    </PageShell>
  );
}
