"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CompareWorkspace } from "../../../../components/ObservationWorkspace";
import { MapWorkspaceShell } from "../../../../components/MapWorkspaceShell";
import { ApiError, apiFetch } from "../../../../lib/api";
import type { FieldBoundary, Observation, User } from "../../../../lib/types";

const AUTH_FAILURES = new Set(["authentication_required", "invalid_refresh_token"]);

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const identity = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => apiFetch<User>("/api/v1/auth/me", { signal }), retry: false });
  const enabled = identity.isSuccess && !identity.isFetching && Boolean(id);
  const field = useQuery({ queryKey: ["field", identity.data?.id, id], queryFn: ({ signal }) => apiFetch<FieldBoundary>(`/api/v1/fields/${id}`, { signal }), enabled, retry: false });
  const history = useQuery({ queryKey: ["observations", identity.data?.id, id], queryFn: ({ signal }) => apiFetch<Observation[]>(`/api/v1/fields/${id}/observations`, { signal }), enabled, retry: false });
  const terminal = [identity.error, field.error, history.error].some((error) => error instanceof ApiError && AUTH_FAILURES.has(error.code));
  useEffect(() => { if (terminal) { void queryClient.cancelQueries(); queryClient.clear(); } }, [queryClient, terminal]);
  return <MapWorkspaceShell accountLabel={identity.data?.display_name} showAccountSwitch>{terminal ? <div className="p-8 text-center" role="alert"><h1>เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</h1><Link href="/login">ไปหน้าเข้าสู่ระบบ</Link></div> : field.data && history.data ? <CompareWorkspace field={field.data} observations={history.data} initialBefore={search.get("before") ?? undefined} initialAfter={search.get("after") ?? undefined} /> : <div className="p-8" role={field.isError || history.isError ? "alert" : "status"}>{field.isError || history.isError ? "โหลดข้อมูลเปรียบเทียบไม่สำเร็จ" : "กำลังเตรียมภาพเปรียบเทียบ…"}</div>}</MapWorkspaceShell>;
}
