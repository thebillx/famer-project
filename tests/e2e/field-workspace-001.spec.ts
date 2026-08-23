import { expect, test, type Browser, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

const field = {
  id: "00000000-0000-0000-0000-000000000031",
  farm_id: "00000000-0000-0000-0000-000000000020",
  organization_id: "00000000-0000-0000-0000-000000000010",
  name: '<img src="https://fixture.invalid/pixel" onerror="alert(1)"> แปลงข้าวเหนียวอินทรีย์ชื่อยาวสำหรับหน้าจอขนาดเล็ก',
  geometry: {
    type: "Polygon",
    coordinates: [[[98.981, 18.791], [98.991, 18.791], [98.996, 18.796], [98.981, 18.791]]]
  },
  area_sqm: "2400",
  area_rai: "1.50",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
} as const;

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "viewer-a@example.com",
  display_name: "ผู้ใช้เอ"
} as const;

const userB = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "viewer-b@example.com",
  display_name: "ผู้ใช้บี"
} as const;

const notSearched = {
  field_id: field.id,
  status: "not_searched",
  acquisition: null,
  searched_at: null,
  message_th: "ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้"
} as const;

type ErrorResponse = { status: number; code: string; message: string };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function apiError(route: Route, response: ErrorResponse) {
  return json(route, { error: { code: response.code, message: response.message } }, response.status);
}

async function mockFieldWorkspace(
  page: Page,
  options: {
    identityGate?: Promise<void>;
    identityResponse?: typeof user | ErrorResponse | ((call: number) => typeof user | ErrorResponse);
    fieldGate?: Promise<void>;
    fieldResponse?: typeof field | ErrorResponse | ((call: number) => typeof field | ErrorResponse);
    latestResponse?: unknown | ErrorResponse;
    searchResponse?: unknown | ErrorResponse | ((call: number) => unknown | ErrorResponse);
  } = {}
) {
  const calls = { identity: 0, field: 0, latest: 0, search: 0, csrf: 0, refresh: 0 };
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    json(route, { version: 8, sources: {}, layers: [] })
  );
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/auth/me" && request.method() === "GET") {
      calls.identity += 1;
      if (options.identityGate) await options.identityGate;
      const configured = typeof options.identityResponse === "function"
        ? options.identityResponse(calls.identity)
        : options.identityResponse;
      const response = configured ?? user;
      return "code" in response ? apiError(route, response) : json(route, response);
    }
    if (path === `/api/v1/fields/${field.id}` && request.method() === "GET") {
      calls.field += 1;
      if (options.fieldGate) await options.fieldGate;
      const configured = typeof options.fieldResponse === "function"
        ? options.fieldResponse(calls.field)
        : options.fieldResponse;
      const response = configured ?? field;
      return "code" in response ? apiError(route, response) : json(route, response);
    }
    if (path === `/api/v1/fields/${field.id}/satellite/latest` && request.method() === "GET") {
      calls.latest += 1;
      const response = options.latestResponse ?? notSearched;
      return isErrorResponse(response) ? apiError(route, response) : json(route, response);
    }
    if (path === `/api/v1/fields/${field.id}/satellite/search-latest` && request.method() === "POST") {
      calls.search += 1;
      const configured = typeof options.searchResponse === "function"
        ? options.searchResponse(calls.search)
        : options.searchResponse;
      const response = configured ?? {
        field_id: field.id,
        status: "no_data",
        acquisition: null,
        searched_at: "2026-08-22T05:00:00Z",
        message_th: "ไม่พบข้อมูลในช่วงเวลาที่ค้นหา"
      };
      return isErrorResponse(response) ? apiError(route, response) : json(route, response);
    }
    if (path === "/api/v1/auth/csrf") {
      calls.csrf += 1;
      return json(route, { csrf_token: "test-csrf" });
    }
    if (path === "/api/v1/auth/refresh") {
      calls.refresh += 1;
      return apiError(route, { status: 401, code: "invalid_refresh_token", message: "private refresh detail" });
    }
    return apiError(route, { status: 404, code: "not_found", message: "Not found" });
  });
  return calls;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === "object" && value !== null && "code" in value && "status" in value;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

