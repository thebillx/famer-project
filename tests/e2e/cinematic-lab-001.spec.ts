import {expect,test} from "@playwright/test";

const nativeFiles = ["orbit.glb", "regional.glb", "field.glb", "clouds.glb", "field-world.hdr"];
const nativeAssetPath = "/cinematic/models/native-descent/";
const nativeModules = ["native-journey.js", "native-assets.js", "native-timeline.js", "native-journey-manifest.js"];

type NativeAssetIdentity = { id: string; url: string; kind: string; sha256: string; byte_length: number };

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
  contextWorld: null | { opacity: number; scale: number; triangles: number; batches: number };
  scene4Hero: null | { opacity: number; scale: number; triangles: number; batches: number };
  descentAtmosphere: null | { opacity: number; scale: number; banks: number };
  nativeJourney: {
    nativeWeight: number;
    nativeTime: number;
    local_times: Record<"orbit" | "regional" | "field" | "clouds", number>;
    stage_weights: Record<"orbit" | "regional" | "field", number>;
    visualCamera: { position: number[]; quaternion: number[]; fov: number; aspect: number };
    targetCss: { x: number; y: number };
    crop: { mode: string; u0: number; u1: number; v0: number; v1: number; offsetX: number; offsetY: number; displayWidth: number; displayHeight: number };
    registration: { homography: number[]; identities: Record<string, { object: string; vertex: number }>; target: string };
    assets: NativeAssetIdentity[];
  };
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

async function expectUploadedRegistration(page: import("@playwright/test").Page, state: LabState) {
  const uploaded = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".cinematic canvas");
    const context = canvas?.getContext("webgl2");
    if (!context) throw new Error("Native overlay has no WebGL2 context");
    const program = context.getParameter(context.CURRENT_PROGRAM) as WebGLProgram | null;
    if (!program) throw new Error("Native overlay has no rendered program");
    const location = context.getUniformLocation(program, "registration");
    if (!location) throw new Error("Rendered overlay has no registration uniform");
    return Array.from(context.getUniform(program, location) as Float32Array);
  });
  expect(uploaded).toHaveLength(9);
  const homography = state.nativeJourney.registration.homography;
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      expect(uploaded[column * 3 + row]).toBeCloseTo(homography[row * 3 + column], 6);
    }
  }
}

function expectNativeTiming(native: LabState["nativeJourney"]) {
  const time = native.nativeTime;
  // The accepted reader starts regional at 3 s and field at 7 s. Each GLB's
  // mixer must receive its own local time when global descent time advances.
  const expectedTimes = {
    orbit: Math.min(4.5, Math.max(0, time)),
    regional: Math.min(5.5, Math.max(0, time - 3)),
    field: Math.min(5, Math.max(0, time - 7)),
    clouds: Math.min(12, Math.max(0, time)),
  };
  for (const id of Object.keys(expectedTimes) as (keyof typeof expectedTimes)[]) {
    expect(native.local_times[id], `${id} local time at descent second ${time}`).toBeCloseTo(expectedTimes[id], 6);
  }
  // ADR-0014 preserves the accepted 3.69–3.81 s and 7.69–7.81 s blends.
  const first = Math.min(1, Math.max(0, (time - 3.69) / 0.12));
  const second = Math.min(1, Math.max(0, (time - 7.69) / 0.12));
  const firstWeight = first * first * (3 - 2 * first);
  const secondWeight = second * second * (3 - 2 * second);
  expect(native.stage_weights.orbit).toBeCloseTo(1 - firstWeight, 6);
  expect(native.stage_weights.regional).toBeCloseTo(firstWeight * (1 - secondWeight), 6);
  expect(native.stage_weights.field).toBeCloseTo(secondWeight, 6);
}

