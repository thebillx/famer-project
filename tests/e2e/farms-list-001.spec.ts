import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  id: "10000000-0000-0000-0000-000000000001",
  email: "farms@example.com",
  display_name: "ผู้ใช้ฟาร์ม"
};
const userB = {
  id: "10000000-0000-0000-0000-000000000002",
  email: "farms-b@example.com",
  display_name: "ผู้ใช้ฟาร์ม บี"
};
const organizations = [
  { id: "20000000-0000-0000-0000-000000000001", name: "สหกรณ์แม่ริม", slug: "mae-rim", status: "active" },
  { id: "20000000-0000-0000-0000-000000000002", name: "กลุ่มเกษตรเหนือ", slug: "north", status: "active" }
];
const farms = [
  {
    id: "30000000-0000-0000-0000-000000000001",
    organization_id: organizations[0].id,
    name: "สวนลำไยแม่ริม",
    province: "เชียงใหม่",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-20T05:00:00Z"
  },
  {
    id: "30000000-0000-0000-0000-000000000002",
    organization_id: "20000000-0000-0000-0000-000000000099",
    name: "<img src=x onerror=fetch('https://example.invalid')>",
    province: null,
    status: "active",
    created_at: "2026-08-02T00:00:00Z",
    updated_at: "2026-08-21T05:00:00Z"
  }
];
const farmB = {
  id: "30000000-0000-0000-0000-000000000099",
  organization_id: "20000000-0000-0000-0000-000000000099",
  name: "สวนของผู้ใช้บี",
  province: "ลำพูน",
  status: "active",
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-22T05:00:00Z"
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

type WorkspaceMock = {
  role?: string;
  farmResponse?: unknown;
  farmStatus?: number;
  organizationsResponse?: typeof organizations;
  delayMembership?: Promise<void>;
  delayFarms?: Promise<void>;
  membershipFailure?: boolean;
  memberStatus?: string;
};

async function mockWorkspace(page: Page, options: WorkspaceMock = {}) {
  const counts = new Map<string, number>();
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    counts.set(path, (counts.get(path) ?? 0) + 1);
    expect(request.method()).toBe("GET");

    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") {
      return json(route, options.organizationsResponse ?? organizations);
    }
    if (path.endsWith("/members")) {
      await options.delayMembership;
      if (options.membershipFailure) {
        return json(route, { error: { code: "unavailable", message: "Permission unavailable" } }, 503);
      }
      return json(route, [{
        id: "40000000-0000-0000-0000-000000000001",
        user_id: user.id,
        role: options.role ?? "organization_owner",
        status: options.memberStatus ?? "active"
      }]);
    }
    if (path === "/api/v1/farms") {
      await options.delayFarms;
      return json(
        route,
        options.farmResponse ?? farms,
        options.farmStatus ?? 200
      );
    }
    return json(route, { error: { code: "unexpected", message: "Unexpected request" } }, 500);
  });
  return counts;
}

test("manager sees truthful Thai farm data in response order without fabricated content", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["http://localhost:3000", "http://localhost:8000"].includes(url.origin)) {
      externalRequests.push(request.url());
    }
  });
  const counts = await mockWorkspace(page);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/farms");

  await expect(page.getByRole("heading", { level: 1, name: "ฟาร์มของคุณ" })).toBeVisible();
  await expect(page.getByText("ฟาร์มที่เข้าถึงได้ 2 แห่ง")).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม" })).toHaveAttribute("href", "/farms/new");
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(page.getByRole("list", { name: "รายการฟาร์มที่เข้าถึงได้" })).not.toBeVisible();
  const rowNames = await table.getByRole("rowheader").allTextContents();
  expect(rowNames).toEqual(farms.map((farm) => farm.name));
  await expect(table.getByText("ยังไม่ได้ระบุ")).toBeVisible();
  await expect(table.getByText(organizations[0].name)).toBeVisible();
  await expect(table.getByText("ยังไม่พบชื่อองค์กร")).toBeVisible();
  await expect(table.locator("img")).toHaveCount(0);
  await expect(table.getByRole("link", { name: farms[0].name })).toHaveAttribute("href", `/farms/${farms[0].id}`);
  await expect(table.getByRole("link", { name: farms[1].name })).toHaveAttribute("href", `/farms/${farms[1].id}`);

  expect(counts.get("/api/v1/auth/me")).toBe(1);
  expect(counts.get("/api/v1/organizations")).toBe(1);
  expect(counts.get("/api/v1/farms")).toBe(1);
  expect([...counts.keys()].filter((path) => path.endsWith("/members"))).toHaveLength(2);
  expect(externalRequests).toEqual([]);
});