test("direct workspace loads one safe field surface from the existing field contract", async ({ page }) => {
  let releaseIdentity: (() => void) | undefined;
  const identityGate = new Promise<void>((resolve) => {
    releaseIdentity = resolve;
  });
  let releaseField: (() => void) | undefined;
  const fieldGate = new Promise<void>((resolve) => {
    releaseField = resolve;
  });
  const fixtureRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("fixture.invalid")) fixtureRequests.push(request.url());
  });
  const calls = await mockFieldWorkspace(page, { identityGate, fieldGate });

  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("status").filter({ hasText: "กำลังตรวจสอบบัญชี..." })).toBeVisible();
  expect(calls.field).toBe(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);

  releaseIdentity?.();
  await expect(page.getByRole("status").filter({ hasText: "กำลังโหลดพื้นที่ทำงานแปลง..." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);

  releaseField?.();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(field.name);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByText(field.name, { exact: true })).toHaveCount(1);
  await expect(page.getByText("พื้นที่คำนวณโดยเซิร์ฟเวอร์").locator("..")).toContainText("2400 ตร.ม. / 1.50 ไร่");
  await expect(page.getByRole("link", { name: "กลับไปฟาร์ม" })).toHaveAttribute("href", `/farms/${field.farm_id}`);
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-vertex-count", "3");
  await expect(page.getByText("ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้", { exact: true })).toBeVisible();
  expect(calls).toMatchObject({ field: 1, latest: 1, search: 0 });

  const backTarget = await page.getByRole("link", { name: "กลับไปฟาร์ม" }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const searchTarget = await page.getByRole("button", { name: "ตรวจสอบภาพดาวเทียมล่าสุด" }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(backTarget.width).toBeGreaterThanOrEqual(44);
  expect(backTarget.height).toBeGreaterThanOrEqual(44);
  expect(searchTarget.width).toBeGreaterThanOrEqual(44);
  expect(searchTarget.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("img[src*='fixture.invalid']")).toHaveCount(0);
  expect(fixtureRequests).toEqual([]);

  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toContain(field.id);
  expect(visibleText).not.toContain(field.farm_id);
  expect(visibleText).not.toContain(field.organization_id);
  expect(visibleText).not.toMatch(/98\.981|18\.796/);
  expect(visibleText).not.toMatch(/วินิจฉัย|โรคพืช|ศัตรูพืช|ขาดธาตุ|น้ำท่วม|ความเสี่ยง|แจ้งเตือน|คำแนะนำสารเคมี|ปลอดภัย|ปกติดี/);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
  }
});

