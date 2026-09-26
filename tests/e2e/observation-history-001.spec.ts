import { expect, test, type Page, type Route } from "@playwright/test";
import type { BackfillReceipt, FieldBoundary, Observation, User } from "../../apps/web/lib/types";

const api = "http://localhost:8000";
const version = "agriscope-ndvi-summary-v1+agriscope-ndvi-raster-v1";
const user: User = { id: "00000000-0000-0000-0000-000000000001", email: "owner@example.test", display_name: "สมชาย" };
const field: FieldBoundary = {
  id: "00000000-0000-0000-0000-000000000031", farm_id: "00000000-0000-0000-0000-000000000020",
  organization_id: "00000000-0000-0000-0000-000000000010", name: "A02", area_sqm: "5440", area_rai: "3.40",
  geometry: { type: "Polygon", coordinates: [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.8], [98.98, 18.79]]] },
  status: "active", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z"
};
const observation: Observation = {
  observation_id: "00000000-0000-0000-0000-000000000042", field_id: field.id,
  acquired_at: "2026-08-22T03:00:00Z", cloud_percent: 6, source: "Sentinel-2", status: "USABLE",
  imagery_available: false, geometry_hash: "a".repeat(64), analysis_eligible: true, analysis_ready: false, comparison_eligible: true
};
const receipt: BackfillReceipt = {
  id: "00000000-0000-0000-0000-000000000099", field_id: field.id,
  start_at: "2026-08-01T00:00:00Z", end_at: "2026-08-31T23:59:59.999999Z", status: "COMPLETED",
  pages_discovered: 1, catalog_found_count: 1, persisted_count: 1, rejected_count: 0, no_history_reason: null,
  started_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-01T00:00:01Z"
};
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const previous = { ...observation, observation_id: "00000000-0000-0000-0000-000000000041", acquired_at: "2026-08-12T03:00:00Z" };

type Options = { comparable?: boolean; viewer?: boolean; permissionGate?: Promise<void>; permissionError?: boolean; discoveryGate?: Promise<void>; errorCode?: string; empty?: boolean; malformed?: boolean };

