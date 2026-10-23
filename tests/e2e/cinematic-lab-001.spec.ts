import {expect,test} from "@playwright/test";

type LabState = {
  mode: string;
  journeyMode: string;
  p: number;
  shot: number;
  camera: number[];
  look: number[];
  pointerParallax: number[];
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
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/cinematic-lab?qa=1");
    await waitForLab(page);

    await expect(page.locator("#rail button")).toHaveCount(10);
    await expect(page.locator(".cinematic canvas")).toHaveCount(1);
    await expect(page.locator(".lab-badge")).toContainText("SYNTHETIC DEMO");

    const before = await seek(page, 0.46);
    await seek(page, 0.56);
    const reverse = await seek(page, 0.46);
    expect(reverse.camera).toEqual(before.camera);
    expect(reverse.look).toEqual(before.look);
    expect(reverse.shot).toBe(before.shot);

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

test("landing entry does not load the lab camera timeline", async ({ page }) => {
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
  expect(cinematicRequests.some((url) => url.endsWith("/cinematic/lab-timeline.js"))).toBe(false);
});
