import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "viewer@example.com",
  display_name: "ผู้ใช้งานทดสอบ"
};
const organization = {
  id: "00000000-0000-0000-0000-000000000010",
  name: "องค์กรทดสอบ",
  slug: "review-org",
  status: "active"
};
const farm = {
  id: "00000000-0000-0000-0000-000000000020",
  organization_id: organization.id,
  name: "ฟาร์มตัวอย่าง",
  province: "เชียงใหม่",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
};
const fields = [
  {
    id: "00000000-0000-0000-0000-000000000031",
    farm_id: farm.id,
    organization_id: organization.id,
    name: "แปลงข้าวเหนียวอินทรีย์ชื่อยาวสำหรับตรวจสอบการตัดบรรทัดบนหน้าจอขนาดเล็ก",
    geometry: {
      type: "Polygon",
      coordinates: [[[98.981, 18.791], [98.991, 18.791], [98.991, 18.801], [98.981, 18.791]]]
    },
    area_sqm: "1200",
    area_rai: "0.75",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  },
  {
    id: "00000000-0000-0000-0000-000000000032",
    farm_id: farm.id,
    organization_id: organization.id,
    name: '<img src="https://fixture.invalid/pixel" onerror="alert(1)">',
    geometry: {
      type: "Polygon",
      coordinates: [[[99.001, 18.811], [99.011, 18.811], [99.011, 18.821], [99.001, 18.811]]]
    },
    area_sqm: "2400",
    area_rai: "1.50",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  },
  {
    id: "00000000-0000-0000-0000-000000000033",
    farm_id: farm.id,
    organization_id: organization.id,
    name: "แปลงลำดับที่สาม",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [99.021, 18.831],
        [99.031, 18.831],
        [99.036, 18.836],
        [99.031, 18.841],
        [99.021, 18.841],
        [99.021, 18.831]
      ]]
    },
    area_sqm: "4000",
    area_rai: "2.50",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  }
] as const;

type MockOptions = {
  returnedFields?: readonly (typeof fields)[number][];
  role?: "viewer" | "field_manager";
  fieldsGate?: Promise<void>;
  permissionGate?: Promise<void>;
  fieldsError?: boolean;
  permissionError?: boolean;
  farmError?: boolean;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockFarmDetail(page: Page, options: MockOptions = {}) {
  const satelliteRequests: string[] = [];
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    json(route, { version: 8, sources: {}, layers: [] })
  );
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, [organization]);
    if (path === `/api/v1/organizations/${organization.id}/members`) {
      if (options.permissionGate) await options.permissionGate;
      if (options.permissionError) {
        return json(route, { error: { code: "unavailable", message: "private membership detail" } }, 503);
      }
      return json(route, [{ id: "membership-1", user_id: user.id, role: options.role ?? "viewer", status: "active" }]);
    }
    if (path === `/api/v1/farms/${farm.id}`) {
      if (options.farmError) return json(route, { error: { code: "not_found", message: "private farm detail" } }, 404);
      return json(route, farm);
    }
    if (path === `/api/v1/farms/${farm.id}/fields`) {
      if (options.fieldsGate) await options.fieldsGate;
      if (options.fieldsError) {
        return json(route, { error: { code: "unavailable", message: "private field detail" } }, 503);
      }
      return json(route, options.returnedFields ?? fields);
    }
    if (/^\/api\/v1\/fields\/[^/]+\/satellite\/latest$/.test(path)) {
      satelliteRequests.push(path);
      const fieldId = path.split("/")[4];
      return json(route, {
        field_id: fieldId,
        status: "not_searched",
        acquisition: null,
        searched_at: null,
        message_th: "ยังไม่มีผลการค้นหาดาวเทียมที่บันทึกไว้"
      });
    }
    return json(route, { error: { code: "not_found", message: "Not found" } }, 404);
  });
  return satelliteRequests;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

