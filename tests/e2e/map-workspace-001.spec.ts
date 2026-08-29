import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.test",
  display_name: "สมชาย"
} as const;

const organization = {
  id: "00000000-0000-0000-0000-000000000010",
  name: "องค์กรทดสอบ",
  slug: "test-org",
  status: "active"
} as const;

const farm = {
  id: "00000000-0000-0000-0000-000000000020",
  organization_id: organization.id,
  name: "สวนเหนือ",
  province: "เชียงใหม่",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
} as const;

const fields = [
  {
    id: "00000000-0000-0000-0000-000000000031",
    farm_id: farm.id,
    organization_id: organization.id,
    name: "A01",
    geometry: {
      type: "Polygon",
      coordinates: [[[98.98, 18.79], [98.985, 18.79], [98.986, 18.794], [98.98, 18.79]]]
    },
    area_sqm: "1900",
    area_rai: "1.19",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  },
  {
    id: "00000000-0000-0000-0000-000000000032",
    farm_id: farm.id,
    organization_id: organization.id,
    name: "A02",
    geometry: {
      type: "Polygon",
      coordinates: [[[98.99, 18.79], [98.998, 18.79], [99.0, 18.797], [98.992, 18.799], [98.99, 18.79]]]
    },
    area_sqm: "5440",
    area_rai: "3.40",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  }
] as const;

const latest = {
  field_id: fields[1].id,
  status: "available",
  acquisition: {
    provider: "cdse_stac",
    collection: "sentinel-2-l2a",
    item_id: "S2_TEST_CURRENT",
    acquired_at: "2026-08-22T03:00:00Z",
    cloud_cover_percent: 6
  },
  searched_at: "2026-08-22T05:00:00Z",
  message_th: "พบข้อมูลประกอบภาพล่าสุด"
} as const;


function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function captureVisual(page: Page, name: string) {
  const directory = process.env.MAP_VISUAL_ARTIFACT_DIR;
  if (!directory) return;
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

async function mockWorkspace(
  page: Page,
  options: {
    fieldsResponse?: unknown;
    latestResponse?: unknown;
    latestTerminal?: boolean;
    membershipTerminal?: boolean;
    styleDelayMs?: number;
    styleError?: boolean;
  } = {}
) {
  if (!process.env.MAP_VISUAL_REAL_TILES || options.styleDelayMs || options.styleError) {
    await page.route("https://tiles.openfreemap.org/**", async (route) => {
      if (options.styleDelayMs) await new Promise((resolve) => setTimeout(resolve, options.styleDelayMs));
      if (options.styleError) return json(route, { error: "style unavailable" }, 503);
      return json(route, { version: 8, sources: {}, layers: [] });
    });
  }
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === `/api/v1/farms/${farm.id}`) return json(route, farm);
    if (path === `/api/v1/farms/${farm.id}/fields`) return json(route, options.fieldsResponse ?? fields);
    if (path === `/api/v1/organizations/${organization.id}/members`) {
      if (options.membershipTerminal) {
        return json(route, { error: { code: "invalid_refresh_token", message: "expired" } }, 401);
      }
      return json(route, [{ id: "member-1", user_id: user.id, role: "organization_owner", status: "active" }]);
    }
    if (path.endsWith("/satellite/latest")) {
      if (options.latestTerminal) {
        return json(route, { error: { code: "invalid_refresh_token", message: "expired" } }, 401);
      }
      const fieldId = path.split("/")[4];
      return json(route, options.latestResponse ?? { ...latest, field_id: fieldId });
    }
    return json(route, { error: { code: "not_found", message: "not found" } }, 404);
  });
}

