import { expect, test, type Page, type Route } from "@playwright/test";
import type { FieldBoundary, FieldChange, Observation, ObservationNdviSummary, ObservationRaster, User } from "../../apps/web/lib/types";

const field: FieldBoundary = {
  id: "00000000-0000-0000-0000-000000000031",
  farm_id: "00000000-0000-0000-0000-000000000020",
  organization_id: "00000000-0000-0000-0000-000000000010",
  name: "A02",
  geometry: {
    type: "Polygon",
    coordinates: [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.79]]]
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

const previewPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGUlEQVR4nGNQjtf9rx1v+J9BOQ3ISDP8DwA4yAbfwPBTiwAAAABJRU5ErkJggg==",
  "base64"
);

const ndviSummary = (observation: Observation): ObservationNdviSummary => ({
  observation_id: observation.observation_id,
  field_id: field.id,
  acquired_at: observation.acquired_at,
  algorithm_version: "agriscope-ndvi-summary-v1+agriscope-ndvi-raster-v1",
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
  acquired_at: observation.acquired_at,
  crs: "EPSG:4326",
  bounds: [98.98, 18.79, 98.99, 18.8],
  width: 2,
  height: 2,
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
  before_ndvi: 0.75,
  after_ndvi: 0.62,
  ndvi_delta: -0.13,
  changed_area_sqm: 820,
  changed_area_rai: 0.5125,
  threshold: -0.1,
  status: "USABLE",
  geometry: { type: "MultiPolygon", coordinates: [[[[98.983, 18.793], [98.985, 18.793], [98.985, 18.795], [98.983, 18.793]]]] }
};

type ErrorResponse = { status: number; code: string; message: string };

type MockOptions = {
  observations?: Observation[];
  previewGates?: Map<string, Promise<void>>;
  summaryErrors?: Record<string, ErrorResponse>;
  changeResponse?: FieldChange | ErrorResponse;
  styleError?: () => boolean;
  userResponse?: () => User;
  fieldResponse?: () => FieldBoundary | ErrorResponse;
  onLogin?: () => void;
};

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
    const observationMatch = path.match(new RegExp(`/observations/([^/]+)/(preview|ndvi-summary|ndvi-raster|ndvi-raster/image)$`));
    if (observationMatch) {
      const observationId = observationMatch[1];
      const operation = observationMatch[2];
      if (operation === "preview") {
        calls.preview[observationId] = (calls.preview[observationId] ?? 0) + 1;
        const gate = options.previewGates?.get(observationId);
        if (gate) await gate;
        return route.fulfill({ status: 200, contentType: "image/png", body: previewPng });
      }
      if (operation === "ndvi-summary") {
        calls.summary[observationId] = (calls.summary[observationId] ?? 0) + 1;
        const error = options.summaryErrors?.[observationId];
        if (error) return apiError(route, error);
        const observation = (options.observations ?? [poorQuality, after, before, legacy, unavailable]).find((item) => item.observation_id === observationId);
        return observation ? json(route, ndviSummary(observation)) : apiError(route, { status: 404, code: "not_found", message: "not found" });
      }
      if (operation === "ndvi-raster") {
        calls.raster[observationId] = (calls.raster[observationId] ?? 0) + 1;
        const observation = (options.observations ?? [poorQuality, after, before, legacy, unavailable]).find((item) => item.observation_id === observationId);
        return observation ? json(route, raster(observation)) : apiError(route, { status: 404, code: "not_found", message: "not found" });
      }
      calls.image[observationId] = (calls.image[observationId] ?? 0) + 1;
      return route.fulfill({ status: 200, contentType: "image/png", body: previewPng });
    }
    if (path === `/api/v1/fields/${field.id}/change`) {
      calls.change += 1;
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

test("latest, selected, latest usable, poor quality, and cold-cache states stay distinct", async ({ page }) => {
  const calls = await mockFieldWorkspace(page);
  await page.goto(`/fields/${field.id}`);

  await expect(page.getByText("ภาพล่าสุดที่ได้มา").locator("..")).toContainText("27 ส.ค.");
  await expect(page.getByText("ล่าสุดที่ใช้วิเคราะห์ได้").locator("..")).toContainText("26 ส.ค.");
  await page.locator(`[data-observation-id="${poorQuality.observation_id}"]`).click();
  await expect(page.getByRole("heading", { level: 2, name: `แปลง ${field.name}` })).toBeVisible();
  await expect(page.getByText("ภาพวันที่เลือกมีเมฆปกคลุมสูง (84%) แสดงภาพตัวอย่างได้ แต่ยังไม่ใช้คำนวณ NDVI")).toBeVisible();
  await captureVisual(page, "field-poor-quality");
  expect(calls.preview[poorQuality.observation_id]).toBe(1);
  expect(calls.summary[poorQuality.observation_id] ?? 0).toBe(0);

  const selectedAfter = page.locator(`[data-observation-id="${after.observation_id}"]`);
  await selectedAfter.click();
  await expect(selectedAfter).toHaveAttribute("data-current", "true");
  await expect(page.getByText("จะคำนวณเมื่อเรียกใช้")).toBeVisible();
  await expect.poll(() => calls.summary[after.observation_id]).toBe(1);
  await expect.poll(() => calls.raster[after.observation_id]).toBe(1);
  await expect.poll(() => calls.change).toBe(1);
  await expect(page.getByRole("link", { name: "เปรียบเทียบภาพ" })).toBeVisible();

  await page.getByRole("button", { name: "NDVI" }).click();
  await expect.poll(() => calls.image[after.observation_id]).toBe(1);
  await expect(map(page)).toHaveAttribute("data-image-ready", "true");
  await expect(page.getByText("0.62")).toBeVisible();
  await captureVisual(page, "field-ndvi-cold-cache");
});

test("legacy observations retain preview access while unverified NDVI stays constrained", async ({ page }) => {
  const calls = await mockFieldWorkspace(page, { observations: [legacy] });
  await page.goto(`/fields/${field.id}`);

  await expect(page.getByText("ยังยืนยันขอบเขตและแหล่งที่มาของภาพวันที่นี้ไม่ได้ จึงยังประเมิน NDVI ไม่ได้")).toBeVisible();
  await expect(map(page)).toHaveAttribute("data-image-ready", "true");
  expect(calls.preview[legacy.observation_id]).toBe(1);
  expect(calls.summary[legacy.observation_id] ?? 0).toBe(0);
  expect(calls.raster[legacy.observation_id] ?? 0).toBe(0);
  await expect(page.getByText("ยังไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบกับภาพก่อนหน้า")).toBeVisible();
});

test("delayed old observation responses cannot paint over a new selection", async ({ page }) => {
  let releaseOldPreview: (() => void) | undefined;
  const oldPreview = new Promise<void>((resolve) => { releaseOldPreview = resolve; });
  const calls = await mockFieldWorkspace(page, {
    observations: [after, before],
    previewGates: new Map([[after.observation_id, oldPreview]])
  });
  await page.goto(`/fields/${field.id}`);
  await expect.poll(() => calls.preview[after.observation_id]).toBe(1);
  const selectedBefore = page.locator(`[data-observation-id="${before.observation_id}"]`);
  await selectedBefore.click();
  await expect(selectedBefore).toHaveAttribute("data-current", "true");
  await expect.poll(() => calls.preview[before.observation_id]).toBe(1);
  await expect(map(page)).toHaveAttribute("data-render-key", new RegExp(before.observation_id));
  releaseOldPreview?.();
  await page.waitForTimeout(250);
  await expect(selectedBefore).toHaveAttribute("data-current", "true");
  await expect(map(page)).toHaveAttribute("data-render-key", new RegExp(before.observation_id));
});

test("map initialization errors remain visible until a real retry succeeds", async ({ page }) => {
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

test("compare uses only comparison-eligible observations and proves spatial registration", async ({ page }) => {
  await mockFieldWorkspace(page, { observations: [after, before] });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("link", { name: "เปรียบเทียบภาพ" })).toBeVisible();
  await page.getByRole("link", { name: "เปรียบเทียบภาพ" }).click();
  await expect(page).toHaveURL(new RegExp(`/fields/${field.id}/compare\\?before=${before.observation_id}&after=${after.observation_id}`));
  const compareMap = map(page);
  await expect(compareMap).toHaveAttribute("data-map-ready", "true");
  await expect(compareMap).toHaveAttribute("data-image-ready", "true");
  await expect(compareMap).toHaveAttribute("data-spatial-extent", "98.98,18.79,98.99,18.8");
  await expect(compareMap).toHaveAttribute("data-render-key", `${before.observation_id}:${after.observation_id}:satellite`);

  await page.getByRole("button", { name: "NDVI" }).click();
  await expect(compareMap).toHaveAttribute("data-image-ready", "true");
  await expect(compareMap).toHaveAttribute("data-render-key", `${before.observation_id}:${after.observation_id}:ndvi`);
  const renderedEvidence = await compareMap.locator("canvas[data-evidence-canvas='true']").evaluate((canvas) => {
    const context = canvas.getContext("2d");
    if (!context) return { width: canvas.width, height: canvas.height, hasPixels: false };
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, hasPixels: Array.from(pixels).some((value, index) => index % 4 === 3 && value > 0) };
  });
  expect(renderedEvidence.hasPixels).toBe(true);
  await captureVisual(page, "field-compare-spatial-registration");
});

test("empty history and terminal auth keep protected field content out of the UI", async ({ browser }) => {
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

test("principal switch in one application lifecycle clears protected observation content", async ({ page }) => {
  let principal: "a" | "b" = "a";
  const calls = await mockFieldWorkspace(page, {
    observations: [after],
    userResponse: () => principal === "a" ? user : userB,
    fieldResponse: () => principal === "a" ? field : { status: 404, code: "not_found", message: "private principal detail" },
    onLogin: () => { principal = "b"; }
  });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("heading", { level: 1, name: `แปลง ${field.name}` })).toBeVisible();
  await page.goto("/login");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  await page.getByLabel("อีเมล").fill(userB.email);
  await page.getByLabel("รหัสผ่าน").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).last().click();
  await expect.poll(() => calls.login).toBe(1);
  await expect(page).toHaveURL(/\/farms$/);
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByText("โหลดข้อมูลแปลงไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง")).toBeVisible();
  await expect(page.getByText(field.name, { exact: true })).toHaveCount(0);
  await expect(map(page)).toHaveCount(0);
});

test("field and observation response identity mismatches fail closed", async ({ page }) => {
  const wrongField = { ...field, id: "00000000-0000-0000-0000-000000000099" };
  await mockFieldWorkspace(page, { observations: [{ ...after, field_id: wrongField.id }] });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByText("ข้อมูลตอบกลับไม่ตรงกับแปลงที่เลือก")).toBeVisible();
  await expect(map(page)).toHaveCount(0);
});
