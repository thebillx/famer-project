import { expect, test } from "@playwright/test";

const route = "/cinematic-lab";
const shots = [0, 0.16, 0.34, 0.55, 0.78];

type State = {
  ready: boolean;
  mode: string;
  p: number;
  shot: number;
  camera: number[];
  look: number[];
  fov: number;
  roll: number;
  attitude: number[];
  spacecraftPosition: number[];
  spacecraftVisible: boolean;
  cloudOpacity: number;
  cloudRotation: number;
  earthOpacity: number;
  atmosphere: number;
  starsOpacity: number;
  starsVisible: boolean;
  fieldOpacity: number;
  viewport: number[];
  drawCalls: number;
  triangles: number;
  assets: number;
  model: { generator?: string };
};

async function state(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): State } }).__agriscope.snapshot());
}

async function seek(page: import("@playwright/test").Page, progress: number) {
  return page.evaluate((value) => (window as typeof window & { __agriscope: { seekCheckpoint(p: number): State } }).__agriscope.seekCheckpoint(value), progress);
}

async function waitForJourney(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const journey = (window as typeof window & { __agriscope?: { snapshot(): State } }).__agriscope;
    return journey?.snapshot().mode === "webgl" && document.querySelectorAll(".cinematic canvas").length === 1;
  });
}

function expectRuntimeState(value: State, viewport: { width: number; height: number }) {
  for (const key of ["terrain", "nativeJourney", "descentSurface", "surfaceTransforms"]) expect(Object.hasOwn(value, key)).toBe(false);
  expect(value.ready).toBe(true);
  expect(value.mode).toBe("webgl");
  expect(value.viewport).toEqual([viewport.width, viewport.height]);
  expect(value.camera.every(Number.isFinite)).toBe(true);
  expect(value.look.every(Number.isFinite)).toBe(true);
  expect(value.attitude.every(Number.isFinite)).toBe(true);
  expect(value.spacecraftPosition.every(Number.isFinite)).toBe(true);
  expect(value.drawCalls).toBeGreaterThan(5);
  expect(value.triangles).toBeGreaterThan(1000);
  expect(value.starsVisible).toBe(true);
  expect(value.starsOpacity).toBeGreaterThan(0);
  expect(value.cloudOpacity).toBeCloseTo(0.3, 8);
  expect(value.earthOpacity).toBe(1);
  expect(value.atmosphere).toBe(1);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`cinematic lab uses the public five-shot runtime at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    const cinematicRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes("/cinematic/")) cinematicRequests.push(path);
    });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`${route}?qa=1`);
    await waitForJourney(page);
    const initial = await state(page);
    expectRuntimeState(initial, viewport);
    expect(initial.assets).toBe(5);
    expect(initial.model.generator).toMatch(/Blender 4\.5/);
    expect(cinematicRequests.some((path) => path.includes("native-descent") || /native-[^/]+\.js$/.test(path))).toBe(false);
    expect(cinematicRequests.some((path) => path.endsWith("/lab-timeline.js"))).toBe(false);
    expect(cinematicRequests.some((path) => /models\/(farmland|tree|scene4-)/.test(path))).toBe(false);
    expect(cinematicRequests.some((path) => /(?:terrain|survey-corridor|descent-atmosphere)/.test(path))).toBe(false);
    await expect(page.locator("#rail button")).toHaveCount(5);
    await expect(page.locator(".chapter-anchor")).toHaveCount(5);
    await expect(page.locator(".chapter-anchor h2.sr-only")).toHaveCount(5);
    await expect.poll(() => page.locator("header nav a").evaluateAll((links) => links.map((link) => link.getAttribute("href")).sort())).toEqual(["#field", "#mission", "/login?mode=login"].sort());
    for (const button of await page.locator("#rail button").evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return [box.width, box.height]; }))) {
      expect(button[0]).toBeGreaterThanOrEqual(44);
      expect(button[1]).toBeGreaterThanOrEqual(44);
    }

    const forward: State[] = [];
    for (const [index, progress] of shots.entries()) {
      const checkpoint = await seek(page, progress);
      expectRuntimeState(checkpoint, viewport);
      expect(checkpoint.shot).toBe(index + 1);
      forward.push(checkpoint);
    }
    const instrument = page.locator("#instrument");
    await seek(page, 0.78);
    await expect(instrument).toBeVisible();
    await expect(instrument).not.toHaveCSS("opacity", "0");
    const handoff = await seek(page, 0.95);
    expectRuntimeState(handoff, viewport);
    expect(handoff.shot).toBe(5);
    await expect(page.locator("#field-panel")).toBeVisible();
    await expect(page.locator("#narrative")).toHaveCSS("opacity", "0");
    await expect(page.locator(".field-handoff")).toHaveAttribute("href", "/login");
    const metrics = await page.locator("#field-panel .metrics b").allTextContents();
    expect(metrics.some((value) => value.includes("18.4"))).toBe(true);
    expect(metrics.some((value) => value.includes("0.71"))).toBe(true);
    const trend = page.locator("#inspect-field");
    await expect(trend).toHaveAttribute("aria-expanded", "false");
    await trend.click();
    await expect(trend).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#trend")).toBeVisible();

    for (let index = forward.length - 1; index >= 0; index -= 1) {
      const reverse = await seek(page, shots[index]);
      expectRuntimeState(reverse, viewport);
      expect(reverse).toEqual(forward[index]);
    }
    await page.goto(`${route}?qa=1#mission`);
    await waitForJourney(page);
    // Software WebGL needs the same scroll-settling budget as the browser evidence harness.
    await expect.poll(async () => Math.abs((await state(page)).p - 0.34), { timeout: 60_000 }).toBeLessThan(0.02);
    await page.goto(`${route}?qa=1&shot=5`);
    await waitForJourney(page);
    await expect.poll(async () => (await state(page)).shot).toBe(5);
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    const resized = await seek(page, 0.78);
    expectRuntimeState(resized, { width: viewport.height, height: viewport.width });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("cinematic lab reduced motion and module failure keep a readable registration path", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${route}?qa=1`);
  await page.waitForFunction(() => (window as typeof window & { __agriscope?: { snapshot(): State } }).__agriscope?.snapshot().mode === "static");
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".cinematic canvas")).toHaveCount(0);
  await expect(page.locator("#fallback")).toContainText("ข้อมูลเป็นตัวอย่างสาธิต");
  await expect(page.locator("#fallback .static-sample")).toContainText("FIELD A–204");
  await expect(page.locator("#fallback .static-sample")).toContainText("18.4 ไร่");
  await expect(page.locator("#fallback .static-sample")).toContainText("NDVI เฉลี่ย 0.71");
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/cinematic/main.js", (routeRequest) => routeRequest.abort());
  await page.reload();
  await expect(page.locator("#fallback-reason")).toContainText("โหลดประสบการณ์ 3D ไม่สำเร็จ", { timeout: 30_000 });
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login");
});

test("cinematic lab no-JavaScript fallback remains readable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(route);
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".cinematic canvas")).toHaveCount(0);
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login");
  await context.close();
});