test("field selection synchronizes hierarchy, map, inspector, search, and keyboard states", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page);
  await page.goto(`/farms/${farm.id}`);

  await expect(page.getByRole("heading", { name: farm.name })).toBeVisible();
  await expect(page.getByRole("status", { name: `บัญชีที่กำลังใช้งาน ${user.display_name}` })).toBeVisible();
  await expect(page.getByRole("link", { name: /บัญชี/ })).toHaveCount(0);
  for (const label of ["สลับชื่อแปลงบนแผนที่", "ปรับมุมมองให้เห็นแปลงทั้งหมด", "ขยายแผนที่", "ย่อแผนที่"]) {
    const control = page.getByRole("button", { name: label });
    await expect(control).toBeVisible();
    await expect(control).toHaveJSProperty("type", "button");
    await expect.poll(async () => control.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);
    await expect.poll(async () => control.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await captureVisual(page, "workspace-overview");
  await page.getByRole("button", { name: "สลับชื่อแปลงบนแผนที่" }).press("Enter");
  await expect(page.getByRole("button", { name: "แสดงชื่อแปลงบนแผนที่" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "แสดงชื่อแปลงบนแผนที่" }).press("Enter");
  const a02 = page.getByRole("button", { name: /A02/ });
  await a02.click();
  await expect(a02).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-selected-field-id", fields[1].id);
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-selected-field-priority", "false");
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-map-layers-ready", "true");
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก").getByRole("heading", { name: "A02" })).toBeVisible();
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toContainText("3.40 ไร่");
  await expect(page.getByText("กำลังโหลดแผนที่...")).toHaveCount(0);
  const closeInspector = page.getByRole("button", { name: "ปิดรายละเอียดแปลง" });
  await expect.poll(async () => closeInspector.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);
  await expect.poll(async () => closeInspector.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await captureVisual(page, "workspace-a02");
  await closeInspector.click();
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toHaveCount(0);
  await expect(page.getByLabel("Field map")).not.toHaveAttribute("data-selected-field-id");

  await page.getByRole("button", { name: /A01/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-selected-field-id", fields[0].id);
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-selected-field-priority", "false");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await captureVisual(page, "workspace-a01");
  await page.getByPlaceholder("ค้นหาแปลง...").fill("A02");
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-visible-field-count", "1");
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await captureVisual(page, "workspace-search");
  await page.getByPlaceholder("ค้นหาแปลง...").fill("");
  await a02.click();

});

test("farm workspace keeps geometry visible when imagery data is unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page, {
    latestResponse: {
      field_id: fields[1].id,
      status: "no_data",
      acquisition: null,
      searched_at: "2026-08-22T05:00:00Z",
      message_th: "ไม่พบข้อมูล"
    }
  });
  await page.goto(`/farms/${farm.id}`);
  await page.getByRole("button", { name: /A02/ }).click();
  await expect(page.getByText("ข้อมูลยังไม่เพียงพอ")).toBeVisible();
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-selected-field-id", fields[1].id);
  await captureVisual(page, "workspace-unavailable");
});

test("empty farm keeps the map and one manager action", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page, { fieldsResponse: [] });
  await page.goto(`/farms/${farm.id}`);
  await expect(page.getByLabel("Field map")).toBeVisible();
  await expect(page.getByText("ยังไม่มีแปลงในฟาร์มนี้")).toBeVisible();
  await expect(page.getByRole("link", { name: "เพิ่มแปลง", exact: true })).toHaveCount(1);
  await captureVisual(page, "workspace-empty");
});

test("selected workspace keeps the map usable while inspector stacks at narrow widths", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`/farms/${farm.id}`);
  await page.getByRole("button", { name: /A02/ }).click();
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const map = document.querySelector<HTMLElement>("[aria-label='แผนที่ฟาร์มและแปลง']");
      const inspector = document.querySelector<HTMLElement>("[aria-label='รายละเอียดแปลงที่เลือก']");
      if (!map || !inspector) return null;
      const mapRect = map.getBoundingClientRect();
      const inspectorRect = inspector.getBoundingClientRect();
      return { mapWidth: mapRect.width, mapBottom: mapRect.bottom, inspectorTop: inspectorRect.top };
    });
    expect(geometry?.mapWidth).toBeGreaterThan(300);
    expect(geometry?.inspectorTop).toBeGreaterThanOrEqual((geometry?.mapBottom ?? 0) - 1);
  }
});