test("authentication, not-found, and retryable field failures remain mutually exclusive and safe", async ({ browser }) => {
  await expectFieldFailure(browser, {
    response: { status: 401, code: "authentication_required", message: "private session detail" },
    title: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    raw: "private session detail",
    login: true
  });
  await expectFieldFailure(browser, {
    response: { status: 404, code: "not_found", message: "private tenant detail" },
    title: "ไม่พบแปลงหรือคุณไม่มีสิทธิ์เข้าถึง",
    raw: "private tenant detail"
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = await mockFieldWorkspace(page, {
    fieldResponse: (call) => call === 1
      ? { status: 503, code: "unavailable", message: "private field service detail" }
      : field
  });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "โหลดข้อมูลแปลงไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByText("private field service detail")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);
  expect(calls.field).toBe(1);
  await page.getByRole("button", { name: "ลองโหลดอีกครั้ง" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(field.name);
  expect(calls.field).toBe(2);
  await context.close();
});

test("principal A content is purged before principal B receives a safe field denial", async ({ page }) => {
  const fieldPageSource = await readFile("apps/web/app/fields/[id]/page.tsx", "utf8");
  const purgeRootBlock = fieldPageSource.match(/const TENANT_QUERY_ROOTS = new Set\(\[([\s\S]*?)\]\);/)?.[1];
  expect(purgeRootBlock?.match(/"[^"]+"/g)?.map((root) => root.slice(1, -1))).toEqual([
    "current-user",
    "farms",
    "farm",
    "fields",
    "field",
    "organizations",
    "organization-members",
    "satellite-latest"
  ]);
  let phase: "a" | "terminal" | "b" = "a";
  let releaseTerminalIdentity: (() => void) | undefined;
  const terminalIdentityGate = new Promise<void>((resolve) => {
    releaseTerminalIdentity = resolve;
  });
  const calls = { identityA: 0, identityTerminal: 0, identityB: 0, fieldA: 0, fieldB: 0, satelliteA: 0, satelliteB: 0 };

  await page.route("https://tiles.openfreemap.org/**", (route) =>
    json(route, { version: 8, sources: {}, layers: [] })
  );
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/auth/csrf") return json(route, { csrf_token: "csrf-transition" });
    if (path === "/api/v1/auth/refresh") {
      return apiError(route, { status: 401, code: "invalid_refresh_token", message: "private refresh detail" });
    }
    if (path === "/api/v1/auth/login") return route.fulfill({ status: 204, body: "" });
    if (path === "/api/v1/auth/me") {
      if (phase === "terminal") {
        calls.identityTerminal += 1;
        await terminalIdentityGate;
        return apiError(route, { status: 401, code: "authentication_required", message: "private session detail" });
      }
      if (phase === "b") {
        calls.identityB += 1;
        return json(route, userB);
      }
      calls.identityA += 1;
      return json(route, user);
    }
    if (path === `/api/v1/fields/${field.id}`) {
      if (phase === "b") {
        calls.fieldB += 1;
        return apiError(route, { status: 404, code: "not_found", message: "private tenant B detail" });
      }
      calls.fieldA += 1;
      return json(route, field);
    }
    if (path === `/api/v1/fields/${field.id}/satellite/latest`) {
      if (phase === "b") calls.satelliteB += 1;
      else calls.satelliteA += 1;
      return json(route, notSearched);
    }
    if (path === "/api/v1/farms" || path === "/api/v1/organizations") return json(route, []);
    return apiError(route, { status: 404, code: "not_found", message: "Not found" });
  });

  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(field.name);
  await expect(page.getByText("พื้นที่คำนวณโดยเซิร์ฟเวอร์").locator("..")).toContainText("1.50 ไร่");
  await expect(page.getByLabel("Field map")).toBeVisible();
  await expect(page.getByText("ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้", { exact: true })).toBeVisible();
  expect(calls).toMatchObject({ fieldA: 1, satelliteA: 1 });
  await page.evaluate(() => {
    (window as typeof window & { __fieldWorkspaceContext?: string }).__fieldWorkspaceContext = "same-query-client";
  });

  phase = "terminal";
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("status").filter({ hasText: "กำลังตรวจสอบบัญชี..." })).toBeVisible();
  await expect(page.getByText(field.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText("1.50 ไร่", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);

  releaseTerminalIdentity?.();
  await expect(page.getByRole("alert").filter({ hasText: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByText(field.name, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);

  await page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" }).click();
  phase = "b";
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.getByLabel("อีเมล").fill(userB.email);
  await page.getByLabel("รหัสผ่าน").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).last().click();
  await expect(page).toHaveURL(/\/farms$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/fields/${field.id}$`));
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __fieldWorkspaceContext?: string }
  ).__fieldWorkspaceContext)).toBe("same-query-client");
  await expect(page.getByRole("alert").filter({ hasText: "ไม่พบแปลงหรือคุณไม่มีสิทธิ์เข้าถึง" })).toBeVisible();
  await expect(page.getByText("private tenant B detail")).toHaveCount(0);
  await expect(page.getByText(field.name, { exact: true })).toHaveCount(0);
  await expect(page.getByText("1.50 ไร่", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);
  expect(calls.fieldB).toBe(1);
  expect(calls.satelliteB).toBe(0);
});

test("satellite result states remain distinct and latest never retries automatically", async ({ browser }) => {
  const available = {
    field_id: field.id,
    status: "available",
    acquisition: {
      provider: "copernicus_dataspace",
      collection: "sentinel-2-l2a",
      item_id: "S2B_SAFE_ITEM",
      acquired_at: "2026-08-20T03:00:00Z",
      cloud_cover_percent: 12.5
    },
    searched_at: "2026-08-22T05:00:00Z",
    message_th: "พบข้อมูลประกอบภาพล่าสุด"
  };
  const cases = [
    { response: available, copy: "พบภาพล่าสุด" },
    {
      response: { field_id: field.id, status: "no_data", acquisition: null, searched_at: "2026-08-22T05:00:00Z", message_th: "ไม่พบข้อมูล" },
      copy: "ยังไม่พบภาพ Sentinel-2 ที่ตรงกับเงื่อนไขในช่วงเวลาที่ค้นหา"
    },
    {
      response: { field_id: field.id, status: "temporarily_unavailable", acquisition: null, searched_at: "2026-08-22T05:00:00Z", message_th: "private provider detail" },
      copy: "ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง"
    },
    {
      response: { status: 503, code: "unavailable", message: "private latest detail" },
      copy: "ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง"
    }
  ] as const;

  for (const item of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const calls = await mockFieldWorkspace(page, { latestResponse: item.response });
    await page.goto(`/fields/${field.id}`);
    await expect(page.getByText(item.copy, { exact: true })).toBeVisible();
    await expect(page.getByText(/private provider detail|private latest detail/)).toHaveCount(0);
    await expect.poll(() => calls.latest).toBe(1);
    await page.waitForTimeout(250);
    expect(calls.latest).toBe(1);
    await context.close();
  }
});

test("satellite search errors are safe, bounded, and only retry on another user action", async ({ page }) => {
  const calls = await mockFieldWorkspace(page, {
    searchResponse: (call) => call === 1
      ? { status: 503, code: "unavailable", message: "private search detail" }
      : {
          field_id: field.id,
          status: "no_data",
          acquisition: null,
          searched_at: "2026-08-22T05:00:00Z",
          message_th: "ไม่พบข้อมูล"
        }
  });
  await page.goto(`/fields/${field.id}`);
  const search = page.getByRole("button", { name: "ตรวจสอบภาพดาวเทียมล่าสุด" });
  await search.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง" })
  ).toHaveText("ยังไม่สามารถตรวจสอบข้อมูลดาวเทียมได้ กรุณาลองใหม่ภายหลัง");
  await expect(page.getByText("private search detail")).toHaveCount(0);
  expect(calls.search).toBe(1);
  await page.waitForTimeout(250);
  expect(calls.search).toBe(1);

  await search.click();
  await expect(page.getByText("ยังไม่พบภาพ Sentinel-2 ที่ตรงกับเงื่อนไขในช่วงเวลาที่ค้นหา")).toBeVisible();
  expect(calls.search).toBe(2);
  expect(calls.csrf).toBe(1);
});

test("satellite rate limiting has dedicated safe copy and one request per user action", async ({ page }) => {
  const calls = await mockFieldWorkspace(page, {
    searchResponse: { status: 429, code: "rate_limited", message: "private quota detail" }
  });
  await page.goto(`/fields/${field.id}`);
  await page.getByRole("button", { name: "ตรวจสอบภาพดาวเทียมล่าสุด" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "มีคำขอตรวจสอบข้อมูลดาวเทียมมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง" })
  ).toHaveText("มีคำขอตรวจสอบข้อมูลดาวเทียมมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง");
  await expect(page.getByText("private quota detail")).toHaveCount(0);
  expect(calls.search).toBe(1);
  expect(calls.latest).toBe(1);
});

async function expectFieldFailure(
  browser: Browser,
  options: { response: ErrorResponse; title: string; raw: string; login?: boolean }
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = await mockFieldWorkspace(page, { fieldResponse: options.response });
  await page.goto(`/fields/${field.id}`);
  await expect(page.getByRole("alert").filter({ hasText: options.title })).toBeVisible();
  await expect(page.getByText(options.raw)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" })).toHaveCount(options.login ? 1 : 0);
  expect(calls.field).toBe(1);
  await context.close();
}