test("renders all fields in API order and one selection drives every field surface", async ({ page }) => {
  const fixtureRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("fixture.invalid")) fixtureRequests.push(request.url());
  });
  const satelliteRequests = await mockFarmDetail(page, { role: "field_manager" });

  await page.goto(`/farms/${farm.id}`);
  const collection = page.getByRole("list", { name: "แปลงที่บันทึกไว้" });
  const fieldNames = collection.locator("button > span:first-child");
  await expect(fieldNames).toHaveText(fields.map((field) => field.name));
  for (const field of fields) await expect(fieldNames.filter({ hasText: field.name })).toHaveCount(1);
  const items = collection.getByRole("listitem");
  for (const [index, field] of fields.entries()) {
    await expect(items.nth(index).getByRole("link", { name: `เปิดพื้นที่ทำงานของ ${field.name}` })).toHaveAttribute(
      "href",
      `/fields/${field.id}`
    );
  }

  const first = collection.getByRole("button", { name: fields[0].name, exact: false });
  const third = collection.getByRole("button", { name: fields[2].name, exact: false });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(third).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("แปลงที่เลือก").locator("..")).toContainText(fields[0].name);
  await expect(page.getByText("พื้นที่คำนวณโดยเซิร์ฟเวอร์").locator("..")).toContainText("0.75 ไร่");
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-vertex-count", "3");
  await expect.poll(() => satelliteRequests).toContain(`/api/v1/fields/${fields[0].id}/satellite/latest`);

  await third.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(third).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("แปลงที่เลือก").locator("..")).toContainText(fields[2].name);
  await expect(page.getByText("พื้นที่คำนวณโดยเซิร์ฟเวอร์").locator("..")).toContainText("4000 ตร.ม. / 2.50 ไร่");
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-vertex-count", "5");
  await expect.poll(() => satelliteRequests).toContain(`/api/v1/fields/${fields[2].id}/satellite/latest`);

  const second = collection.getByRole("button", { name: fields[1].name, exact: false });
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("แปลงที่เลือก").locator("..")).toContainText(fields[1].name);

  const target = await third.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("img[src*='fixture.invalid']")).toHaveCount(0);
  expect(fixtureRequests).toEqual([]);

  const visibleText = await page.locator("body").innerText();
  for (const field of fields) expect(visibleText).not.toContain(field.id);
  expect(visibleText).not.toMatch(/98\.981|99\.036/);
  expect(visibleText).not.toMatch(/วินิจฉัย|โรคพืช|ศัตรูพืช|ขาดธาตุ|น้ำท่วม|ความเสี่ยง|คำแนะนำสารเคมี/);

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

test("field loading and API failure stay distinct from an empty response", async ({ page }) => {
  let releaseFields: (() => void) | undefined;
  const fieldsGate = new Promise<void>((resolve) => {
    releaseFields = resolve;
  });
  await mockFarmDetail(page, { fieldsGate });
  await page.goto(`/farms/${farm.id}`);

  await expect(page.getByRole("status").filter({ hasText: "กำลังโหลดแปลงที่บันทึกไว้..." })).toBeVisible();
  await expect(page.getByRole("list", { name: "แปลงที่บันทึกไว้" })).toHaveCount(0);
  await expect(page.getByText("ยังไม่มีขอบเขตแปลงที่บันทึกไว้")).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);
  releaseFields?.();
  await expect(page.getByRole("list", { name: "แปลงที่บันทึกไว้" })).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await mockFarmDetail(page, { fieldsError: true });
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "โหลดข้อมูลแปลงไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByText("private field detail")).toHaveCount(0);
  await expect(page.getByText("ยังไม่มีขอบเขตแปลงที่บันทึกไว้")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "แปลงที่บันทึกไว้" })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByText("ภาพดาวเทียมล่าสุด")).toHaveCount(0);
});

test("successful empty state keeps manager and viewer actions role-gated", async ({ browser }) => {
  for (const role of ["viewer", "field_manager"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockFarmDetail(page, { returnedFields: [], role });
    await page.goto(`/farms/${farm.id}`);
    await expect(page.getByText("ยังไม่มีขอบเขตแปลงที่บันทึกไว้")).toBeVisible();
    await expect(page.getByText("กำลังโหลดแปลงที่บันทึกไว้...")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "แปลงที่บันทึกไว้" })).toHaveCount(0);
    const expected = role === "field_manager" ? 1 : 0;
    await expect(page.getByRole("link", { name: "เพิ่มแปลง", exact: true })).toHaveCount(expected);
    await expect(page.getByRole("link", { name: "เพิ่มแปลงแรก", exact: true })).toHaveCount(expected);
    await context.close();
  }
});

test("permission pending and failure keep fields readable while create controls fail closed", async ({ page }) => {
  let releasePermission: (() => void) | undefined;
  const permissionGate = new Promise<void>((resolve) => {
    releasePermission = resolve;
  });
  await mockFarmDetail(page, { permissionGate, role: "field_manager" });
  await page.goto(`/farms/${farm.id}`);

  await expect(page.getByRole("list", { name: "แปลงที่บันทึกไว้" })).toBeVisible();
  await expect(page.getByRole("link", { name: "เพิ่มแปลง", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "เพิ่มแปลงแรก", exact: true })).toHaveCount(0);
  releasePermission?.();
  await expect(page.getByRole("link", { name: "เพิ่มแปลง", exact: true })).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await mockFarmDetail(page, { permissionError: true });
  await page.reload();
  await expect(page.getByRole("list", { name: "แปลงที่บันทึกไว้" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "ตรวจสอบสิทธิ์การจัดการไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByText("private membership detail")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "เพิ่มแปลง", exact: true })).toHaveCount(0);
  await expect(page.getByText(fields[0].name).first()).toBeVisible();
});

test("farm failure is safe and remains distinct from field state", async ({ page }) => {
  await mockFarmDetail(page, { farmError: true, returnedFields: [] });
  await page.goto(`/farms/${farm.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "ไม่พบฟาร์มหรือคุณไม่มีสิทธิ์เข้าถึง" })).toBeVisible();
  await expect(page.getByText("private farm detail")).toHaveCount(0);
  await expect(page.getByText("ยังไม่มีขอบเขตแปลงที่บันทึกไว้")).toHaveCount(0);
});
