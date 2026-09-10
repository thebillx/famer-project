"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { FieldAnalysisWorkspace } from "../../../components/ObservationWorkspace";
import { MapWorkspaceShell } from "../../../components/MapWorkspaceShell";
import { ApiError, apiFetch } from "../../../lib/api";
import type { FieldBoundary, Observation, User } from "../../../lib/types";

const AUTH_FAILURES = new Set(["authentication_required", "invalid_refresh_token"]);
const PROTECTED_QUERY_ROOTS = new Set(["current-user", "field", "observations"]);

function isTerminalAuth(error: unknown) {
  return error instanceof ApiError && AUTH_FAILURES.has(error.code);
}

export default function FieldWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const identity = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => apiFetch<User>("/api/v1/auth/me", { signal }), retry: false });
  const enabled = identity.isSuccess && !identity.isFetching && Boolean(id);
  const field = useQuery({ queryKey: ["field", identity.data?.id, id], queryFn: ({ signal }) => apiFetch<FieldBoundary>(`/api/v1/fields/${id}`, { signal }), enabled, retry: false });
  const history = useQuery({ queryKey: ["observations", identity.data?.id, id], queryFn: ({ signal }) => apiFetch<Observation[]>(`/api/v1/fields/${id}/observations`, { signal }), enabled, retry: false });
  const terminal = [identity.error, field.error, history.error].some(isTerminalAuth);
  useEffect(() => {
    if (!terminal) return;
    void queryClient.cancelQueries({ predicate: (query) => PROTECTED_QUERY_ROOTS.has(String(query.queryKey[0])) });
    queryClient.removeQueries({ predicate: (query) => PROTECTED_QUERY_ROOTS.has(String(query.queryKey[0])) });
  }, [queryClient, terminal]);

  if (terminal) return <MapWorkspaceShell><div className="p-8 text-center" role="alert"><h1>เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</h1><p>ระบบซ่อนข้อมูลแปลงไว้จนกว่าจะเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์อีกครั้ง</p><Link href="/login">ไปหน้าเข้าสู่ระบบ</Link></div></MapWorkspaceShell>;
  if (identity.isPending || identity.isFetching) return <MapWorkspaceShell><div className="p-8" role="status" aria-busy="true">กำลังตรวจสอบบัญชี…</div></MapWorkspaceShell>;
  if (identity.isError) return <MapWorkspaceShell><div className="p-8" role="alert">ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</div></MapWorkspaceShell>;
  if (field.isPending || history.isPending) return <MapWorkspaceShell><div className="p-8" role="status" aria-busy="true">กำลังโหลดพื้นที่ทำงานแปลง…</div></MapWorkspaceShell>;
  if (field.isError || history.isError || !field.data || !history.data) return <MapWorkspaceShell><div className="p-8" role="alert">โหลดข้อมูลแปลงไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</div></MapWorkspaceShell>;
  return <MapWorkspaceShell accountLabel={identity.data.display_name} showAccountSwitch><FieldAnalysisWorkspace field={field.data} observations={history.data} /></MapWorkspaceShell>;
}
