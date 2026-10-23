import {expect,test} from "@playwright/test";

type LabState = {
  mode: string;
  journeyMode: string;
  assets: number;
  p: number;
  shot: number;
  camera: number[];
  look: number[];
  pointerParallax: number[];
  regionalWorld: null | { opacity: number; scale: number; triangles: number; batches: number };
  scene4Hero: null | { opacity: number; scale: number; triangles: number; batches: number };
  descentAtmosphere: null | { opacity: number; scale: number; banks: number };
  spacecraftOpacity: number;
  spacecraftDepthWrite: { enabled: boolean; active: number; authored: number; total: number };
  evidence: {
    status: string;
    comparison: number;
    before: number | null;
    after: number | null;
  };
};

async function waitForLab(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const api = (window as typeof window & { __agriscope?: { snapshot(): LabState } }).__agriscope;
    const state = api?.snapshot();
    return state?.mode === "webgl" && state.journeyMode === "lab" && document.querySelectorAll(".cinematic canvas").length === 1;
  });
}

async function seek(page: import("@playwright/test").Page, progress: number) {
  return page.evaluate((value) => {
    const api = (window as typeof window & { __agriscope: { seekCheckpoint(p: number): LabState } }).__agriscope;
    return api.seekCheckpoint(value);
  }, progress);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
  test(`cinematic lab has deterministic chapters and purposeful controls at ${viewport.width}px`, async ({ page }) => {
    const scene4MeshRequests = { regional: [] as string[], hero: [] as string[], legacyTree: [] as string[] };
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/cinematic/models/scene4-regional.mesh.json")) scene4MeshRequests.regional.push(request.url());
      if (path.endsWith("/cinematic/models/scene4-hero.mesh.json")) scene4MeshRequests.hero.push(request.url());
      if (path.endsWith("/cinematic/models/tree.mesh.json")) scene4MeshRequests.legacyTree.push(request.url());
    });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/cinematic-lab?qa=1");
    await waitForLab(page);

    const initial = await page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot());
    expect(initial.assets).toBe(8);
    expect(initial.regionalWorld).toMatchObject({ triangles: 42234, batches: 6 });
    expect(initial.scene4Hero).toMatchObject({ triangles: 98743, batches: 12 });
    expect(initial.descentAtmosphere).toMatchObject({ banks: 6 });
    expect(scene4MeshRequests.regional).toHaveLength(1);
    expect(scene4MeshRequests.hero).toHaveLength(1);
    expect(scene4MeshRequests.legacyTree).toHaveLength(0);
    const beats = await page.evaluate(() => (window as typeof window & { __agriscope: { BEATS: { id: string; p: number }[] } }).__agriscope.BEATS);
    expect(beats).toHaveLength(19);
    expect(new Set(beats.map((beat) => beat.id))).toHaveProperty("size", 19);
    await expect(page.locator("#rail button")).toHaveCount(10);
    await expect(page.locator(".cinematic canvas")).toHaveCount(1);
    await expect(page.locator(".lab-badge")).toContainText("SYNTHETIC DEMO");

    const cameraPoints = [0.43, 0.46, 0.485, 0.51];
    const forward = [] as LabState[];
    for (const point of cameraPoints) forward.push(await seek(page, point));
    for (let index = cameraPoints.length - 1; index >= 0; index -= 1) {
      const reverse = await seek(page, cameraPoints[index]);
      expect(reverse.camera).toEqual(forward[index].camera);
      expect(reverse.look).toEqual(forward[index].look);
      expect(reverse.shot).toBe(forward[index].shot);
      expect(reverse.regionalWorld).toEqual(forward[index].regionalWorld);
      expect(reverse.scene4Hero).toEqual(forward[index].scene4Hero);
      expect(reverse.descentAtmosphere).toEqual(forward[index].descentAtmosphere);
    }

    const spacecraftBefore = await seek(page, 0.22);
    const spacecraftFaded = await seek(page, 0.46);
    const spacecraftRestored = await seek(page, 0.22);
    expect(spacecraftBefore.spacecraftOpacity).toBe(1);
    expect(spacecraftBefore.spacecraftDepthWrite.enabled).toBe(true);
    expect(spacecraftBefore.spacecraftDepthWrite.active).toBe(spacecraftBefore.spacecraftDepthWrite.authored);
    expect(spacecraftBefore.spacecraftDepthWrite.authored).toBeGreaterThan(0);
    expect(spacecraftFaded.spacecraftOpacity).toBe(0);
    expect(spacecraftFaded.spacecraftDepthWrite.enabled).toBe(false);
    expect(spacecraftFaded.spacecraftDepthWrite.active).toBe(0);
    expect(spacecraftRestored.spacecraftDepthWrite).toEqual(spacecraftBefore.spacecraftDepthWrite);

    await seek(page, 0.22);
    await expect(page.locator("#payload-control")).toBeVisible();
    await page.locator("#payload-control").click();
    await expect(page.locator("#payload-tip")).toBeVisible();
    await expect(page.locator("#payload-tip")).toContainText("ไม่ใช่ยานหรืออุปกรณ์ของ AgriScope");

    await seek(page, 0.56);
    const boundary = page.locator('[data-hotspot="boundary"]');
    await expect(boundary).toBeVisible();
    await boundary.focus();
    await expect(page.locator("#hotspot-detail")).toContainText("ขอบเขตเดียวกัน");

    await seek(page, 0.76);
    await expect(page.locator("#field-hotspots")).toBeHidden();
    const slider = page.locator("#comparison-slider");
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAccessibleName("เปรียบเทียบ NDVI ก่อนและหลัง");
    await slider.focus();
    await page.keyboard.press("End");
    await expect(page.locator("#comparison-output")).toHaveText("แสดงวันที่หลังเป็นหลัก");
    const compared = await page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot());
    expect(compared.evidence.comparison).toBe(1);

    if (viewport.width > 760) {
      const stage = page.locator(".cinematic-stage");
      const stageBox = await stage.boundingBox();
      expect(stageBox).not.toBeNull();
      await seek(page, 0.12);
      await page.mouse.move(stageBox!.x + stageBox!.width * 0.8, stageBox!.y + stageBox!.height * 0.3);
      await page.waitForFunction(() => {
        const { pointerParallax } = (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot();
        return pointerParallax.some((value) => Math.abs(value) > 0.02);
      });
      await page.locator(".cinematic").dispatchEvent("pointerleave", { pointerType: "mouse" });
      await page.waitForFunction(() => {
        const { pointerParallax } = (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot();
        return pointerParallax.every((value) => Math.abs(value) < 0.01);
      });
    }

    await seek(page, 0.86);
    await page.locator("#inspect-field").click();
    await expect(page.locator("#sample-status")).toHaveText("ข้อมูลยังไม่พอ");
    await expect(slider).toBeDisabled();
    const insufficient = await page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot());
    expect(insufficient.evidence.status).toBe("NOT_ASSESSABLE");
    expect(insufficient.evidence.before).toBeNull();
    expect(insufficient.evidence.after).toBeNull();

    await page.locator("#rail button").nth(4).click();
    await page.waitForFunction(() => (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot().shot === 5);
    await expect(page.locator('.field-handoff')).toHaveAttribute("href", "/login?mode=register");
  });
}

