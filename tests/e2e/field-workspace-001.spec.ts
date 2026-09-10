import { expect, test, type Page, type Route } from "@playwright/test";
import type { FieldBoundary, FieldChange, Observation, ObservationNdviSummary, ObservationRaster, User } from "../../apps/web/lib/types";

const analysisVersion = "agriscope-ndvi-summary-v1+agriscope-ndvi-raster-v1";
const field: FieldBoundary = {
  id: "00000000-0000-0000-0000-000000000031",
  farm_id: "00000000-0000-0000-0000-000000000020",
  organization_id: "00000000-0000-0000-0000-000000000010",
  name: "A02",
  geometry: {
    type: "Polygon",
    coordinates: [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.8], [98.98, 18.79]]]
  },
  area_sqm: "5440",
  area_rai: "3.40",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
};

const user: User = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.test",
  display_name: "สมชาย"
};

const userB: User = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "owner-b@example.test",
  display_name: "สุดา"
};

const geometryHash = "a".repeat(64);
const before: Observation = {
  observation_id: "00000000-0000-0000-0000-000000000041",
  field_id: field.id,
  acquired_at: "2026-08-17T03:00:00Z",
  cloud_percent: 2,
  source: "Sentinel-2",
  status: "USABLE",
  imagery_available: true,
  geometry_hash: geometryHash,
  analysis_eligible: true,
  analysis_ready: true,
  comparison_eligible: true
};

const after: Observation = {
  observation_id: "00000000-0000-0000-0000-000000000042",
  field_id: field.id,
  acquired_at: "2026-08-22T03:00:00Z",
  cloud_percent: 6,
  source: "Sentinel-2",
  status: "USABLE",
  imagery_available: true,
  geometry_hash: geometryHash,
  analysis_eligible: true,
  analysis_ready: false,
  comparison_eligible: true
};

const poorQuality: Observation = {
  observation_id: "00000000-0000-0000-0000-000000000043",
  field_id: field.id,
  acquired_at: "2026-08-25T03:00:00Z",
  cloud_percent: 84,
  source: "Sentinel-2",
  status: "POOR_QUALITY",
  imagery_available: true,
  geometry_hash: geometryHash,
  analysis_eligible: false,
  analysis_ready: false,
  comparison_eligible: false
};

const legacy: Observation = {
  observation_id: "00000000-0000-0000-0000-000000000044",
  field_id: field.id,
  acquired_at: "2026-08-26T03:00:00Z",
  cloud_percent: 5,
  source: "Sentinel-2",
  status: "USABLE",
  imagery_available: true,
  geometry_hash: null,
  analysis_eligible: false,
  analysis_ready: false,
  comparison_eligible: false
};

const unavailable: Observation = {
  observation_id: "00000000-0000-0000-0000-000000000045",
  field_id: field.id,
  acquired_at: "2026-08-27T03:00:00Z",
  cloud_percent: null,
  source: "Sentinel-2",
  status: "UNAVAILABLE",
  imagery_available: false,
  geometry_hash: null,
  analysis_eligible: false,
  analysis_ready: false,
  comparison_eligible: false
};

// Dark fixture with a cyan square exactly at the image center. The corresponding
// change fixture is a ring around the geographic center, so the browser can measure
// real rendered landmark registration instead of trusting data attributes.
const previewPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAS0lEQVR4nGMU0RD5zzCAgGkgLR91wKgDRh0w6oBRBwwKB7CQo+nN9ddYxUU0RUk2a8BDYNQBow5gHG2SjTpg1AGjDhh1wKgDBtoBANapBd8qNoQFAAAAAElFTkSuQmCC",
  "base64"
);

const ndviSummary = (observation: Observation): ObservationNdviSummary => ({
  observation_id: observation.observation_id,
  field_id: field.id,
  acquired_at: observation.acquired_at,
  algorithm_version: analysisVersion,
  geometry_hash: geometryHash,
  analysis_eligible: true,
  analysis_ready: true,
  assessable: true,
  ndvi_mean: observation.observation_id === before.observation_id ? 0.75 : 0.62,
  ndvi_min: 0.45,
  ndvi_max: 0.75,
  ndvi_stddev: 0.08,
  sample_count: 100,
  valid_sample_count: 90,
  valid_pixel_ratio: 0.9
});

