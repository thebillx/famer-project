import { expect, test } from "@playwright/test";

const shots = [0, 0.16, 0.34, 0.55, 0.78];

type Snapshot = {
  mode: string;
  p: number;
  shot: number;
  camera: number[];
  look: number[];
  drawCalls: number;
  triangles: number;
  starsVisible: boolean;
  earthOpacity: number;
  atmosphere: number;
};

async function snapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): Snapshot } }).__agriscope.snapshot());
}

async function seek(page: import("@playwright/test").Page, progress: number) {
  return page.evaluate((value) => (window as typeof window & { __agriscope: { seekCheckpoint(p: number): Snapshot } }).__agriscope.seekCheckpoint(value), progress);
}

async function waitForWebGL(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const state = (window as typeof window & { __agriscope?: { snapshot(): Snapshot } }).__agriscope?.snapshot();
    return state?.mode === "webgl" && document.querySelectorAll(".cinematic canvas").length === 1;
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
  test(`cinematic static fallback retains the legacy synthetic field demo at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const apiRequests: string[] = [];
    page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
    await page.goto("/");
    await expect(page.locator("#fallback")).toBeVisible();
    await expect(page.locator("#fallback")).toContainText("ข้อมูลเป็นตัวอย่างสาธิต");
    await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login");
    expect(apiRequests).toEqual([]);
    await page.getByRole("link", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login\?mode=login$/);
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ AgriScope", exact: true })).toBeVisible();
  });
}

test("cinematic landing exposes the five-shot journey and truthful handoff", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?qa=1");
  await waitForWebGL(page);
  await expect(page.locator("#rail button")).toHaveCount(5);
  await expect(page.locator(".chapter-anchor")).toHaveCount(5);
  await expect(page.locator(".chapter-anchor h2.sr-only")).toHaveCount(5);
  await expect(page.locator("header nav a")).toHaveCount(3);
  await expect.poll(() => page.locator("header nav a").evaluateAll((links) => links.map((link) => link.getAttribute("href")).sort())).toEqual(["#field", "#mission", "/login?mode=login"].sort());
  await expect(page.locator("#title")).toContainText("มองเห็นความเปลี่ยนแปลง");
  await expect(page.locator("#title")).toContainText("จากวงโคจรถึงแปลงจริง");
  const first = await seek(page, 0);
  expect(first.shot).toBe(1);
  for (const [index, progress] of shots.entries()) {
    const state = await seek(page, progress);
    expect(state.shot).toBe(index + 1);
    expect(state.drawCalls).toBeGreaterThan(5);
    expect(state.triangles).toBeGreaterThan(1000);
    expect(state.camera.every(Number.isFinite)).toBe(true);
    expect(state.look.every(Number.isFinite)).toBe(true);
    expect(state.starsVisible).toBe(true);
    expect(state.earthOpacity).toBe(1);
    expect(state.atmosphere).toBe(1);
  }
  const handoff = await seek(page, 0.95);
  expect(handoff.shot).toBe(5);
  await expect(page.locator("#field-panel")).toBeVisible();
  await expect(page.locator(".field-handoff")).toHaveAttribute("href", "/login");
  const metrics = await page.locator("#field-panel .metrics b").allTextContents();
  expect(metrics.some((value) => value.includes("18.4"))).toBe(true);
  expect(metrics.some((value) => value.includes("0.71"))).toBe(true);
  await expect(page.locator("#instrument")).toBeHidden();
  await page.locator("#inspect-field").focus();
  await page.locator("#inspect-field").click();
  await expect(page.locator("#inspect-field")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#trend")).toBeVisible();
  await page.locator("#inspect-field").click();
  await expect(page.locator("#inspect-field")).toHaveAttribute("aria-expanded", "false");
  await page.locator(".field-handoff").click();
  await expect(page).toHaveURL(/\/login$/);
});
