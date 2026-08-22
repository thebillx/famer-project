import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const LOGIN_FAILURE = "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง";
const CSRF_UI_FIXTURE = "csrf-ui-fixture";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "viewer@example.com",
  display_name: "Viewer"
};
const organization = {
  id: "00000000-0000-0000-0000-000000000010",
  name: "Review Org",
  slug: "review-org",
  status: "active"
};
const farm = {
  id: "00000000-0000-0000-0000-000000000020",
  organization_id: organization.id,
  name: "Review Farm",
  province: "Chiang Mai",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
};
const field = {
  id: "00000000-0000-0000-0000-000000000030",
  farm_id: farm.id,
  organization_id: organization.id,
  name: "Review Field",
  geometry: {
    type: "Polygon",
    coordinates: [[[98.98, 18.79], [98.99, 18.79], [98.99, 18.8], [98.98, 18.79]]]
  },
  area_sqm: "1200",
  area_rai: "0.75",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorkspace(page: Page, role = "viewer") {
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, [organization]);
    if (path === `/api/v1/organizations/${organization.id}/members`) {
      return json(route, [{ id: "membership-1", user_id: user.id, role, status: "active" }]);
    }
    if (path === "/api/v1/farms") return json(route, []);
    if (path === `/api/v1/farms/${farm.id}`) return json(route, farm);
    if (path === `/api/v1/farms/${farm.id}/fields`) return json(route, []);
    return json(route, { error: { code: "not_found", message: "Not found" } }, 404);
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

function parseRgb(value: string) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Could not parse RGB color: ${value}`);
  return channels;
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const [red, green, blue] = parseRgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function targetSize(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

test("global app colors are declared in the root token block", async () => {
  const source = await readFile("apps/web/app/globals.css", "utf8");
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rootTokenBlock = withoutComments.match(/:root\s*\{[^{}]*\}/);
  expect(rootTokenBlock, "expected a flat :root token block").not.toBeNull();

  const renderCss = withoutComments.replace(rootTokenBlock![0], "");
  const declarationValues = Array.from(
    renderCss.matchAll(/(?:^|[;{])\s*[\w-]+\s*:\s*([^;{}]+)/gm),
    (match) => match[1]
  );
  const rawColorPattern = /#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})(?![\da-f])|\b(?:rgb|hsl)a?\([^)]*\)/gi;
  const rawColors = declarationValues.flatMap((value) => value.match(rawColorPattern) ?? []);

  expect(rawColors).toEqual([]);
});

test("public auth frame is Thai-first, sample-safe, and separate from app navigation", async ({ page }) => {
  const offOriginRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://localhost:3000") offOriginRequests.push(request.url());
  });

  await page.goto("/login");

  await expect(page.getByRole("link", { name: "AgriScope Thailand หน้าหลัก" })).toHaveAttribute("href", "/");
  await expect(page.locator(".as-sidebar")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "ฟาร์ม", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "สร้างบัญชี AgriScope" })).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้างบัญชี" }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" }).first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("ข้อมูลตัวอย่าง", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "ภาพประกอบขอบเขตแปลงตัวอย่างบนพื้นผิวแผนที่" })).toBeVisible();
  await expect(page.locator("main .as-auth-layout > :first-child")).toHaveClass(/as-auth-form-panel/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 247, 239)");
  await expect(page.locator(".as-auth-modes")).toHaveCSS("background-color", "rgb(239, 238, 229)");
  await expect(page.locator(".as-auth-title")).toHaveCSS("font-size", "40px");
  await expect(page.locator(".as-auth-layout")).toHaveCSS("backdrop-filter", "none");
  const fontStack = await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontStack).toContain("Sukhumvit Set");
  expect(fontStack).toContain("Noto Sans Thai");

  const visibleCopy = await page.locator("body").innerText();
  expect(visibleCopy).not.toContain("12.4%");
  expect(visibleCopy).not.toMatch(/\b(?:Live|Ready|health|risk|alert|diagnosis|prescription)\b/i);
  expect(offOriginRequests).toEqual([]);
});

test("schema errors are inline, associated, and cleared when auth mode changes", async ({ page }) => {
  await page.goto("/login");
  await page.locator("form").getByRole("button", { name: "สร้างบัญชี" }).click();

  const email = page.getByRole("textbox", { name: "อีเมล", exact: true });
  const emailError = page.getByText("กรุณากรอกอีเมล", { exact: true });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(emailError).toBeVisible();
  const describedBy = await email.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy!.split(" ").at(-1)}`)).toHaveText("กรุณากรอกอีเมล");

  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "เข้าสู่ระบบ AgriScope" })).toBeVisible();
  await expect(emailError).toHaveCount(0);
  await expect(page.getByText("อีเมลที่ใช้สมัครบัญชี", { exact: true })).toBeVisible();
  await expect(page.getByText("กรอกรหัสผ่านของคุณ", { exact: true })).toBeVisible();
});