test("map selection opens the inspector and scrolls the matching field row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      const fieldButton = this.querySelector("button");
      if (fieldButton) {
        (window as typeof window & { __agriScrolledField?: string }).__agriScrolledField = fieldButton.textContent ?? "";
      }
      return original.call(this, options);
    };
  });
  await mockWorkspace(page);
  await page.goto(`/farms/${farm.id}`);
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-map-layers-ready", "true");
  await page.locator(".maplibregl-canvas").click({ position: { x: 820, y: 450 } });
  await expect(page.getByRole("button", { name: /A02/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __agriScrolledField?: string }).__agriScrolledField)).toContain("A02");
});

test("same-route farm switching clears the previous selection before new fields resolve", async ({ page }) => {
  const nextFarm = { ...farm, id: "00000000-0000-0000-0000-000000000021", name: "สวนใต้" };
  const nextField = {
    ...fields[0],
    id: "00000000-0000-0000-0000-000000000041",
    farm_id: nextFarm.id,
    name: "B01"
  };
  let releaseNextFields: (() => void) | undefined;
  const nextFieldsReleased = new Promise<void>((resolve) => {
    releaseNextFields = resolve;
  });

  await mockWorkspace(page);
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/v1/farms/${nextFarm.id}`) return json(route, nextFarm);
    if (path === `/api/v1/farms/${nextFarm.id}/fields`) {
      await nextFieldsReleased;
      return json(route, [nextField]);
    }
    return route.fallback();
  });
  await page.goto(`/farms/${farm.id}`);
  await page.getByRole("button", { name: /A02/ }).click();
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toContainText("A02");

  await page.evaluate((next) => {
    (globalThis as typeof globalThis & {
      next: { router: { push: (url: string) => void } };
    }).next.router.push(next);
  }, `/farms/${nextFarm.id}`);

  try {
    await expect(page).toHaveURL(`/farms/${nextFarm.id}`);
    await expect(page.getByRole("heading", { name: nextFarm.name })).toBeVisible();
    await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toHaveCount(0);
    await expect(page.getByText("A02", { exact: true })).toHaveCount(0);
  } finally {
    releaseNextFields?.();
  }
  await expect(page.getByRole("button", { name: /B01/ })).toBeVisible();
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toHaveCount(0);
});

test("terminal auth from farm imagery hides protected farm geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page, { latestTerminal: true });
  await page.goto(`/farms/${farm.id}`);
  await page.getByRole("button", { name: /A02/ }).click();

  await expect(page.getByRole("heading", { name: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByRole("status", { name: "บัญชีที่กำลังใช้งาน บัญชีของฉัน" })).toBeVisible();
  await expect(page.getByRole("status", { name: `บัญชีที่กำลังใช้งาน ${user.display_name}` })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toHaveCount(0);
});

test("terminal auth from membership permission hides protected farm geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page, { membershipTerminal: true });
  await page.goto(`/farms/${farm.id}`);

  await expect(page.getByRole("heading", { name: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByRole("status", { name: "บัญชีที่กำลังใช้งาน บัญชีของฉัน" })).toBeVisible();
  await expect(page.getByRole("status", { name: `บัญชีที่กำลังใช้งาน ${user.display_name}` })).toHaveCount(0);
  await expect(page.getByLabel("Field map")).toHaveCount(0);
  await expect(page.getByLabel("รายละเอียดแปลงที่เลือก")).toHaveCount(0);
});

test("map lifecycle keeps the latest selection and exposes style failure without a spinner", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockWorkspace(page, { styleDelayMs: 250 });
  await page.goto(`/farms/${farm.id}`);
  await page.getByRole("button", { name: /A02/ }).click();
  await expect(page.getByLabel("Field map")).toHaveAttribute("data-selected-field-id", fields[1].id);
  await expect(page.getByText("กำลังโหลดแผนที่...")).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await mockWorkspace(page, { styleError: true });
  await page.goto(`/farms/${farm.id}`);
  await expect(page.getByRole("heading", { name: "โหลดแผนที่พื้นฐานไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByText("กำลังโหลดแผนที่...")).toHaveCount(0);
});