const raster = (observation: Observation): ObservationRaster => ({
  observation_id: observation.observation_id,
  field_id: field.id,
  acquired_at: observation.acquired_at,
  algorithm_version: analysisVersion,
  geometry_hash: geometryHash,
  crs: "EPSG:4326",
  bounds: [98.98, 18.79, 98.99, 18.8],
  width: 32,
  height: 32,
  nodata: -9999,
  value_min: 0.45,
  value_max: 0.75,
  valid_pixel_ratio: 0.9,
  image_url: `/api/v1/fields/${field.id}/observations/${observation.observation_id}/ndvi-raster/image`
});

const change: FieldChange = {
  field_id: field.id,
  before_observation_id: before.observation_id,
  after_observation_id: after.observation_id,
  algorithm_version: analysisVersion,
  geometry_hash: geometryHash,
  before_observation_ndvi_mean: 0.75,
  after_observation_ndvi_mean: 0.62,
  before_ndvi: 0.75,
  after_ndvi: 0.62,
  ndvi_delta: -0.13,
  changed_area_sqm: 820,
  changed_area_rai: 0.5125,
  threshold: -0.1,
  highlight_semantics: "NDVI_DECREASE_AT_OR_BELOW_THRESHOLD",
  status: "USABLE",
  support: {
    common_valid_pixel_count: 90,
    field_grid_pixel_count: 100,
    common_support_ratio: 0.9,
    minimum_required_ratio: 0.4,
    policy_version: "common-field-grid-v1-provisional",
    denominator: "FIELD_GRID_PIXEL_CENTERS",
    reason: "SUFFICIENT_COMMON_SUPPORT"
  },
  geometry: {
    type: "MultiPolygon",
    coordinates: [[
      [[98.9842, 18.7942], [98.9858, 18.7942], [98.9858, 18.7958], [98.9842, 18.7958], [98.9842, 18.7942]],
      [[98.9847, 18.7947], [98.9847, 18.7953], [98.9853, 18.7953], [98.9853, 18.7947], [98.9847, 18.7947]]
    ]]
  }
};

const notAssessable: FieldChange = {
  ...change,
  before_ndvi: null,
  after_ndvi: null,
  ndvi_delta: null,
  changed_area_sqm: null,
  changed_area_rai: null,
  status: "NOT_ASSESSABLE",
  support: {
    ...change.support,
    common_valid_pixel_count: 20,
    common_support_ratio: 0.2,
    reason: "BELOW_MINIMUM_COMMON_SUPPORT"
  },
  geometry: null
};

type ErrorResponse = { status: number; code: string; message: string };
type Operation = "preview" | "ndvi-summary" | "ndvi-raster" | "ndvi-raster/image";

type MockOptions = {
  observations?: Observation[];
  requestGates?: Map<string, Promise<void>>;
  summaryErrors?: Record<string, ErrorResponse>;
  changeResponse?: FieldChange | ErrorResponse;
  changeGate?: Promise<void>;
  styleError?: () => boolean;
  userResponse?: () => User;
  fieldResponse?: () => FieldBoundary | ErrorResponse;
  onLogin?: () => void;
};

