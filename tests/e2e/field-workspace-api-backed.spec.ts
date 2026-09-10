import { expect, test } from "@playwright/test";

const API_BASE = "http://localhost:8000";
const analysisVersion = "agriscope-ndvi-summary-v1+agriscope-ndvi-raster-v1";

const geometry = {
  type: "Polygon",
  coordinates: [[
    [98.9801, 18.7901],
    [98.9811, 18.7901],
    [98.9811, 18.7911],
    [98.9801, 18.7911],
    [98.9801, 18.7901]
  ]]
};

test("[api-backed] browser analysis reaches real FastAPI and disposable PostGIS with provider-only mocks", async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [] }) })
  );

  const observationRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes("/observations") || path.endsWith("/change")) observationRequests.push(path);
  });

  const email = `api-backed-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("StrongPass12345");
  await page.getByLabel("ชื่อของคุณ").fill("API Backed Farmer");
  await page.getByLabel("ชื่อองค์กร").fill("API Backed Org");
  await page.locator("form").getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect(page).toHaveURL(/\/farms$/);

  const setup = await page.evaluate(async ({ apiBase, fieldGeometry }) => {
    async function responseJson(response: Response) {
      const text = await response.text();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
      return body;
    }

    const csrfResponse = await fetch(`${apiBase}/api/v1/auth/csrf`, { credentials: "include" });
    const csrfBody = await responseJson(csrfResponse) as { csrf_token: string };
    const csrf = csrfBody.csrf_token;
    const mutationHeaders = { "Content-Type": "application/json", "X-CSRF-Token": csrf };

    const organizationsResponse = await fetch(`${apiBase}/api/v1/organizations`, { credentials: "include" });
    const organizations = await responseJson(organizationsResponse) as Array<{ id: string }>;
    if (!organizations[0]?.id) throw new Error("registered user has no organization");

    const farmResponse = await fetch(`${apiBase}/api/v1/farms`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders,
      body: JSON.stringify({ organization_id: organizations[0].id, name: "API-backed Farm", province: "Chiang Mai" })
    });
    const farm = await responseJson(farmResponse) as { id: string };

    const fieldResponse = await fetch(`${apiBase}/api/v1/farms/${farm.id}/fields`, {
      method: "POST",
      credentials: "include",
      headers: mutationHeaders,
      body: JSON.stringify({ name: "API-backed Field", geometry: fieldGeometry })
    });
    const field = await responseJson(fieldResponse) as { id: string };

    const searchResponse = await fetch(`${apiBase}/api/v1/fields/${field.id}/satellite/search-latest`, {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Token": csrf }
    });
    const search = await responseJson(searchResponse) as { status: string; acquisition?: { acquired_at?: string } };
    return { fieldId: field.id, searchStatus: search.status, acquiredAt: search.acquisition?.acquired_at ?? null };
  }, { apiBase: API_BASE, fieldGeometry: geometry });

  expect(setup.searchStatus).toBe("available");
  expect(setup.acquiredAt).toContain("2026-07-30");

  await page.goto(`/fields/${setup.fieldId}`);
  await expect(page.getByRole("heading", { level: 1, name: "แปลง API-backed Field" })).toBeVisible();
  await expect(page.getByText("0.44", { exact: true })).toBeVisible();
  await expect(page.getByText("ล่าสุดที่วัด NDVI สำเร็จ").locator("..")).toContainText("30 ก.ค.");
  await expect(page.getByText("วัดสำเร็จและบันทึกแล้ว")).toBeVisible();

  await page.getByRole("button", { name: "NDVI", exact: true }).click();
  const map = page.locator(`[role="img"][data-field-id="${setup.fieldId}"]`);
  await expect(map).toHaveAttribute("data-image-ready", "true");

  const persisted = await page.evaluate(async ({ apiBase, fieldId, expectedVersion }) => {
    async function json<T>(path: string): Promise<T> {
      const response = await fetch(`${apiBase}${path}`, { credentials: "include" });
      const body = await response.json();
      if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
      return body as T;
    }
    const observations = await json<Array<{
      observation_id: string;
      analysis_eligible: boolean;
      analysis_ready: boolean;
      geometry_hash: string | null;
    }>>(`/api/v1/fields/${fieldId}/observations`);
    if (observations.length !== 1) throw new Error(`expected one observation, received ${observations.length}`);
    const observation = observations[0];
    const raster = await json<{
      observation_id: string;
      field_id: string;
      algorithm_version: string;
      geometry_hash: string;
      crs: string;
      valid_pixel_ratio: number;
    }>(`/api/v1/fields/${fieldId}/observations/${observation.observation_id}/ndvi-raster`);
    return { observation, raster, expectedVersion };
  }, { apiBase: API_BASE, fieldId: setup.fieldId, expectedVersion: analysisVersion });

  expect(persisted.observation.analysis_eligible).toBe(true);
  expect(persisted.observation.analysis_ready).toBe(true);
  expect(persisted.observation.geometry_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(persisted.raster.field_id).toBe(setup.fieldId);
  expect(persisted.raster.observation_id).toBe(persisted.observation.observation_id);
  expect(persisted.raster.algorithm_version).toBe(analysisVersion);
  expect(persisted.raster.geometry_hash).toBe(persisted.observation.geometry_hash);
  expect(persisted.raster.crs).toBe("EPSG:4326");
  expect(persisted.raster.valid_pixel_ratio).toBeGreaterThanOrEqual(0.85);

  expect(observationRequests.some((path) => path.endsWith("/observations"))).toBe(true);
  expect(observationRequests.some((path) => path.endsWith("/ndvi-summary"))).toBe(true);
  expect(observationRequests.some((path) => path.endsWith("/ndvi-raster"))).toBe(true);
});