test("cinematic lab reduced-motion and module failure retain Thai content and registration", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cinematic-lab?qa=1");
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".cinematic canvas")).toHaveCount(0);
  await expect(page.locator("#fallback")).toContainText("ข้อมูลสาธิต");
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login?mode=register");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/cinematic/lab-main.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator("#fallback-reason")).toContainText("โหลดประสบการณ์ 3D ไม่สำเร็จ");
  await expect(page.locator(".cinematic canvas")).toHaveCount(0);
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login?mode=register");
});

for (const [label, pattern] of [
  ["regional mesh", "**/cinematic/models/scene4-regional.mesh.json"],
  ["Hero mesh", "**/cinematic/models/scene4-hero.mesh.json"],
  ["atmosphere module", "**/cinematic/descent-atmosphere.js"],
  ["regional module", "**/cinematic/scene4-regional.js"],
  ["Hero module", "**/cinematic/scene4-hero.js"],
] as const) {
  test(`cinematic lab ${label} failure keeps a readable Thai handoff`, async ({ page }) => {
    let intercepted = 0;
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route(pattern, (route) => {
      intercepted += 1;
      return route.abort();
    });
    await page.goto("/cinematic-lab?qa=1");
    await expect(page.locator("#fallback-reason")).toContainText("อุปกรณ์นี้แสดงภาพ 3D ไม่ได้", { timeout: 30_000 });
    expect(intercepted).toBe(1);
    await expect(page.locator("#fallback")).toBeVisible();
    await expect(page.locator(".cinematic canvas")).toBeHidden();
    await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login?mode=register");
  });
}

test("landing entry does not load Scene 4 lab assets or camera timeline", async ({ page }) => {
  const cinematicRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/cinematic/")) cinematicRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?qa=1");
  await page.waitForFunction(() => {
    const api = (window as typeof window & { __agriscope?: { snapshot(): LabState } }).__agriscope;
    const state = api?.snapshot();
    return state?.mode === "webgl" && state.journeyMode === "landing";
  });
  const landing = await page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot());
  expect(landing.assets).toBe(7);
  expect(cinematicRequests.filter((url) => new URL(url).pathname.endsWith("/cinematic/models/tree.mesh.json"))).toHaveLength(1);
  expect(cinematicRequests.some((url) => url.endsWith("/cinematic/lab-timeline.js"))).toBe(false);
  for (const suffix of ["/cinematic/models/scene4-regional.mesh.json", "/cinematic/models/scene4-hero.mesh.json", "/cinematic/scene4-regional.js", "/cinematic/scene4-hero.js", "/cinematic/descent-atmosphere.js"]) {
    expect(cinematicRequests.some((url) => new URL(url).pathname.endsWith(suffix))).toBe(false);
  }
});