function requestGateKey(observationId: string, operation: Operation) {
  return `${observationId}:${operation}`;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function apiError(route: Route, response: ErrorResponse) {
  return json(route, { error: { code: response.code, message: response.message } }, response.status);
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === "object" && value !== null && "status" in value && "code" in value;
}

async function mockFieldWorkspace(page: Page, options: MockOptions = {}) {
  const calls = {
    preview: {} as Record<string, number>,
    summary: {} as Record<string, number>,
    raster: {} as Record<string, number>,
    image: {} as Record<string, number>,
    change: 0,
    login: 0
  };
  await page.route("https://tiles.openfreemap.org/**", async (route) => {
    if (options.styleError?.()) return json(route, { error: "style unavailable" }, 503);
    return json(route, { version: 8, sources: {}, layers: [] });
  });
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/v1/auth/me") return json(route, options.userResponse?.() ?? user);
    if (path === "/api/v1/auth/login") {
      calls.login += 1;
      options.onLogin?.();
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/v1/auth/csrf") return json(route, { csrf_token: "e2e-csrf" });
    if (path === "/api/v1/farms") return json(route, []);
    if (path === "/api/v1/organizations") return json(route, []);
    if (path === `/api/v1/fields/${field.id}`) {
      const response = options.fieldResponse?.() ?? field;
      return isErrorResponse(response) ? apiError(route, response) : json(route, response);
    }
    if (path === `/api/v1/fields/${field.id}/observations`) {
      return json(route, options.observations ?? [poorQuality, after, before, legacy, unavailable]);
    }
    const observationMatch = path.match(new RegExp(`/observations/([^/]+)/(preview|ndvi-summary|ndvi-raster(?:/image)?)$`));
    if (observationMatch) {
      const observationId = observationMatch[1];
      const operation = observationMatch[2] as Operation;
      const gate = options.requestGates?.get(requestGateKey(observationId, operation));
      if (operation === "preview") calls.preview[observationId] = (calls.preview[observationId] ?? 0) + 1;
      if (operation === "ndvi-summary") calls.summary[observationId] = (calls.summary[observationId] ?? 0) + 1;
      if (operation === "ndvi-raster") calls.raster[observationId] = (calls.raster[observationId] ?? 0) + 1;
      if (operation === "ndvi-raster/image") calls.image[observationId] = (calls.image[observationId] ?? 0) + 1;
      if (gate) await gate;
      if (operation === "preview" || operation === "ndvi-raster/image") {
        return route.fulfill({ status: 200, contentType: "image/png", body: previewPng });
      }
      if (operation === "ndvi-summary") {
        const error = options.summaryErrors?.[observationId];
        if (error) return apiError(route, error);
        const observation = (options.observations ?? [poorQuality, after, before, legacy, unavailable]).find((item) => item.observation_id === observationId);
        return observation ? json(route, ndviSummary(observation)) : apiError(route, { status: 404, code: "not_found", message: "not found" });
      }
      const observation = (options.observations ?? [poorQuality, after, before, legacy, unavailable]).find((item) => item.observation_id === observationId);
      return observation ? json(route, raster(observation)) : apiError(route, { status: 404, code: "not_found", message: "not found" });
    }
    if (path === `/api/v1/fields/${field.id}/change`) {
      calls.change += 1;
      if (options.changeGate) await options.changeGate;
      const response = options.changeResponse ?? change;
      return isErrorResponse(response) ? apiError(route, response) : json(route, response);
    }
    return apiError(route, { status: 404, code: "not_found", message: "not found" });
  });
  return calls;
}

function map(page: Page) {
  return page.locator(`[role="img"][data-field-id="${field.id}"]`);
}

async function captureVisual(page: Page, name: string) {
  const directory = process.env.MAP_VISUAL_ARTIFACT_DIR;
  if (!directory) return;
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

async function renderedLandmarks(page: Page) {
  return map(page).locator("canvas[data-evidence-canvas='true']").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (!context) return { cyan: null, clay: null, cyanCount: 0, clayCount: 0 };
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let cyanX = 0; let cyanY = 0; let cyanCount = 0;
    let clayX = 0; let clayY = 0; let clayCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2]; const a = data[offset + 3];
        if (a > 0 && r < 90 && g > 165 && b > 165) { cyanX += x; cyanY += y; cyanCount += 1; }
        if (a > 0 && r > 135 && r > g * 1.25 && g < 145 && b < 115) { clayX += x; clayY += y; clayCount += 1; }
      }
    }
    return {
      cyan: cyanCount ? { x: cyanX / cyanCount, y: cyanY / cyanCount } : null,
      clay: clayCount ? { x: clayX / clayCount, y: clayY / clayCount } : null,
      cyanCount,
      clayCount
    };
  });
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