test("mobile uses one visible card collection with minimum-size open actions", async ({ page }) => {
  await mockWorkspace(page, { role: "viewer" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/farms");

  await expect(page.getByRole("table")).not.toBeVisible();
  const cards = page.getByRole("list", { name: "รายการฟาร์มที่เข้าถึงได้" });
  await expect(cards).toBeVisible();
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("สิทธิ์สำหรับการดูข้อมูล")).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม" })).toHaveCount(0);
  for (const action of await cards.getByRole("link", { name: "เปิดฟาร์ม" }).all()) {
    const size = await action.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole("table")).not.toBeVisible();
  await expect(cards).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole("table")).toBeVisible();
  await expect(cards).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("initial farm loading withholds every create action", async ({ page }) => {
  let releaseFarms: (() => void) | undefined;
  const farmsReleased = new Promise<void>((resolve) => {
    releaseFarms = resolve;
  });
  await mockWorkspace(page, { delayFarms: farmsReleased });
  await page.goto("/farms");

  await expect(page.getByRole("status").filter({ hasText: "กำลังโหลดรายการฟาร์ม…" })).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "สร้างฟาร์มแรก", exact: true })).toHaveCount(0);

  releaseFarms?.();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม", exact: true })).toBeVisible();
});

test("farm data stays readable while permission is pending and create stays hidden", async ({ page }) => {
  let releaseMembership: (() => void) | undefined;
  const membershipReleased = new Promise<void>((resolve) => {
    releaseMembership = resolve;
  });
  await mockWorkspace(page, { delayMembership: membershipReleased });
  await page.goto("/farms");

  await expect(page.getByText(farms[0].name).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "กำลังตรวจสอบสิทธิ์การสร้างฟาร์ม…" })).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม" })).toHaveCount(0);
  releaseMembership?.();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม" })).toBeVisible();
});

test("permission failure keeps farms readable and fails closed", async ({ page }) => {
  await mockWorkspace(page, { membershipFailure: true });
  await page.goto("/farms");

  await expect(page.getByText(farms[0].name).first()).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "ยังตรวจสอบสิทธิ์การสร้างฟาร์มไม่ได้" })).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม" })).toHaveCount(0);
  await expect(page.getByText("สิทธิ์สำหรับการดูข้อมูล")).toHaveCount(0);
});

test("empty states distinguish manager, viewer, and no organization", async ({ page }) => {
  await mockWorkspace(page, { farmResponse: [], role: "organization_owner" });
  await page.goto("/farms");
  await expect(page.getByText("ยังไม่มีฟาร์ม", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "สร้างฟาร์ม", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "สร้างฟาร์มแรก", exact: true })).toHaveCount(1);

  await page.unrouteAll({ behavior: "wait" });
  await mockWorkspace(page, { farmResponse: [], role: "viewer" });
  await page.reload();
  await expect(page.getByText("ยังไม่มีฟาร์มที่เข้าถึงได้")).toBeVisible();
  await expect(page.getByRole("link", { name: /สร้างฟาร์ม/ })).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await mockWorkspace(page, { farmResponse: [], organizationsResponse: [] });
  await page.reload();
  await expect(page.getByText("บัญชีนี้ยังไม่มีพื้นที่ทำงานขององค์กร")).toBeVisible();
});

test("unknown and disabled memberships fail closed", async ({ page }) => {
  await mockWorkspace(page, { role: "future_admin" });
  await page.goto("/farms");
  await expect(page.getByText("สิทธิ์สำหรับการดูข้อมูล")).toBeVisible();
  await expect(page.getByRole("link", { name: /สร้างฟาร์ม/ })).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await mockWorkspace(page, { role: "organization_owner", memberStatus: "disabled" });
  await page.reload();
  await expect(page.getByText("สิทธิ์สำหรับการดูข้อมูล")).toBeVisible();
  await expect(page.getByRole("link", { name: /สร้างฟาร์ม/ })).toHaveCount(0);
});

