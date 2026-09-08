"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonClassName } from "../../../components/Button";
import { FarmOverviewMap } from "../../../components/FarmOverviewMap";
import { MapWorkspaceShell, mapWorkspaceStyles as styles } from "../../../components/MapWorkspaceShell";
import { SatelliteStatusCard } from "../../../components/SatelliteStatusCard";
import { ApiError, apiFetch } from "../../../lib/api";
import { useOrganizationPermission } from "../../../lib/permissions";
import type { Farm, FieldBoundary, SatelliteLatest, User } from "../../../lib/types";

const AUTH_FAILURES = new Set(["authentication_required", "invalid_refresh_token"]);
const DEFAULT_SELECTION_KEY = ["farm-default-selection-used"] as const;
const TENANT_QUERY_ROOTS = new Set([
  "current-user",
  "farms",
  "farm",
  "fields",
  "field",
  "organizations",
  "organization-members",
  "satellite-latest",
  "observations"
]);

function isTerminalAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && AUTH_FAILURES.has(error.code);
}
export default function FarmDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [satelliteTerminalAuth, setSatelliteTerminalAuth] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const fieldRowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const identity = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => apiFetch<User>("/api/v1/auth/me", { signal }),
    retry: false
  });
  const identitySettled = identity.isSuccess && !identity.isFetching;
  const farm = useQuery({
    queryKey: ["farm", identity.data?.id, params.id],
    queryFn: ({ signal }) => apiFetch<Farm>(`/api/v1/farms/${params.id}`, { signal }),
    enabled: identitySettled && Boolean(params.id),
    retry: false
  });
  const fields = useQuery({
    queryKey: ["fields", identity.data?.id, params.id],
    queryFn: ({ signal }) => apiFetch<FieldBoundary[]>(`/api/v1/farms/${params.id}/fields`, { signal }),
    enabled: identitySettled && Boolean(params.id),
    retry: false
  });
  const permission = useOrganizationPermission(farm.data?.organization_id);
  const selectedField = fields.isSuccess
    ? fields.data.find((field) => field.id === selectedFieldId) ?? null
    : null;
  const visibleFields = useMemo(() => {
    const query = fieldSearch.trim().toLocaleLowerCase("th-TH");
    if (!fields.isSuccess || !query) return fields.isSuccess ? fields.data : [];
    return fields.data.filter((field) => field.name.toLocaleLowerCase("th-TH").includes(query));
  }, [fieldSearch, fields.data, fields.isSuccess]);
  const filteredFieldIds = fieldSearch.trim() ? visibleFields.map((field) => field.id) : null;
  const satelliteLatest = useQuery({
    queryKey: ["satellite-latest", identity.data?.id, selectedField?.id],
    queryFn: ({ signal }) => apiFetch<SatelliteLatest>(`/api/v1/fields/${selectedField!.id}/satellite/latest`, { signal }),
    enabled: identitySettled && Boolean(selectedField),
    retry: false
  });
  const terminalAuth = satelliteTerminalAuth || [identity.error, farm.error, fields.error, permission.error, satelliteLatest.error].some(isTerminalAuthError);
  const accountLabel = identitySettled && !terminalAuth
    ? identity.data.display_name
    : "บัญชีของฉัน";
  const selectField = (fieldId: string) => {
    if (fieldSearch.trim() && !visibleFields.some((field) => field.id === fieldId)) setFieldSearch("");
    setSelectedFieldId(fieldId);
  };
  const handleSatelliteTerminalAuth = useCallback(() => setSatelliteTerminalAuth(true), []);

  useEffect(() => {
    setSelectedFieldId(null);
    setSatelliteTerminalAuth(false);
    setFieldSearch("");
  }, [params.id]);

  useEffect(() => {
    if (queryClient.getQueryData<boolean>(DEFAULT_SELECTION_KEY) || !fields.isSuccess || !fields.data.length || fieldSearch.trim()) return;
    queryClient.setQueryData(DEFAULT_SELECTION_KEY, true);
    setSelectedFieldId((current) => current ?? fields.data[0].id);
  }, [fieldSearch, fields.data, fields.isSuccess, queryClient]);

  useEffect(() => {
    if (selectedFieldId && !fields.isSuccess) {
      setSelectedFieldId(null);
      return;
    }
    if (selectedFieldId && !fields.data?.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(null);
    }
  }, [fields.data, fields.isSuccess, selectedFieldId]);

  useEffect(() => {
    if (selectedFieldId && fieldSearch.trim() && !visibleFields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(null);
    }
  }, [fieldSearch, selectedFieldId, visibleFields]);

  useEffect(() => {
    if (selectedFieldId) fieldRowRefs.current[selectedFieldId]?.scrollIntoView({ block: "nearest" });
  }, [selectedFieldId, visibleFields]);

  useEffect(() => {
    if (!terminalAuth) return;
    void queryClient.cancelQueries({
      predicate: (query) => TENANT_QUERY_ROOTS.has(String(query.queryKey[0]))
    });
    queryClient.removeQueries({
      predicate: (query) => TENANT_QUERY_ROOTS.has(String(query.queryKey[0]))
    });
  }, [queryClient, terminalAuth]);

  return (
    <MapWorkspaceShell accountLabel={accountLabel}>
      {identity.isPending || identity.isFetching ? (
        <CenteredState label="กำลังตรวจสอบบัญชี…" />
      ) : null}
      {terminalAuth ? (
        <CenteredState
          title="เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"
          label="ระบบซ่อนข้อมูลพื้นที่ทำงานไว้จนกว่าจะเข้าสู่ระบบใหม่"
          href="/login"
          action="ไปหน้าเข้าสู่ระบบ"
        />
      ) : null}
      {!terminalAuth && identity.isError ? (
        <CenteredState
          title="ตรวจสอบบัญชีไม่สำเร็จ"
          label="ยังไม่สามารถเปิดพื้นที่ทำงานได้ กรุณาลองใหม่อีกครั้ง"
          href="/login"
          action="กลับไปเข้าสู่ระบบ"
        />
      ) : null}
      {!terminalAuth && identitySettled && farm.isPending ? (
        <CenteredState label="กำลังเปิดพื้นที่ทำงานฟาร์ม..." />
      ) : null}
      {!terminalAuth && identitySettled && farm.isError ? (
        <CenteredState
          title="ไม่พบฟาร์มหรือคุณไม่มีสิทธิ์เข้าถึง"
          label="เปิดจากรายการฟาร์มที่บัญชีนี้เข้าถึงได้ เพื่อรักษาบริบทพื้นที่ทำงาน"
          href="/farms"
          action="กลับไปรายการฟาร์ม"
        />
      ) : null}
      {!terminalAuth && identitySettled && farm.isSuccess ? (
        <div className={styles.workspace} data-has-inspector={selectedField ? "true" : "false"}>
          <aside className={`${styles.rail} ${styles.scrollPane}`} aria-label="แปลงในฟาร์ม">
            <h1 className={styles.title}>{farm.data.name}</h1>
            <p className={styles.meta}>
              {fieldSearch.trim()
                ? `ค้นหาแปลง · ${visibleFields.length} จาก ${fields.data?.length ?? 0} แปลง`
                : `${fields.data?.length ?? 0} แปลง`}
            </p>
            {fields.data?.length ? (
              <label className={styles.searchLabel}>
                <span>ค้นหาแปลง</span>
                <input
                  className={styles.fieldSearch}
                  type="search"
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  placeholder="ค้นหาแปลง..."
                />
              </label>
            ) : null}
            <div className={styles.rule} />
            {fields.isPending ? <p className={styles.meta}>กำลังโหลดแปลงที่บันทึกไว้...</p> : null}
            {fields.isError ? <p className={styles.meta}>โหลดข้อมูลแปลงไม่สำเร็จ กรุณาลองใหม่ภายหลัง</p> : null}
            {permission.isError ? (
              <p className={styles.meta} role="alert">
                ตรวจสอบสิทธิ์การจัดการไม่สำเร็จ ระบบจึงซ่อนปุ่มเพิ่มแปลง
              </p>
            ) : null}
            {!fields.isPending && !fields.isError && fields.data?.length && visibleFields.length ? (
              <ul className={styles.fieldList} aria-label="แปลงที่บันทึกไว้">
                {visibleFields.map((field) => {
                  const active = field.id === selectedField?.id;
                  return (
                    <li
                      key={field.id}
                      ref={(element) => {
                        fieldRowRefs.current[field.id] = element;
                      }}
                      className={styles.fieldItem}
                    >
                      <button
                        type="button"
                        className={styles.fieldButton}
                        aria-pressed={active}
                        onClick={() => selectField(field.id)}
                      >
                        <span className={styles.fieldName}>{field.name}</span>
                        <span className={styles.fieldState}>{field.area_rai} ไร่</span>
                      </button>
                      <Link
                        href={`/fields/${field.id}`}
                        aria-label={`เปิดพื้นที่ทำงานของ ${field.name}`}
                        className={styles.fieldOpenLink}
                      >
                        <span aria-hidden="true">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {!fields.isPending && !fields.isError && fields.data?.length && !visibleFields.length ? (
              <p className={styles.meta}>ไม่พบแปลงที่ตรงกับคำค้น</p>
            ) : null}
            {!fields.isPending && !fields.isError && !fields.data?.length ? (
              <p className={styles.meta}>ยังไม่มีขอบเขตแปลงที่บันทึกไว้ในฟาร์มนี้</p>
            ) : null}
            {permission.canManage ? (
              <Link href={`/farms/${farm.data.id}/fields/new`} aria-label="เพิ่มแปลง" className={styles.railAddLink}>
                + เพิ่มแปลง
              </Link>
            ) : null}
            {permission.canManage && !fields.isPending && !fields.isError && !fields.data?.length ? (
              <Link href={`/farms/${farm.data.id}/fields/new`} aria-label="เพิ่มแปลงแรก" className={styles.railAddLink}>
                + เพิ่มแปลงแรก
              </Link>
            ) : null}
            <Link href="/farms" className={styles.railBackLink}>← กลับรายการฟาร์ม</Link>
          </aside>

          <section className={styles.mapPane} aria-label="แผนที่ฟาร์มและแปลง">
            {fields.isPending ? (
              <div className={styles.mapState} role="status">กำลังโหลดแปลงที่บันทึกไว้...</div>
            ) : fields.isError ? (
              <div className={styles.mapState} role="alert">
                <strong>โหลดข้อมูลแปลงไม่สำเร็จ</strong>
                <span>ยังไม่สามารถแสดงขอบเขตจริงของฟาร์มนี้ได้</span>
              </div>
            ) : (
              <FarmOverviewMap
                fields={fields.data ?? []}
                selectedFieldId={selectedField?.id ?? null}
                onSelect={selectField}
                ariaLabel="Field map"
                visibleFieldIds={filteredFieldIds}
                contextLabel={selectedField ? `${farm.data.name} · ${selectedField.name}` : farm.data.name}
                contextDetail={
                  selectedField
                    ? `${selectedField.area_rai} ไร่`
                    : fieldSearch.trim()
                      ? `${visibleFields.length} จาก ${fields.data?.length ?? 0} แปลง`
                      : `${fields.data?.length ?? 0} แปลง`
                }
                emptyMessage={fields.data?.length ? undefined : "ยังไม่มีแปลงในฟาร์มนี้"}
                emptyDetail={
                  fields.data?.length
                    ? undefined
                    : permission.canManage
                      ? "เริ่มจาก “+ เพิ่มแปลง” ในแถบซ้าย"
                      : "เมื่อมีขอบเขตแปลงที่เข้าถึงได้ จะแสดงบนแผนที่"
                }
              />
            )}
          </section>

          {selectedField ? (
            <aside
              className={`${styles.inspector} ${styles.scrollPane}`}
              aria-label="รายละเอียดแปลงที่เลือก"
              aria-live="polite"
              data-inspector-field-id={selectedField.id}
            >
              <button
                type="button"
                className={styles.inspectorClose}
                aria-label="ปิดรายละเอียดแปลง"
                onClick={() => setSelectedFieldId(null)}
              >
                ปิด
              </button>
              <p className={styles.eyebrow}>แปลงที่เลือก</p>
              <h2 className={styles.title}>แปลง {selectedField.name}</h2>
              <p className={styles.meta}>{farm.data.name} · {selectedField.area_rai} ไร่</p>
              <div className={styles.rule} />
              <dl className={styles.metricList}>
                <div className={styles.metricRow}>
                  <dt>พื้นที่คำนวณโดยเซิร์ฟเวอร์</dt>
                  <dd>
                    {selectedField.area_sqm} ตร.ม. / {selectedField.area_rai} ไร่
                  </dd>
                </div>
                <div className={styles.metricRow}>
                  <dt>ขอบเขต</dt>
                  <dd>{selectedField.status === "active" ? "พร้อมใช้งาน" : "ไม่พร้อมใช้งาน"}</dd>
                </div>
              </dl>
              <div className={styles.rule} />
              <p className={styles.eyebrow}>ข้อมูลภาพ</p>
              <SatelliteStatusCard
                fieldId={selectedField.id}
                identityId={identity.data.id}
                onTerminalAuth={handleSatelliteTerminalAuth}
              />
              <div className={styles.rule} />
              <p className={styles.meta}>
                ระบบจะแสดงเฉพาะข้อมูลภาพและผลคำนวณที่ API ยืนยันแล้ว ภาพดาวเทียมเพียงอย่างเดียวยังระบุสาเหตุไม่ได้
              </p>
            </aside>
          ) : null}
        </div>
      ) : null}
    </MapWorkspaceShell>
  );
}

function CenteredState({
  title,
  label,
  href,
  action
}: {
  title?: string;
  label: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className={styles.emptySurface}>
      <section className={styles.emptyCard} role={title ? "alert" : "status"}>
        {title ? <h1 className={styles.title}>{title}</h1> : null}
        <p className={styles.meta}>{label}</p>
        {href ? <Link href={href} className={buttonClassName({ className: "mt-5" })}>{action ?? "กลับไป"}</Link> : null}
      </section>
    </div>
  );
}