test("[mocked-api] acquired, eligible, measured, poor-quality, cold-cache, and last-good states stay distinct", async ({ page }) => {
  let releaseSummary: (() => void) | undefined;
  const summaryGate = new Promise<void>((resolve) => { releaseSummary = resolve; });
  const calls = await mockFieldWorkspace(page, {
    requestGates: new Map([[requestGateKey(after.observation_id, "ndvi-summary"), summaryGate]])
  });
  await page.goto(`/fields/${field.id}`);

  await expect(page.getByText("ภาพล่าสุดที่ได้มา").locator("..")).toContainText("27 ส.ค.");
  await expect(page.getByText("ล่าสุดที่พร้อมประเมิน").locator("..")).toContainText("22 ส.ค.");
  await expect(page.getByText("ล่าสุดที่วัด NDVI สำเร็จ").locator("..")).toContainText("17 ส.ค.");

  await page.locator(`[data-observation-id="${legacy.observation_id}"]`).click();
  await expect(page.getByText("ยังยืนยันขอบเขตและแหล่งที่มาของภาพวันที่นี้ไม่ได้ จึงยังประเมิน NDVI ไม่ได้")).toBeVisible();
  await expect(page.getByText("ล่าสุดที่พร้อมประเมิน").locator("..")).toContainText("22 ส.ค.");

  await page.locator(`[data-observation-id="${poorQuality.observation_id}"]`).click();
  await expect(page.getByText("ภาพวันที่เลือกมีเมฆปกคลุมสูง (84%) แสดงภาพตัวอย่างได้ แต่ยังไม่ใช้คำนวณ NDVI")).toBeVisible();
  await captureVisual(page, "field-poor-quality");
  expect(calls.preview[poorQuality.observation_id]).toBe(1);
  expect(calls.summary[poorQuality.observation_id] ?? 0).toBe(0);

  const selectedAfter = page.locator(`[data-observation-id="${after.observation_id}"]`);
  await selectedAfter.click();
  await expect(selectedAfter).toHaveAttribute("data-current", "true");
  await expect(page.getByText("กำลังประเมิน")).toBeVisible();
  await expect.poll(() => calls.summary[after.observation_id]).toBe(1);
  await expect.poll(() => calls.raster[after.observation_id]).toBe(1);
  await expect.poll(() => calls.change).toBe(1);
  releaseSummary?.();
  await expect(page.getByText("0.62", { exact: true })).toBeVisible();
  await expect(page.getByText("ล่าสุดที่วัด NDVI สำเร็จ").locator("..")).toContainText("22 ส.ค.");
  await expect(page.getByText("วัดสำเร็จและบันทึกแล้ว")).toBeVisible();

  const previewCalls = calls.preview[after.observation_id];
  const summaryCalls = calls.summary[after.observation_id];
  const rasterCalls = calls.raster[after.observation_id];
  await page.getByRole("button", { name: "NDVI", exact: true }).click();
  await expect.poll(() => calls.image[after.observation_id]).toBe(1);
  await expect(map(page)).toHaveAttribute("data-image-ready", "true");
  await page.getByRole("button", { name: "พื้นที่ NDVI ลดลง" }).click();
  await page.getByRole("button", { name: "ภาพดาวเทียม" }).click();
  await page.getByRole("button", { name: "NDVI", exact: true }).click();
  expect(calls.preview[after.observation_id]).toBe(previewCalls);
  expect(calls.summary[after.observation_id]).toBe(summaryCalls);
  expect(calls.raster[after.observation_id]).toBe(rasterCalls);
  expect(calls.image[after.observation_id]).toBe(1);
  await captureVisual(page, "field-ndvi-cold-cache");
});

test("[mocked-api] failed current analysis preserves the last-good measured observation", async ({ page }) => {
  await mockFieldWorkspace(page, {
    observations: [after, before],
    summaryErrors: { [after.observation_id]: { status: 422, code: "satellite_insufficient_quality", message: "current attempt failed" } }
  });
  await page.goto(`/fields/${field.id}`);

  await expect(page.getByText("การประเมินครั้งล่าสุดไม่สำเร็จ")).toBeVisible();
  await expect(page.getByText("ล่าสุดที่วัด NDVI สำเร็จ").locator("..")).toContainText("17 ส.ค.");
  await expect(page.getByText("current attempt failed")).toHaveCount(0);
});