test("cached empty data never becomes a false empty state after refresh failure", async ({ page }) => {
  let farmCalls = 0;
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, organizations);
    if (path.endsWith("/members")) {
      return json(route, [{ id: "member", user_id: user.id, role: "viewer", status: "active" }]);
    }
    if (path === "/api/v1/farms") {
      farmCalls += 1;
      return farmCalls === 1
        ? json(route, [])
        : json(route, { error: { code: "unavailable", message: "raw detail" } }, 503);
    }
    return json(route, {}, 404);
  });
  await page.goto("/farms");
  await expect(page.getByText("ยังไม่มีฟาร์มที่เข้าถึงได้")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("alert").filter({ hasText: "ยังยืนยันไม่ได้ว่ารายการฟาร์มว่างอยู่" })).toBeVisible();
  await expect(page.getByText("ฟาร์มที่เข้าถึงได้ 0 แห่ง")).toHaveCount(0);
  await expect(page.getByText("ยังไม่มีฟาร์มที่เข้าถึงได้")).toHaveCount(0);
  await expect(page.getByText("raw detail")).toHaveCount(0);
  expect(farmCalls).toBe(2);
});

test("terminal auth error takes precedence over earlier permission noise", async ({ page }) => {
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, organizations);
    if (path === `/api/v1/organizations/${organizations[0].id}/members`) {
      return json(route, { error: { code: "unavailable", message: "Permission unavailable" } }, 503);
    }
    if (path === `/api/v1/organizations/${organizations[1].id}/members`) {
      return json(route, { error: { code: "authentication_required", message: "Authentication required" } }, 401);
    }
    if (path === "/api/v1/auth/csrf") return json(route, { csrf_token: "csrf-mixed-fixture" });
    if (path === "/api/v1/auth/refresh") {
      return json(route, { error: { code: "invalid_refresh_token", message: "Invalid refresh" } }, 401);
    }
    if (path === "/api/v1/farms") return json(route, farms);
    return json(route, {}, 404);
  });
  await page.goto("/farms");

  await expect(page.getByRole("alert").filter({ hasText: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByText(farms[0].name)).toHaveCount(0);
  await expect(page.getByText("ยังตรวจสอบสิทธิ์การสร้างฟาร์มไม่ได้")).toHaveCount(0);
});

test("429 is not retried automatically and explicit retry can recover", async ({ page }) => {
  let farmCalls = 0;
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, organizations);
    if (path.endsWith("/members")) {
      return json(route, [{ id: "member", user_id: user.id, role: "viewer", status: "active" }]);
    }
    if (path === "/api/v1/farms") {
      farmCalls += 1;
      if (farmCalls === 1) {
        return json(route, { error: { code: "rate_limited", message: "raw detail" } }, 429);
      }
      return json(route, farms);
    }
    return json(route, {}, 404);
  });
  await page.goto("/farms");

  await expect(page.getByRole("alert").filter({ hasText: "มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง" })).toBeVisible();
  expect(farmCalls).toBe(1);
  await expect(page.getByText("raw detail")).toHaveCount(0);
  await page.getByRole("button", { name: "ลองโหลดอีกครั้ง" }).click();
  await expect(page.getByText(farms[0].name).first()).toBeVisible();
  expect(farmCalls).toBe(2);
});

for (const scenario of [
  { name: "403", status: 403, title: "บัญชีนี้ไม่มีสิทธิ์เปิดรายการฟาร์ม" },
  { name: "404", status: 404, title: "ไม่พบรายการที่มองเห็นได้" },
  { name: "422", status: 422, title: "ไม่พบรายการที่มองเห็นได้" },
  { name: "5xx", status: 503, title: "โหลดรายการฟาร์มไม่สำเร็จ" }
]) {
  test(`${scenario.name} farm failures are typed and never retried automatically`, async ({ page }) => {
    const counts = await mockWorkspace(page, {
      farmResponse: { error: { code: "fixture_error", message: "raw detail" } },
      farmStatus: scenario.status
    });
    await page.goto("/farms");

    await expect(page.getByRole("alert").filter({ hasText: scenario.title })).toBeVisible();
    await expect(page.getByText("raw detail")).toHaveCount(0);
    await expect(page.getByText("ยังไม่มีฟาร์ม", { exact: true })).toHaveCount(0);
    expect(counts.get("/api/v1/farms")).toBe(1);
  });
}

