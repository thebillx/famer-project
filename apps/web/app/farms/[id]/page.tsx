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
import type { Farm, FarmInspectionOverviewItem, FieldBoundary, SatelliteLatest, User } from "../../../lib/types";

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
  "observations",
  "farm-inspection-overview"
]);

function isTerminalAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError && AUTH_FAILURES.has(error.code);
}

const INSPECTION_RANK: Record<FarmInspectionOverviewItem["status"], number> = {
  NEEDS_INSPECTION: 0,
  MEASURED: 1,
  NOT_ASSESSABLE: 2,
  FIRST_OBSERVATION: 3,
  NO_ANALYSIS: 4
};

const thaiDate = (value: string) =>
  new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

function inspectionListLabel(item: FarmInspectionOverviewItem | undefined) {
  if (!item) return "กำลังอ่านหลักฐาน…";
  if (item.status === "NEEDS_INSPECTION") return "ควรตรวจ · " + (item.changed_area_rai?.toFixed(2) ?? "0.00") + " ไร่";
  if (item.status === "MEASURED") return "มีผลเปรียบเทียบ";
  if (item.status === "NOT_ASSESSABLE") return "ข้อมูลยังไม่พอ";
  if (item.status === "FIRST_OBSERVATION") return "รอข้อมูลเปรียบเทียบ";
  return "รอข้อมูล";
}

function inspectionTitle(item: FarmInspectionOverviewItem | undefined) {
  if (!item) return "กำลังอ่านหลักฐานล่าสุด…";
  if (item.status === "NEEDS_INSPECTION") return "พบพื้นที่ควรตรวจ";
  if (item.status === "MEASURED") {
    if (item.direction === "increased") return "NDVI ล่าสุดเพิ่มขึ้น";
    if (item.direction === "decreased") return "NDVI ล่าสุดลดลง";
    return "NDVI ล่าสุดไม่เปลี่ยน";
  }
  if (item.status === "NOT_ASSESSABLE") return "ข้อมูลยังไม่พอสำหรับเปรียบเทียบ";
  if (item.status === "FIRST_OBSERVATION") return "รอข้อมูลเปรียบเทียบอีกครั้ง";
  return "ยังไม่มีผลวัดที่บันทึกไว้";
}