test("login pending state prevents duplicate submit and failure copy stays generic", async ({ page }) => {
  let csrfCalls = 0;
  let loginCalls = 0;
  const requestPaths: string[] = [];
  let releaseRequest: (() => void) | undefined;
  const requestReleased = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requestPaths.push(path);
    if (path === "/api/v1/auth/csrf") {
      expect(route.request().method()).toBe("GET");
      csrfCalls += 1;
      return json(route, { csrf_token: CSRF_UI_FIXTURE });
    }
    if (path !== "/api/v1/auth/login") {
      return json(route, { error: { code: "unexpected", message: "Unexpected request" } }, 500);
    }
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe(CSRF_UI_FIXTURE);
    loginCalls += 1;
    await requestReleased;
    return json(
      route,
      { error: { code: "invalid_credentials", message: "viewer@example.com does not exist" } },
      401
    );
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).first().click();
  await page.getByRole("textbox", { name: "อีเมล", exact: true }).fill("viewer@example.com");
  await page.getByRole("textbox", { name: "รหัสผ่าน", exact: true }).fill("StrongPassword123");
  const submit = page.locator("form button[type='submit']");
  expect(requestPaths).toEqual([]);
  expect(csrfCalls).toBe(0);
  expect(loginCalls).toBe(0);
  await submit.click();

  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("กำลังเข้าสู่ระบบ…", { exact: true })).toBeVisible();
  await expect.poll(() => csrfCalls).toBe(1);
  await expect.poll(() => loginCalls).toBe(1);
  await submit.click({ force: true });
  expect(csrfCalls).toBe(1);
  expect(loginCalls).toBe(1);

  releaseRequest?.();
  await expect(page.getByRole("alert").filter({ hasText: LOGIN_FAILURE })).toHaveText(LOGIN_FAILURE);
  await expect(page.getByText("viewer@example.com does not exist")).toHaveCount(0);
  expect(requestPaths).toEqual(["/api/v1/auth/csrf", "/api/v1/auth/login"]);

  await page.getByRole("button", { name: "สร้างบัญชี" }).first().click();
  await expect(page.getByText(LOGIN_FAILURE)).toHaveCount(0);
});