async function expectParcelClearOfPanels(page: import("@playwright/test").Page, state: LabState) {
  const layout = await page.evaluate(async (matrix) => {
    const path = "/cinematic/native-timeline.js";
    const { LEGACY_FIELD_CORNERS } = await import(path) as { LEGACY_FIELD_CORNERS: [number, number][] };
    const corners = LEGACY_FIELD_CORNERS.map(([x, z]) => {
      const divisor = matrix[6] * x + matrix[7] * z + matrix[8];
      return {
        x: (matrix[0] * x + matrix[1] * z + matrix[2]) / divisor * innerWidth,
        y: (matrix[3] * x + matrix[4] * z + matrix[5]) / divisor * innerHeight,
      };
    });
    const panels = ["#narrative", "#evidence-panel", "#field-panel"].flatMap((selector) => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return [];
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return [{ selector, left, right, top, bottom }];
    });
    return {
      parcel: { left: Math.min(...corners.map((point) => point.x)), right: Math.max(...corners.map((point) => point.x)), top: Math.min(...corners.map((point) => point.y)), bottom: Math.max(...corners.map((point) => point.y)) },
      panels,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, state.nativeJourney.registration.homography);
  const { parcel, viewport } = layout;
  expect(parcel.left).toBeGreaterThanOrEqual(0);
  expect(parcel.right).toBeLessThanOrEqual(viewport.width);
  expect(parcel.top).toBeGreaterThanOrEqual(0);
  expect(parcel.bottom).toBeLessThanOrEqual(viewport.height);
  for (const panel of layout.panels) {
    const overlapWidth = Math.min(parcel.right, panel.right) - Math.max(parcel.left, panel.left);
    const overlapHeight = Math.min(parcel.bottom, panel.bottom) - Math.max(parcel.top, panel.top);
    expect(overlapWidth <= 0 || overlapHeight <= 0, `Shot ${state.shot} parcel overlaps ${panel.selector} at ${viewport.width}×${viewport.height}: ${JSON.stringify({ parcel, panel })}`).toBe(true);
  }
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 800 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`cinematic lab has deterministic chapters and purposeful controls at ${viewport.width}px`, async ({ page }) => {
    // Each viewport exercises roughly 80 rendered seeks, including reverse travel.
    // Software WebGL needs a larger aggregate budget for the complete sequence.
    test.setTimeout(180_000);
    const cinematicRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes("/cinematic/")) cinematicRequests.push(path);
    });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/cinematic-lab?qa=1");
    await waitForLab(page);

    const initial = await page.evaluate(() => (window as typeof window & { __agriscope: { snapshot(): LabState } }).__agriscope.snapshot());
    expect(initial.assets).toBe(11);
    const expectedNativeAssets = await page.evaluate(async () => {
      const path = "/cinematic/native-journey-manifest.js";
      const { NATIVE_ASSET_MANIFEST } = await import(path) as { NATIVE_ASSET_MANIFEST: NativeAssetIdentity[] };
      return NATIVE_ASSET_MANIFEST.map(({ id, url, kind, sha256, byte_length }) => ({ id, url, kind, sha256, byte_length })).sort((left, right) => left.id.localeCompare(right.id));
    });
    expect([...initial.nativeJourney.assets].sort((left, right) => left.id.localeCompare(right.id))).toEqual(expectedNativeAssets);
    for (const file of nativeFiles) {
      expect(cinematicRequests.filter((path) => path === `${nativeAssetPath}${file}`)).toHaveLength(1);
    }
    for (const file of nativeModules) {
      expect(cinematicRequests.filter((path) => path === `/cinematic/${file}`)).toHaveLength(1);
    }
    for (const name of ["scene4-regional", "scene4-hero", "scene4-context", "tree"]) {
      expect(cinematicRequests).not.toContain(`/cinematic/models/${name}.mesh.json`);
    }
    const beats = await page.evaluate(() => (window as typeof window & { __agriscope: { BEATS: { id: string; p: number }[] } }).__agriscope.BEATS);
    expect(beats).toHaveLength(19);
    expect(new Set(beats.map((beat) => beat.id))).toHaveProperty("size", 19);
    await expect(page.locator("#rail button")).toHaveCount(10);
    await expect(page.locator(".cinematic canvas")).toHaveCount(1);
    await expect(page.locator(".lab-badge")).toContainText("SYNTHETIC DEMO");

    const chapterPoints = await page.evaluate(() => (window as typeof window & { __agriscope: { SHOTS: { p: number }[] } }).__agriscope.SHOTS.map((shot) => shot.p));
    expect(chapterPoints).toHaveLength(10);
    const chapterStates: LabState[] = [];
    for (const [index, point] of chapterPoints.entries()) {
      const chapter = await seek(page, point);
      expect(chapter.shot).toBe(index + 1);
      const native = chapter.nativeJourney;
      expectNativeTiming(native);
      expect(native.visualCamera.position).toHaveLength(3);
      expect(native.visualCamera.quaternion).toHaveLength(4);
      expect([...native.visualCamera.position, ...native.visualCamera.quaternion, native.visualCamera.fov, native.targetCss.x, native.targetCss.y].every(Number.isFinite)).toBe(true);
      expect(native.visualCamera.aspect).toBeCloseTo(16 / 9, 8);
      expect(native.nativeWeight).toBeGreaterThanOrEqual(0);
      expect(native.nativeWeight).toBeLessThanOrEqual(1);
      expect(native.crop.displayWidth / native.crop.displayHeight).toBeCloseTo(16 / 9, 8);
      expect([native.crop.u0, native.crop.u1, native.crop.v0, native.crop.v1].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      expect(native.crop.u1).toBeGreaterThan(native.crop.u0);
      expect(native.crop.v1).toBeGreaterThan(native.crop.v0);
      expect([native.crop.offsetX, native.crop.offsetY, native.crop.displayWidth, native.crop.displayHeight].every(Number.isFinite)).toBe(true);
      expect(native.registration.homography).toHaveLength(9);
      expect(native.registration.homography.every(Number.isFinite)).toBe(true);
      expect(Object.keys(native.registration.identities).sort()).toEqual(["bottom", "left", "right", "top"]);
      expect(native.registration.identities).toEqual(initial.nativeJourney.registration.identities);
      expect(native.registration.target).toBe("V17 arrival beacon");
      if (viewport.width === 1920 && native.nativeWeight === 1) {
        expect(native.crop.offsetX).toBeLessThanOrEqual(0);
        expect(native.crop.offsetX + native.crop.displayWidth).toBeGreaterThanOrEqual(viewport.width);
        expect(native.crop.offsetY).toBeLessThanOrEqual(0);
        expect(native.crop.offsetY + native.crop.displayHeight).toBeGreaterThanOrEqual(viewport.height);
      }
      if (viewport.width < 760 && index >= 5) await expectParcelClearOfPanels(page, chapter);
      if (index === 3) {
        const position = await page.locator("#geo").evaluate((element) => ({ x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top) }));
        expect(position.x).toBeCloseTo(Math.min(viewport.width - 210, Math.max(24, native.targetCss.x + 18)), 2);
        expect(position.y).toBeCloseTo(Math.min(viewport.height * (viewport.width < 760 ? 0.44 : 0.56), Math.max(110, native.targetCss.y - 24)), 2);
        if (viewport.width < 760) {
          const geo = await page.locator("#geo").boundingBox();
          const narrative = await page.locator("#narrative").boundingBox();
          expect(geo).not.toBeNull();
          expect(narrative).not.toBeNull();
          const overlapWidth = Math.min(geo!.x + geo!.width, narrative!.x + narrative!.width) - Math.max(geo!.x, narrative!.x);
          const overlapHeight = Math.min(geo!.y + geo!.height, narrative!.y + narrative!.height) - Math.max(geo!.y, narrative!.y);
          expect(overlapWidth <= 0 || overlapHeight <= 0, `Thailand label overlaps narrative at ${viewport.width}×${viewport.height}`).toBe(true);
        }
      }
      chapterStates.push(chapter);
    }
    for (let index = chapterPoints.length - 1; index >= 0; index -= 1) {
      const reverse = await seek(page, chapterPoints[index]);
      expect(reverse.nativeJourney).toEqual(chapterStates[index].nativeJourney);
      expect(reverse.evidence).toEqual(chapterStates[index].evidence);
      expect(reverse.shot).toBe(index + 1);
    }

    const joinTimes = [3.68, 3.69, 3.75, 3.81, 3.82, 7.68, 7.69, 7.75, 7.81, 7.82];
    const cameraPoints = [0.299, 0.30, 0.315, 0.33, ...joinTimes.map((time) => 0.30 + time / 12 * 0.26), 0.43, 0.46, 0.485, 0.51, 0.56];
    cameraPoints.sort((left, right) => left - right);
    const forward = [] as LabState[];
    for (const point of cameraPoints) {
      const snapshot = await seek(page, point);
      expect(snapshot.nativeJourney.nativeTime).toBeCloseTo(Math.min(12, Math.max(0, (snapshot.p - 0.30) / 0.26 * 12)), 3);
      expectNativeTiming(snapshot.nativeJourney);
      forward.push(snapshot);
    }
    await seek(page, 1);
    for (let index = cameraPoints.length - 1; index >= 0; index -= 1) {
      const reverse = await seek(page, cameraPoints[index]);
      expect(reverse.camera).toEqual(forward[index].camera);
      expect(reverse.look).toEqual(forward[index].look);
      expect(reverse.shot).toBe(forward[index].shot);
      expect(reverse.regionalWorld).toEqual(forward[index].regionalWorld);
      expect(reverse.contextWorld).toEqual(forward[index].contextWorld);
      expect(reverse.scene4Hero).toEqual(forward[index].scene4Hero);
      expect(reverse.descentAtmosphere).toEqual(forward[index].descentAtmosphere);
      expect(reverse.nativeJourney).toEqual(forward[index].nativeJourney);
    }
    for (const index of [0, cameraPoints.length - 1, 3, 1]) {
      await seek(page, 1);
      const absolute = await seek(page, cameraPoints[index]);
      expect(absolute.nativeJourney).toEqual(forward[index].nativeJourney);
    }
    const held = (await seek(page, 0.561)).nativeJourney;
    expect(held.nativeTime).toBe(12);
    for (const point of [0.65, 0.76, 0.86, 0.95, 1]) {
      const finalField = (await seek(page, point)).nativeJourney;
      expect(finalField.nativeTime).toBe(12);
      expect(finalField.nativeWeight).toBe(1);
      expect(finalField.visualCamera).toEqual(held.visualCamera);
      expect(finalField.targetCss).toEqual(held.targetCss);
      expect(finalField.crop).toEqual(held.crop);
      expect(finalField.registration).toEqual(held.registration);
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

    const boundaryState = await seek(page, 0.56);
    await expectUploadedRegistration(page, boundaryState);
    const boundary = page.locator('[data-hotspot="boundary"]');
    await expect(boundary).toBeVisible();
    const hotspotPositions = await page.locator("#field-hotspots button").evaluateAll((elements) => elements.map((element) => ({ x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top) })));
    expect(hotspotPositions).toHaveLength(2);
    const matrix = boundaryState.nativeJourney.registration.homography;
    for (const [index, [x, z]] of [[-2.12, -1.84], [0.95, 0.25]].entries()) {
      const divisor = matrix[6] * x + matrix[7] * z + matrix[8];
      const projectedX = (matrix[0] * x + matrix[1] * z + matrix[2]) / divisor * viewport.width;
      const projectedY = (matrix[3] * x + matrix[4] * z + matrix[5]) / divisor * viewport.height;
      expect(hotspotPositions[index].x).toBeCloseTo(Math.min(viewport.width - 80, Math.max(24, projectedX)), 2);
      expect(hotspotPositions[index].y).toBeCloseTo(Math.min(viewport.height - 90, Math.max(110, projectedY)), 2);
    }
    await boundary.focus();
    await expect(page.locator("#hotspot-detail")).toContainText("ขอบเขตเดียวกัน");

    const comparisonState = await seek(page, 0.76);
    await expectUploadedRegistration(page, comparisonState);
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
  const nativeAssetRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/cinematic/models/native-descent/")) nativeAssetRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/cinematic-lab?qa=1");
  await page.waitForFunction(() => (window as typeof window & { __agriscope?: { snapshot(): LabState } }).__agriscope?.snapshot().mode === "static");
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".cinematic canvas")).toHaveCount(0);
  await expect(page.locator("#fallback")).toContainText("ข้อมูลสาธิต");
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login?mode=register");
  expect(nativeAssetRequests).toHaveLength(0);

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
  ...nativeFiles.map((file) => [file, `**${nativeAssetPath}${file}`]),
  ...nativeModules.map((file) => [file, `**/cinematic/${file}`]),
] as const) {
  test(`cinematic lab ${label} failure keeps a readable Thai handoff`, async ({ page }) => {
    let intercepted = 0;
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.route(pattern, (route) => {
      intercepted += 1;
      return route.abort();
    });
    await page.goto("/cinematic-lab?qa=1");
    const failureReason = pattern.endsWith(".js") ? "โหลดประสบการณ์ 3D ไม่สำเร็จ" : "อุปกรณ์นี้แสดงภาพ 3D ไม่ได้";
    await expect(page.locator("#fallback-reason")).toContainText(failureReason, { timeout: 30_000 });
    expect(intercepted).toBe(1);
    await expect(page.locator("#fallback")).toBeVisible();
    await expect(page.locator(".cinematic canvas")).toBeHidden();
    await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login?mode=register");
  });
}