function inspectionDetail(item: FarmInspectionOverviewItem | undefined) {
  if (!item) return "กำลังอ่านเฉพาะผลวัดที่บันทึกไว้ โดยไม่เรียกผู้ให้บริการดาวเทียมเพิ่ม";
  if (item.status === "NO_ANALYSIS") {
    return "ยังไม่มีผล NDVI ที่ผ่านเกณฑ์และบันทึกไว้สำหรับขอบเขตปัจจุบัน";
  }
  if (item.status === "FIRST_OBSERVATION") {
    return item.latest_acquired_at
      ? "มีผลวัดล่าสุดวันที่ " + thaiDate(item.latest_acquired_at) + " แต่ยังไม่มีคู่เปรียบเทียบ"
      : "มีผลวัดหนึ่งครั้ง แต่ยังไม่มีคู่เปรียบเทียบ";
  }
  if (item.status === "NOT_ASSESSABLE") {
    const support = item.common_support_ratio === null
      ? ""
      : " · พื้นที่ข้อมูลร่วม " + (item.common_support_ratio * 100).toFixed(0) + "%";
    return "มีผลวัดสองครั้ง แต่พื้นที่ข้อมูลร่วมยังไม่พอสำหรับสรุปการเปลี่ยนแปลง" + support;
  }
  const dates = item.previous_acquired_at && item.latest_acquired_at
    ? thaiDate(item.previous_acquired_at) + " → " + thaiDate(item.latest_acquired_at)
    : "คู่ภาพล่าสุด";
  const delta = item.ndvi_delta === null
    ? ""
    : " · ΔNDVI " + (item.ndvi_delta >= 0 ? "+" : "") + item.ndvi_delta.toFixed(3);
  if (item.status === "NEEDS_INSPECTION") {
    return "พบพื้นที่ที่ NDVI ลดลงถึงเกณฑ์ " + (item.changed_area_rai?.toFixed(2) ?? "0.00") + " ไร่ · " + dates + delta;
  }
  return "วัดการเปลี่ยนแปลงจาก " + dates + delta + " โดยยังไม่ตีความว่าเป็นสาเหตุหรือสุขภาพพืช";
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
  const inspectionOverview = useQuery({
    queryKey: ["farm-inspection-overview", identity.data?.id, params.id],
    queryFn: ({ signal }) => apiFetch<FarmInspectionOverviewItem[]>(`/api/v1/farms/${params.id}/inspection-overview`, { signal }),
    enabled: identitySettled && farm.isSuccess && fields.isSuccess && Boolean(params.id),
    retry: false
  });
  const permission = useOrganizationPermission(farm.data?.organization_id);
  const inspectionByField = useMemo(() => new Map(
    (inspectionOverview.data ?? []).map((item) => [item.field_id, item])
  ), [inspectionOverview.data]);
  const orderedFields = useMemo(() => {
    if (!fields.isSuccess) return [];
    if (!inspectionOverview.isSuccess) return fields.data;
    return [...fields.data].sort((left, right) => {
      const leftEvidence = inspectionByField.get(left.id);
      const rightEvidence = inspectionByField.get(right.id);
      const leftRank = leftEvidence ? INSPECTION_RANK[leftEvidence.status] : 5;
      const rightRank = rightEvidence ? INSPECTION_RANK[rightEvidence.status] : 5;
      if (leftRank !== rightRank) return leftRank - rightRank;
      const areaDelta = (rightEvidence?.changed_area_rai ?? 0) - (leftEvidence?.changed_area_rai ?? 0);
      if (areaDelta !== 0) return areaDelta;
      return left.name.localeCompare(right.name, "th-TH");
    });
  }, [fields.data, fields.isSuccess, inspectionByField, inspectionOverview.isSuccess]);
  const priorityFieldIds = useMemo(
    () => (inspectionOverview.data ?? []).filter((item) => item.needs_inspection).map((item) => item.field_id),
    [inspectionOverview.data]
  );
  const evidenceFieldCount = useMemo(
    () => (inspectionOverview.data ?? []).filter((item) => item.status !== "NO_ANALYSIS").length,
    [inspectionOverview.data]
  );
  const selectedField = fields.isSuccess
    ? fields.data.find((field) => field.id === selectedFieldId) ?? null
    : null;
  const selectedInspection = selectedField ? inspectionByField.get(selectedField.id) : undefined;
  const visibleFields = useMemo(() => {
    const query = fieldSearch.trim().toLocaleLowerCase("th-TH");
    if (!query) return orderedFields;
    return orderedFields.filter((field) => field.name.toLocaleLowerCase("th-TH").includes(query));
  }, [fieldSearch, orderedFields]);
  const filteredFieldIds = fieldSearch.trim() ? visibleFields.map((field) => field.id) : null;
  const satelliteLatest = useQuery({
    queryKey: ["satellite-latest", identity.data?.id, selectedField?.id],
    queryFn: ({ signal }) => apiFetch<SatelliteLatest>(`/api/v1/fields/${selectedField!.id}/satellite/latest`, { signal }),
    enabled: identitySettled && Boolean(selectedField),
    retry: false
  });
  const terminalAuth = satelliteTerminalAuth || [identity.error, farm.error, fields.error, permission.error, satelliteLatest.error, inspectionOverview.error].some(isTerminalAuthError);
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
    const overviewSettled = inspectionOverview.isSuccess || inspectionOverview.isError;
    if (
      queryClient.getQueryData<boolean>(DEFAULT_SELECTION_KEY)
      || !fields.isSuccess
      || !fields.data.length
      || !overviewSettled
      || fieldSearch.trim()
    ) return;
    if (window.matchMedia("(max-width: 720px)").matches) return;
    queryClient.setQueryData(DEFAULT_SELECTION_KEY, true);
    setSelectedFieldId((current) => current ?? (
      inspectionOverview.isSuccess
        ? orderedFields[0]?.id ?? fields.data[0].id
        : fields.data[0].id
    ));
  }, [
    fieldSearch,
    fields.data,
    fields.isSuccess,
    inspectionOverview.isError,
    inspectionOverview.isSuccess,
    orderedFields,
    queryClient
  ]);

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
            {inspectionOverview.isSuccess && fields.data?.length ? (
              <section
                className={styles.inspectionOverview}
                data-has-priority={priorityFieldIds.length ? "true" : "false"}
                aria-label="สรุปพื้นที่ควรตรวจ"
              >
                <span className={styles.eyebrow}>ภาพรวมล่าสุด</span>
                <strong>
                  {priorityFieldIds.length
                    ? `${priorityFieldIds.length} แปลงควรตรวจ`
                    : evidenceFieldCount
                      ? "ยังไม่มีแปลงที่เข้าเกณฑ์ควรตรวจ"
                      : "ยังไม่มีผลวัดสำหรับจัดลำดับ"}
                </strong>
                <p>
                  {priorityFieldIds.length
                    ? "ระบบจัดลำดับจากผลเปรียบเทียบที่บันทึกไว้ แตะรายการด้านล่างเพื่อดูรายละเอียด"
                    : "สถานะนี้อ้างอิงเฉพาะข้อมูลภาพและผลวัดที่บันทึกไว้ในระบบ"}
                </p>
              </section>
            ) : null}
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
            {fields.isSuccess && (inspectionOverview.isPending || inspectionOverview.isFetching) ? (
              <p className={styles.meta} role="status">กำลังอ่านหลักฐานที่บันทึกไว้เพื่อจัดลำดับการตรวจ…</p>
            ) : null}
            {inspectionOverview.isError && !isTerminalAuthError(inspectionOverview.error) ? (
              <p className={styles.meta} role="alert">
                โหลดสถานะพื้นที่ควรตรวจไม่สำเร็จ แผนที่และขอบเขตแปลงยังใช้งานได้ตามปกติ
              </p>
            ) : null}
            {!fields.isPending && !fields.isError && fields.data?.length && visibleFields.length ? (
              <ul className={styles.fieldList} aria-label="แปลงที่บันทึกไว้">
                {visibleFields.map((field) => {
                  const active = field.id === selectedField?.id;
                  const evidence = inspectionByField.get(field.id);
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
                        data-inspection-priority={evidence?.needs_inspection ? "true" : "false"}
                        onClick={() => selectField(field.id)}
                      >
                        <span className={styles.fieldName}>{field.name}</span>
                        <span className={styles.fieldState}>{field.area_rai} ไร่</span>
                        <span
                          className={styles.fieldEvidence}
                          data-inspection-status={evidence?.status ?? "LOADING"}
                        >
                          {inspectionListLabel(evidence)}
                        </span>
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
              <Link
                href={`/farms/${farm.data.id}/fields/new`}
                aria-label={fields.data?.length ? "เพิ่มแปลง" : "เพิ่มแปลงแรก"}
                className={styles.railAddLink}
              >
                {fields.data?.length ? "+ เพิ่มแปลง" : "+ เพิ่มแปลงแรก"}
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
                priorityFieldIds={priorityFieldIds}
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
              <section
                className={styles.inspectionSummary}
                data-inspection-status={selectedInspection?.status ?? (inspectionOverview.isError ? "ERROR" : "LOADING")}
                aria-label="แนวโน้มล่าสุด"
              >
                <p className={styles.eyebrow}>แนวโน้มล่าสุด</p>
                <strong>
                  {inspectionOverview.isError && !isTerminalAuthError(inspectionOverview.error)
                    ? "ยังอ่านหลักฐานรวมไม่ได้"
                    : inspectionTitle(selectedInspection)}
                </strong>
                <p>
                  {inspectionOverview.isError && !isTerminalAuthError(inspectionOverview.error)
                    ? "เปิดพื้นที่ทำงานของแปลงเพื่อดูหลักฐานรายแปลงได้ตามปกติ"
                    : inspectionDetail(selectedInspection)}
                </p>
              </section>
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