test("auth controls meet target sizes and expose two-tone focus contrast", async ({ page }) => {
  await page.goto("/login");

  const controls = [
    page.getByRole("link", { name: "AgriScope Thailand หน้าหลัก" }),
    page.getByRole("button", { name: "สร้างบัญชี" }).first(),
    page.getByRole("button", { name: "เข้าสู่ระบบ" }).first(),
    page.getByRole("textbox", { name: "อีเมล", exact: true }),
    page.locator("form").getByRole("button", { name: "สร้างบัญชี" })
  ];
  for (const control of controls) {
    const size = await targetSize(control);
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }

  const submit = page.locator("form").getByRole("button", { name: "สร้างบัญชี" });
  await submit.focus();
  const primaryFocus = await submit.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outline: style.outlineColor, background: style.backgroundColor, shadow: style.boxShadow };
  });
  expect(contrastRatio(primaryFocus.outline, primaryFocus.background)).toBeGreaterThanOrEqual(3);
  expect(primaryFocus.shadow).not.toBe("none");

  const email = page.getByRole("textbox", { name: "อีเมล", exact: true });
  await email.focus();
  const fieldFocus = await email.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      shadow: style.boxShadow,
      focusDark: root.getPropertyValue("--as-focus-dark").trim(),
      canvas: root.getPropertyValue("--as-bg").trim()
    };
  });
  expect(fieldFocus.shadow).not.toBe("none");
  const colors = await page.evaluate(([foreground, background]) => {
    const probe = document.createElement("span");
    probe.style.color = foreground;
    probe.style.backgroundColor = background;
    document.body.append(probe);
    const computed = getComputedStyle(probe);
    const result = [computed.color, computed.backgroundColor];
    probe.remove();
    return result;
  }, [fieldFocus.focusDark, fieldFocus.canvas]);
  expect(contrastRatio(colors[0], colors[1])).toBeGreaterThanOrEqual(3);
});

test("forced-colors keeps a visible system focus outline", async ({ browser }) => {
  const context = await browser.newContext({ forcedColors: "active" });
  const page = await context.newPage();
  await page.goto("/login");
  const email = page.getByRole("textbox", { name: "อีเมล", exact: true });
  await email.focus();

  const focus = await email.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  expect(focus.style).toBe("solid");
  expect(focus.width).toBeGreaterThanOrEqual(3);
  expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
  await context.close();
});

test("mobile app navigation is a non-modal disclosure with predictable dismissal", async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/farms");

  const toggle = page.locator(".as-menu-toggle");
  const toggleSize = await targetSize(toggle);
  expect(toggleSize.width).toBeGreaterThanOrEqual(44);
  expect(toggleSize.height).toBeGreaterThanOrEqual(44);
  await expect(toggle).toHaveAccessibleName("เปิดเมนูนำทาง");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", "app-navigation-panel");
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("ปิดเมนูนำทาง");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toBeVisible();
  await expect(page.locator("[aria-modal='true'], [role='dialog']")).toHaveCount(0);
  const farmsLink = page.getByRole("link", { name: "ฟาร์ม", exact: true });
  const farmsLinkSize = await targetSize(farmsLink);
  expect(farmsLinkSize.width).toBeGreaterThanOrEqual(44);
  expect(farmsLinkSize.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.getByRole("link", { name: "ฟาร์ม", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".as-sidebar")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("farms announces loading before the delayed collection resolves", async ({ page }) => {
  let releaseFarms: (() => void) | undefined;
  const farmsReleased = new Promise<void>((resolve) => {
    releaseFarms = resolve;
  });

  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, [organization]);
    if (path === `/api/v1/organizations/${organization.id}/members`) {
      return json(route, [{ id: "membership-1", user_id: user.id, role: "viewer", status: "active" }]);
    }
    if (path === "/api/v1/farms") {
      await farmsReleased;
      return json(route, [farm]);
    }
    return json(route, { error: { code: "not_found", message: "Not found" } }, 404);
  });

  await page.goto("/farms");
  const loadingStatus = page.getByRole("status").filter({ hasText: "กำลังโหลดรายการฟาร์ม…" });
  try {
    await expect(loadingStatus).toBeVisible();
    await expect(page.getByRole("link", { name: farm.name })).toHaveCount(0);
  } finally {
    releaseFarms?.();
  }

  await expect(loadingStatus).toHaveCount(0);
  await expect(page.getByRole("link", { name: farm.name })).toBeVisible();
});