test("[mocked-api] legacy observation keeps preview access but never claims analytical readiness", async ({ page }) => {
  const calls = await mockFieldWorkspace(page, { observations: [legacy] });
  await page.goto(`/fields/${field.id}`);

  await expect(page.getByText("ยังยืนยันขอบเขตและแหล่งที่มาของภาพวันที่นี้ไม่ได้ จึงยังประเมิน NDVI ไม่ได้")).toBeVisible();
  await expect(page.getByText("ล่าสุดที่พร้อมประเมิน").locator("..")).toContainText("ยังไม่มี");
  await expect(page.getByText("ล่าสุดที่วัด NDVI สำเร็จ").locator("..")).toContainText("ยังไม่มี");
  await expect(map(page)).toHaveAttribute("data-image-ready", "true");
  expect(calls.preview[legacy.observation_id]).toBe(1);
  expect(calls.summary[legacy.observation_id] ?? 0).toBe(0);
  expect(calls.raster[legacy.observation_id] ?? 0).toBe(0);
});

test("[mocked-api] selection transition never exposes fully-loaded A assets or comparison under delayed B", async ({ page }) => {
  let releasePreview: (() => void) | undefined;
  let releaseSummary: (() => void) | undefined;
  let releaseRaster: (() => void) | undefined;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  const summaryGate = new Promise<void>((resolve) => { releaseSummary = resolve; });
  const rasterGate = new Promise<void>((resolve) => { releaseRaster = resolve; });
  const calls = await mockFieldWorkspace(page, {
    observations: [after, before],
    requestGates: new Map([
      [requestGateKey(before.observation_id, "preview"), previewGate],
      [requestGateKey(before.observation_id, "ndvi-summary"), summaryGate],
      [requestGateKey(before.observation_id, "ndvi-raster"), rasterGate]
    ])
  });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByText("0.62", { exact: true })).toBeVisible();
  await expect(page.getByText("↓ 0.13", { exact: true })).toBeVisible();

  await page.evaluate((beforeId) => {
    const scope = window as typeof window & { __agriscopeLeakSnapshots?: string[]; __agriscopeLeakObserver?: MutationObserver };
    scope.__agriscopeLeakSnapshots = [];
    scope.__agriscopeLeakObserver = new MutationObserver(() => {
      const selected = document.querySelector(`[data-observation-id="${beforeId}"][data-current="true"]`);
      if (!selected) return;
      const text = document.body.innerText;
      if (text.includes("0.62") || text.includes("↓ 0.13") || text.includes("0.5 ไร่")) scope.__agriscopeLeakSnapshots?.push(text);
    });
    scope.__agriscopeLeakObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  }, before.observation_id);

  const selectedBefore = page.locator(`[data-observation-id="${before.observation_id}"]`);
  await selectedBefore.click();
  await expect(selectedBefore).toHaveAttribute("data-current", "true");
  await expect.poll(() => calls.preview[before.observation_id]).toBe(1);
  await expect.poll(() => calls.summary[before.observation_id]).toBe(1);
  await expect.poll(() => calls.raster[before.observation_id]).toBe(1);
  await expect(page.getByText("0.62", { exact: true })).toHaveCount(0);
  await expect(page.getByText("↓ 0.13", { exact: true })).toHaveCount(0);
  await expect(page.getByText("0.5 ไร่", { exact: true })).toHaveCount(0);
  const transitionLeaks = await page.evaluate(() => (window as typeof window & { __agriscopeLeakSnapshots?: string[] }).__agriscopeLeakSnapshots ?? []);
  expect(transitionLeaks).toEqual([]);

  releasePreview?.(); releaseSummary?.(); releaseRaster?.();
  await expect(page.getByText("0.75", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as typeof window & { __agriscopeLeakObserver?: MutationObserver }).__agriscopeLeakObserver?.disconnect());
});