async function mockHistory(page: Page, options: Options = {}) {
  const state = { calls: 0, historyReads: 0, summaryCalls: 0, changeCalls: 0, body: null as unknown, discovered: false, switched: false };
  await page.route("https://tiles.openfreemap.org/**", (route) => json(route, { version: 8, sources: {}, layers: [] }));
  await page.route(`${api}/api/v1/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, state.switched ? { ...user, id: "00000000-0000-0000-0000-000000000002", display_name: "สุดา" } : user);
    if (path === "/api/v1/auth/login") { state.switched = true; return route.fulfill({ status: 204, body: "" }); }
    if (path === "/api/v1/organizations" || path === "/api/v1/farms") return json(route, []);
    if (path === "/api/v1/auth/csrf") return json(route, { csrf_token: "test-csrf" });
    if (path === `/api/v1/organizations/${field.organization_id}/members`) {
      if (options.permissionGate) await options.permissionGate;
      if (options.permissionError) return json(route, { error: { code: "request_failed", message: "internal detail" } }, 503);
      return json(route, [{ user_id: user.id, status: "active", role: options.viewer ? "viewer" : "field_manager" }]);
    }
    if (path === `/api/v1/fields/${field.id}`) return state.switched ? json(route, { error: { code: "not_found", message: "not found" } }, 404) : json(route, field);
    if (path === `/api/v1/fields/${field.id}/observations`) {
      state.historyReads += 1;
      return json(route, state.discovered && !options.empty ? (options.comparable ? [observation, previous] : [observation]) : []);
    }
    if (path.endsWith("/observations/backfill")) {
      state.calls += 1;
      state.body = route.request().postDataJSON();
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      if (options.discoveryGate) await options.discoveryGate;
      if (options.errorCode) return json(route, { error: { code: options.errorCode, message: "private provider detail" } }, options.errorCode === "backfill_result_truncated" ? 422 : 503);
      state.discovered = true;
      return json(route, { ...receipt, field_id: options.malformed ? "different-field" : field.id,
        catalog_found_count: options.empty ? 0 : options.comparable ? 2 : 1, persisted_count: options.empty ? 0 : options.comparable ? 2 : 1,
        no_history_reason: options.empty ? "NO_CATALOG_RESULTS_IN_BOUNDED_RANGE" : null });
    }
    if (path.endsWith("/change")) {
      state.changeCalls += 1;
      return json(route, { field_id: field.id, before_observation_id: previous.observation_id,
        after_observation_id: observation.observation_id, algorithm_version: version,
        geometry_hash: observation.geometry_hash, before_observation_ndvi_mean: 0.75,
        after_observation_ndvi_mean: 0.62, before_ndvi: 0.75, after_ndvi: 0.62,
        ndvi_delta: -0.13, changed_area_sqm: 820, changed_area_rai: 0.5125, threshold: -0.1,
        highlight_semantics: "NDVI_DECREASE_AT_OR_BELOW_THRESHOLD", status: "USABLE",
        support: { common_valid_pixel_count: 90, field_grid_pixel_count: 100,
          common_support_ratio: 0.9, minimum_required_ratio: 0.4,
          policy_version: "common-field-grid-v1-provisional", denominator: "FIELD_GRID_PIXEL_CENTERS",
          reason: "SUFFICIENT_COMMON_SUPPORT" }, geometry: { type: "MultiPolygon", coordinates: [] } });
    }
    if (path.endsWith("/ndvi-summary")) {
      state.summaryCalls += 1;
      return json(route, { field_id: field.id, observation_id: observation.observation_id, acquired_at: observation.acquired_at,
        geometry_hash: observation.geometry_hash, algorithm_version: version, ndvi_mean: 0.62,
        ndvi_min: 0.2, ndvi_max: 0.8, ndvi_stddev: 0.1, sample_count: 100, valid_sample_count: 90,
        valid_pixel_ratio: 0.9, analysis_eligible: true, analysis_ready: true, assessable: true });
    }
    if (path.endsWith("/ndvi-raster")) return json(route, {
      field_id: field.id, observation_id: observation.observation_id, acquired_at: observation.acquired_at,
      geometry_hash: observation.geometry_hash, algorithm_version: version, crs: "EPSG:4326",
      bounds: [98.98, 18.79, 98.99, 18.8], width: 32, height: 32, nodata: -9999,
      value_min: 0.2, value_max: 0.8, valid_pixel_ratio: 0.9
    });
    return json(route, { error: { code: "not_found", message: "not found" } }, 404);
  });
  return state;
}
async function openForm(page: Page) {
  await page.goto(`/fields/${field.id}`);
  await page.getByText("ค้นหาภาพย้อนหลัง", { exact: true }).click();
}
async function selectDates(page: Page) {
  await page.getByLabel("ตั้งแต่วันที่").fill("2026-08-01");
  await page.getByLabel("ถึงวันที่").fill("2026-08-31");
}
async function screenshot(page: Page, name: string) {
  if (process.env.MAP_VISUAL_ARTIFACT_DIR) await page.screenshot({ path: `${process.env.MAP_VISUAL_ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

for (const width of [1280, 390]) {
  test(`[mocked-api] manual history discovery refreshes the selected observation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let release: (() => void) | undefined;
    const options = { discoveryGate: new Promise<void>((resolve) => { release = resolve; }) };
    const state = await mockHistory(page, options);
    await openForm(page);
    expect(state.calls).toBe(0);
    await selectDates(page);
    await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
    await expect(page.getByRole("form", { name: "ค้นหาประวัติภาพดาวเทียม" })).toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("ตั้งแต่วันที่")).toBeDisabled();
    release?.();
    await expect(page.locator("details").getByRole("status")).toContainText("พบ 1 ภาพ");
    await expect(page.locator(`[data-observation-id="${observation.observation_id}"]`)).toBeVisible();
    await expect(page.getByText("0.62", { exact: true })).toBeVisible();
    expect(state.body).toEqual({ start_date: "2026-08-01", end_date: "2026-08-31" });
    expect(state.calls).toBe(1);
    expect(state.summaryCalls).toBe(1);
    expect(state.historyReads).toBeGreaterThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(page, `history-success-${width}`);
  });
}

test("[mocked-api] first comparable history enters change mode and replay preserves user's mode", async ({ page }) => {
  const state = await mockHistory(page, { comparable: true });
  await openForm(page); await selectDates(page);
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect(page.locator("details").getByRole("status")).toContainText("พบ 2 ภาพ");
  await expect(page.getByRole("button", { name: "พื้นที่ NDVI ลดลง", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => state.changeCalls).toBe(1);
  await expect(page.getByRole("link", { name: "เปรียบเทียบภาพ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ภาพดาวเทียม", exact: true }).click();
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect.poll(() => state.calls).toBe(2);
  await expect(page.getByRole("button", { name: "ภาพดาวเทียม", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("[mocked-api] empty receipt is explicit without inventing observations", async ({ page }) => {
  await mockHistory(page, { empty: true });
  await openForm(page); await selectDates(page);
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect(page.locator("details").getByRole("status")).toContainText("ไม่พบภาพในช่วงเวลานี้");
  await expect(page.locator("[data-observation-id]")).toHaveCount(0);
  await screenshot(page, "history-empty");
});

for (const errorCode of ["satellite_temporarily_unavailable", "backfill_result_truncated"]) {
  test(`[mocked-api] ${errorCode} remains retryable with safe copy`, async ({ page }) => {
    const options: Options = { errorCode };
    const state = await mockHistory(page, options);
    await openForm(page); await selectDates(page);
    await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: errorCode === "backfill_result_truncated" ? "ลดช่วงวันที่" : "ค้นหาภาพย้อนหลังไม่สำเร็จ" })).toBeVisible();
    await expect(page.getByText("private provider detail")).toHaveCount(0);
    expect(state.historyReads).toBe(1);
    options.errorCode = undefined;
    await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
    await expect(page.locator("details").getByRole("status")).toContainText("พบ 1 ภาพ");
    expect(state.calls).toBe(2);
  });
}

test("[mocked-api] permission loading, viewer and failed permission never allow discovery", async ({ page }) => {
  let release: (() => void) | undefined;
  const options: Options = { viewer: true, permissionGate: new Promise<void>((resolve) => { release = resolve; }) };
  const state = await mockHistory(page, options);
  await openForm(page);
  await expect(page.getByText("กำลังตรวจสอบสิทธิ์ค้นหา…")).toBeVisible();
  await expect(page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true })).toHaveCount(0);
  release?.();
  await expect(page.getByText(/ต้องใช้สิทธิ์ผู้จัดการแปลง/)).toBeVisible();
  expect(state.calls).toBe(0);
  options.permissionError = true;
  await page.reload();
  await page.getByText("ค้นหาภาพย้อนหลัง", { exact: true }).click();
  await expect(page.getByText("ตรวจสอบสิทธิ์ค้นหาไม่สำเร็จ")).toBeVisible();
  await expect(page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true })).toHaveCount(0);
});

test("[mocked-api] terminal discovery auth clears the protected workspace", async ({ page }) => {
  await mockHistory(page, { errorCode: "invalid_refresh_token" });
  await openForm(page); await selectDates(page);
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByText("ค้นหาภาพย้อนหลัง", { exact: true })).toHaveCount(0);
});

test("[mocked-api] mismatched receipt cannot refresh another field or show success", async ({ page }) => {
  const state = await mockHistory(page, { malformed: true });
  await openForm(page); await selectDates(page);
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect(page.getByText(/ค้นหาภาพย้อนหลังไม่สำเร็จ/)).toBeVisible();
  expect(state.historyReads).toBe(1);
});

test("[mocked-api] late discovery receipt is discarded across a same-document account switch", async ({ page }) => {
  let release: (() => void) | undefined;
  const state = await mockHistory(page, { discoveryGate: new Promise<void>((resolve) => { release = resolve; }) });
  await openForm(page); await selectDates(page);
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect.poll(() => state.calls).toBe(1);
  const documentTime = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("link", { name: "เปลี่ยนบัญชี" }).click();
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  await page.getByLabel("อีเมล").fill("owner-b@example.test");
  await page.getByLabel("รหัสผ่าน").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).last().click();
  await expect(page).toHaveURL(/\/farms$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
  release?.();
  await expect.poll(() => state.discovered).toBe(true);
  await expect(page.getByText(/ผลรอบค้นหา/)).toHaveCount(0);
  expect(state.historyReads).toBe(1);
});

test("[api-backed] history form discovers a real persisted observation through FastAPI", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) => json(route, { version: 8, sources: {}, layers: [] }));
  const csrf = await (await page.request.get(`${api}/api/v1/auth/csrf`)).json();
  const headers = { "X-CSRF-Token": csrf.csrf_token, Origin: "http://localhost:3000" };
  const registered = await page.request.post(`${api}/api/v1/auth/register`, { headers, data: {
    email: `history-${Date.now()}@example.com`, password: "StrongPass12345", display_name: "History Farmer", organization_name: "History Org"
  } });
  expect(registered.ok(), await registered.text()).toBe(true);
  const organizations = await (await page.request.get(`${api}/api/v1/organizations`)).json();
  const farmResponse = await page.request.post(`${api}/api/v1/farms`, { headers, data: { organization_id: organizations[0].id, name: "History Farm", province: "Chiang Mai" } });
  expect(farmResponse.ok()).toBe(true);
  const farm = await farmResponse.json();
  const created = await page.request.post(`${api}/api/v1/farms/${farm.id}/fields`, { headers, data: { name: "History Field", geometry: field.geometry } });
  expect(created.ok()).toBe(true);
  const savedField = await created.json();
  await page.goto(`/fields/${savedField.id}`);
  await page.getByText("ค้นหาภาพย้อนหลัง", { exact: true }).click();
  await page.getByLabel("ตั้งแต่วันที่").fill("2026-07-01");
  await page.getByLabel("ถึงวันที่").fill("2026-07-31");
  await page.getByRole("button", { name: "ค้นหารายการภาพ", exact: true }).click();
  await expect(page.locator("details").getByRole("status")).toContainText("พบ 1 ภาพ");
  await expect(page.locator("[data-observation-id]")).toHaveCount(1);
  const persisted = await page.request.get(`${api}/api/v1/fields/${savedField.id}/observations`);
  expect((await persisted.json()).length).toBe(1);
});