test("cinematic lab rejects a same-length GLB identity mismatch before showing the journey", async ({ page }) => {
  let intercepted = 0;
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route(`**${nativeAssetPath}orbit.glb`, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const original = await response.body();
    const corrupted = Buffer.from(original);
    corrupted[corrupted.length - 1] ^= 1;
    expect(corrupted.length).toBe(original.length);
    expect(corrupted.equals(original)).toBe(false);
    intercepted += 1;
    await route.fulfill({ response, body: corrupted });
  });
  await page.goto("/cinematic-lab?qa=1");
  await expect(page.locator("#fallback-reason")).toContainText("อุปกรณ์นี้แสดงภาพ 3D ไม่ได้", { timeout: 30_000 });
  expect(intercepted).toBe(1);
  expect(errors.some((message) => message.includes("orbit identity mismatch"))).toBe(true);
  await expect(page.locator("#fallback")).toBeVisible();
  await expect(page.locator(".cinematic canvas")).toBeHidden();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#resume")).toBeHidden();
  await expect(page.locator("#fallback .text-link")).toHaveAttribute("href", "/login?mode=register");
});

test("landing entry does not load native descent assets or lab camera timelines", async ({ page }) => {
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
  expect(cinematicRequests.some((url) => new URL(url).pathname.includes("/cinematic/models/native-descent/"))).toBe(false);
  expect(cinematicRequests.some((url) => /\/cinematic\/native-[^/]+\.js$/.test(new URL(url).pathname))).toBe(false);
  for (const suffix of ["/cinematic/models/scene4-regional.mesh.json", "/cinematic/models/scene4-hero.mesh.json", "/cinematic/models/scene4-context.mesh.json", "/cinematic/scene4-regional.js", "/cinematic/scene4-hero.js", "/cinematic/scene4-context.js", "/cinematic/descent-atmosphere.js"]) {
    expect(cinematicRequests.some((url) => new URL(url).pathname.endsWith(suffix))).toBe(false);
  }
});