test("network failure is explicit and never retried automatically", async ({ page }) => {
  let farmCalls = 0;
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") return json(route, user);
    if (path === "/api/v1/organizations") return json(route, organizations);
    if (path.endsWith("/members")) {
      return json(route, [{ id: "member", user_id: user.id, role: "viewer", status: "active" }]);
    }
    if (path === "/api/v1/farms") {
      farmCalls += 1;
      return route.abort("connectionfailed");
    }
    return json(route, {}, 404);
  });
  await page.goto("/farms");

  await expect(page.getByRole("alert").filter({ hasText: "โหลดรายการฟาร์มไม่สำเร็จ" })).toBeVisible();
  expect(farmCalls).toBe(1);
});

test("tenant query purge covers every existing authenticated query root", async () => {
  const source = await readFile("apps/web/app/farms/page.tsx", "utf8");
  for (const root of [
    "current-user",
    "farms",
    "farm",
    "fields",
    "organizations",
    "organization-members",
    "satellite-latest"
  ]) {
    expect(source).toContain(`"${root}"`);
  }
});

test("principal A content is suppressed at terminal auth and never reappears for principal B", async ({ page }) => {
  let phase: "a" | "terminal" | "b" = "a";
  const paths: string[] = [];
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    paths.push(`${request.method()} ${path}`);

    if (path === "/api/v1/auth/csrf") return json(route, { csrf_token: "csrf-transition-fixture" });
    if (path === "/api/v1/auth/refresh") {
      return json(route, { error: { code: "invalid_refresh_token", message: "Invalid refresh" } }, 401);
    }
    if (path === "/api/v1/auth/login") return route.fulfill({ status: 204, body: "" });
    if (path === "/api/v1/auth/me") {
      if (phase === "terminal") {
        return json(route, { error: { code: "authentication_required", message: "Authentication required" } }, 401);
      }
      return json(route, phase === "a" ? user : userB);
    }
    if (path === "/api/v1/organizations") {
      return json(route, phase === "a" ? [organizations[0]] : [{ ...organizations[0], id: farmB.organization_id, name: "องค์กรบี" }]);
    }
    if (path.endsWith("/members")) {
      const activeUser = phase === "a" ? user : userB;
      return json(route, [{ id: "member", user_id: activeUser.id, role: "viewer", status: "active" }]);
    }
    if (path === "/api/v1/farms") return json(route, phase === "a" ? [farms[0]] : [farmB]);
    return json(route, {}, 404);
  });

  await page.goto("/farms");
  await expect(page.getByText(farms[0].name).first()).toBeVisible();

  phase = "terminal";
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("alert").filter({ hasText: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByText(farms[0].name)).toHaveCount(0);

  await page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" }).click();
  phase = "b";
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.getByLabel("อีเมล").fill(userB.email);
  await page.getByLabel("รหัสผ่าน").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).last().click();

  await expect(page.getByText(farmB.name).first()).toBeVisible();
  await expect(page.getByText(farms[0].name)).toHaveCount(0);
  expect(paths.filter((path) => path === "POST /api/v1/auth/login")).toHaveLength(1);
});

test("terminal authentication failure hides tenant content and offers login", async ({ page }) => {
  const paths: string[] = [];
  await page.route("http://localhost:8000/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    paths.push(path);
    if (path === "/api/v1/auth/me") {
      return json(route, { error: { code: "authentication_required", message: "Authentication required" } }, 401);
    }
    if (path === "/api/v1/auth/csrf") return json(route, { csrf_token: "csrf-auth-fixture" });
    if (path === "/api/v1/auth/refresh") {
      return json(route, { error: { code: "invalid_refresh_token", message: "Invalid refresh" } }, 401);
    }
    return json(route, { error: { code: "unexpected", message: "Unexpected request" } }, 500);
  });
  await page.goto("/farms");

  await expect(page.getByRole("alert").filter({ hasText: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ไปหน้าเข้าสู่ระบบ" })).toHaveAttribute("href", "/login");
  await expect(page.getByText(/สวนลำไยแม่ริม|สหกรณ์แม่ริม/)).toHaveCount(0);
  expect(paths).toEqual(["/api/v1/auth/me", "/api/v1/auth/csrf", "/api/v1/auth/refresh"]);
});