test("[mocked-api] late A preview, summary, raster, and comparison responses cannot overwrite B", async ({ page }) => {
  let releasePreview: (() => void) | undefined;
  let releaseSummary: (() => void) | undefined;
  let releaseRaster: (() => void) | undefined;
  let releaseChange: (() => void) | undefined;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  const summaryGate = new Promise<void>((resolve) => { releaseSummary = resolve; });
  const rasterGate = new Promise<void>((resolve) => { releaseRaster = resolve; });
  const changeGate = new Promise<void>((resolve) => { releaseChange = resolve; });
  const calls = await mockFieldWorkspace(page, {
    observations: [after, before],
    requestGates: new Map([
      [requestGateKey(after.observation_id, "preview"), previewGate],
      [requestGateKey(after.observation_id, "ndvi-summary"), summaryGate],
      [requestGateKey(after.observation_id, "ndvi-raster"), rasterGate]
    ]),
    changeGate
  });
  await page.goto(`/fields/${field.id}`);
  await expect.poll(() => calls.preview[after.observation_id]).toBe(1);
  await expect.poll(() => calls.summary[after.observation_id]).toBe(1);
  await expect.poll(() => calls.raster[after.observation_id]).toBe(1);
  await expect.poll(() => calls.change).toBe(1);

  const selectedBefore = page.locator(`[data-observation-id="${before.observation_id}"]`);
  await selectedBefore.click();
  await expect(selectedBefore).toHaveAttribute("data-current", "true");
  releasePreview?.(); releaseSummary?.(); releaseRaster?.(); releaseChange?.();
  await page.waitForTimeout(250);
  await expect(selectedBefore).toHaveAttribute("data-current", "true");
  await expect(page.getByText("0.62", { exact: true })).toHaveCount(0);
  await expect(page.getByText("↓ 0.13", { exact: true })).toHaveCount(0);
  await expect(map(page)).toHaveAttribute("data-render-key", new RegExp(before.observation_id));
});

test("[mocked-api] not-assessable comparison never renders unchanged or zero changed area", async ({ page }) => {
  await mockFieldWorkspace(page, { observations: [after, before], changeResponse: notAssessable });
  await page.goto(`/fields/${field.id}`);

  await expect(page.getByText(/พื้นที่ร่วมที่ใช้วัดได้ 20\.0%/)).toBeVisible();
  await expect(page.getByText("0.0 ไร่", { exact: true })).toHaveCount(0);
  await expect(page.getByText("→ 0.00", { exact: true })).toHaveCount(0);
});

test("[mocked-api] map initialization errors remain visible until a real retry succeeds", async ({ page }) => {
  let styleFailed = true;
  await mockFieldWorkspace(page, { styleError: () => styleFailed });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByText("แผนที่โหลดไม่สำเร็จ")).toBeVisible();
  await expect(page.getByText("กำลังโหลดข้อมูลวันที่เลือก…")).toHaveCount(0);
  await captureVisual(page, "field-map-error");
  styleFailed = false;
  await page.getByRole("button", { name: "ลองแผนที่อีกครั้ง" }).click();
  await expect(map(page)).toHaveAttribute("data-map-ready", "true");
  await expect(page.getByText("แผนที่โหลดไม่สำเร็จ")).toHaveCount(0);
});

test("[mocked-api] known raster and vector landmarks remain registered after pan and zoom", async ({ page }) => {
  await mockFieldWorkspace(page, { observations: [after, before] });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("link", { name: "เปรียบเทียบภาพ" })).toBeVisible();
  await page.getByRole("link", { name: "เปรียบเทียบภาพ" }).click();
  await expect(page).toHaveURL(new RegExp(`/fields/${field.id}/compare\\?before=${before.observation_id}&after=${after.observation_id}`));
  const compareMap = map(page);
  await expect(compareMap).toHaveAttribute("data-map-ready", "true");
  await expect(compareMap).toHaveAttribute("data-image-ready", "true");

  await page.getByRole("button", { name: "พื้นที่ NDVI ลดลง" }).click();
  await expect(page.getByText(/พิกเซลบนพื้นที่ร่วมที่ค่า NDVI ลดลง/)).toBeVisible();
  const initial = await renderedLandmarks(page);
  expect(initial.cyanCount).toBeGreaterThan(10);
  expect(initial.clayCount).toBeGreaterThan(10);
  expect(initial.cyan).not.toBeNull();
  expect(initial.clay).not.toBeNull();
  if (!initial.cyan || !initial.clay) throw new Error("landmark fixture did not render");
  expect(distance(initial.cyan, initial.clay)).toBeLessThanOrEqual(10);

  const mapCanvas = compareMap.locator(".maplibregl-canvas");
  const box = await mapCanvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58, { steps: 8 });
  await page.mouse.up();
  await mapCanvas.hover();
  await page.mouse.wheel(0, -650);
  await page.waitForTimeout(250);

  const moved = await renderedLandmarks(page);
  expect(moved.cyanCount).toBeGreaterThan(10);
  expect(moved.clayCount).toBeGreaterThan(10);
  expect(moved.cyan).not.toBeNull();
  expect(moved.clay).not.toBeNull();
  if (!moved.cyan || !moved.clay) throw new Error("landmarks disappeared after map interaction");
  expect(distance(moved.cyan, moved.clay)).toBeLessThanOrEqual(10);
  expect(distance(initial.cyan, moved.cyan)).toBeGreaterThan(10);
  await captureVisual(page, "field-compare-spatial-registration");
});