test("authenticated shell is Thai-first with one primary nav and a working skip target", async ({ page }) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/farms");

  const skipLink = page.getByRole("link", { name: "ข้ามไปยังเนื้อหา" });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "ฟาร์ม", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /เข้าสู่ระบบ|สร้างบัญชี/ })).toHaveCount(0);
  await expect(page.locator(".as-sidebar")).toHaveCSS("width", "248px");
  await expectNoHorizontalOverflow(page);
});

test("reduced motion removes non-essential app transforms and transitions", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await mockWorkspace(page);
  await page.goto("/farms");
  await page.getByRole("button", { name: "เปิดเมนูนำทาง" }).click();

  const panelMotion = await page.locator(".as-sidebar").evaluate((element) => {
    const style = getComputedStyle(element);
    return { duration: style.transitionDuration, transform: style.transform };
  });
  expect(panelMotion.duration.split(",").every((value) => Number.parseFloat(value) <= 0.00001)).toBe(true);
  expect(panelMotion.transform).toBe("none");
  await context.close();
});

test("login and authenticated frames do not overflow the required viewport matrix", async ({ page }) => {
  await mockWorkspace(page);
  const viewports = [
    { width: 320, height: 800 },
    { width: 375, height: 812 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await expectNoHorizontalOverflow(page);
    await page.goto("/farms");
    await expectNoHorizontalOverflow(page);
  }
});

test("farm smoke routes retain active navigation and loading, permission, and error states", async ({ page }) => {
  await mockWorkspace(page, "viewer");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/farms");
  await expect(page.getByText("ยังไม่มีฟาร์มที่เข้าถึงได้")).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม" })).toHaveCount(0);
  await page.getByRole("button", { name: "เปิดเมนูนำทาง" }).click();
  await expect(page.getByRole("link", { name: "ฟาร์ม", exact: true })).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/farms/${farm.id}`);
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "ฟาร์ม", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No field boundary saved yet.")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.unrouteAll({ behavior: "wait" });
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, [organization]);
    if (path.endsWith("/members")) return json(route, []);
    if (path === "/api/v1/farms") {
      return json(route, { error: { code: "unavailable", message: "Farm service unavailable" } }, 503);
    }
    return json(route, []);
  });
  await page.goto("/farms");
  await expect(page.getByRole("alert").filter({ hasText: "โหลดรายการฟาร์มไม่สำเร็จ" })).toBeVisible();
  await expect(page.getByText("บริการรายการฟาร์มยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง")).toBeVisible();
  await expect(page.getByText("Farm service unavailable")).toHaveCount(0);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
});

test("field and satellite failures remain errors rather than empty states", async ({ page }) => {
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/v1/farms/${farm.id}`) return json(route, farm);
    if (path === `/api/v1/farms/${farm.id}/fields`) {
      return json(route, { error: { code: "unavailable", message: "Fields unavailable" } }, 503);
    }
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, [organization]);
    if (path.endsWith("/members")) {
      return json(route, [{ id: "membership-1", user_id: user.id, role: "organization_owner", status: "active" }]);
    }
    return json(route, { error: { code: "not_found", message: "Not found" } }, 404);
  });

  await page.goto(`/farms/${farm.id}`);
  await expect(page.getByText("Fields unavailable")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No field boundary saved yet.")).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/v1/farms/${farm.id}`) return json(route, farm);
    if (path === `/api/v1/farms/${farm.id}/fields`) return json(route, [field]);
    if (path === `/api/v1/fields/${field.id}/satellite/latest`) {
      return json(route, { error: { code: "unavailable", message: "Satellite unavailable" } }, 503);
    }
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, [organization]);
    if (path.endsWith("/members")) {
      return json(route, [{ id: "membership-1", user_id: user.id, role: "organization_owner", status: "active" }]);
    }
    return json(route, { error: { code: "not_found", message: "Not found" } }, 404);
  });

  await page.reload();
  await expect(page.getByText("Satellite unavailable")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ยังไม่มีการตรวจสอบภาพดาวเทียมล่าสุด")).toHaveCount(0);
});