test("[mocked-api] empty history and terminal auth keep protected field content out of the UI", async ({ browser }) => {
  const emptyContext = await browser.newContext();
  const emptyPage = await emptyContext.newPage();
  await mockFieldWorkspace(emptyPage, { observations: [] });
  await emptyPage.goto(`/fields/${field.id}`);
  await expect(emptyPage.getByText("ยังไม่มีประวัติภาพสำหรับแปลงนี้")).toBeVisible();
  await expect(map(emptyPage)).toHaveCount(0);
  await emptyContext.close();

  const authContext = await browser.newContext();
  const authPage = await authContext.newPage();
  await mockFieldWorkspace(authPage, {
    observations: [after],
    summaryErrors: { [after.observation_id]: { status: 401, code: "invalid_refresh_token", message: "private auth detail" } }
  });
  await authPage.goto(`/fields/${field.id}`);
  await expect(authPage.getByRole("heading", { name: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(map(authPage)).toHaveCount(0);
  await expect(authPage.getByText("private auth detail")).toHaveCount(0);
  await authContext.close();
});

test("[mocked-api] principal switch uses one document lifecycle and rejects pending principal-A work", async ({ page }) => {
  let principal: "a" | "b" = "a";
  let releaseSummary: (() => void) | undefined;
  const pendingSummary = new Promise<void>((resolve) => { releaseSummary = resolve; });
  const calls = await mockFieldWorkspace(page, {
    observations: [after],
    requestGates: new Map([[requestGateKey(after.observation_id, "ndvi-summary"), pendingSummary]]),
    userResponse: () => principal === "a" ? user : userB,
    fieldResponse: () => principal === "a" ? field : { status: 404, code: "not_found", message: "private principal detail" },
    onLogin: () => { principal = "b"; }
  });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `แปลง ${field.name}` })).toBeVisible();
  await expect.poll(() => calls.summary[after.observation_id]).toBe(1);
  const lifecycle = await page.evaluate(() => {
    const scope = window as typeof window & { __agriscopeDocumentSentinel?: string };
    scope.__agriscopeDocumentSentinel = "principal-switch-same-document";
    return { sentinel: scope.__agriscopeDocumentSentinel, navigationEntries: performance.getEntriesByType("navigation").length };
  });

  await page.getByRole("link", { name: "เปลี่ยนบัญชี" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  await page.getByLabel("อีเมล").fill(userB.email);
  await page.getByLabel("รหัสผ่าน").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).last().click();
  await expect.poll(() => calls.login).toBe(1);
  await expect(page).toHaveURL(/\/farms$/);
  const afterSwitch = await page.evaluate(() => {
    const scope = window as typeof window & { __agriscopeDocumentSentinel?: string };
    return { sentinel: scope.__agriscopeDocumentSentinel, navigationEntries: performance.getEntriesByType("navigation").length };
  });
  expect(afterSwitch).toEqual(lifecycle);

  releaseSummary?.();
  await page.waitForTimeout(250);
  await expect(page.getByText(field.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText("0.62", { exact: true })).toHaveCount(0);
  await expect(page.getByText("private principal detail")).toHaveCount(0);
  await expect(map(page)).toHaveCount(0);
});

test("[mocked-api] field and observation response identity mismatches fail closed", async ({ page }) => {
  const wrongField = { ...field, id: "00000000-0000-0000-0000-000000000099" };
  await mockFieldWorkspace(page, { observations: [{ ...after, field_id: wrongField.id }] });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByText("ข้อมูลตอบกลับไม่ตรงกับแปลงที่เลือก")).toBeVisible();
  await expect(map(page)).toHaveCount(0);
});
