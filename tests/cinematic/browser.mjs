import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const url = process.env.CINEMATIC_URL || "http://127.0.0.1:5180/";
const evidence = process.env.CINEMATIC_EVIDENCE;
if (!evidence) throw new Error("Set CINEMATIC_EVIDENCE to a directory outside the repository.");
await mkdir(evidence, { recursive: true });

const software = process.env.CINEMATIC_SOFTWARE_WEBGL === "1";
const browser = await chromium.launch({
  ...(process.env.CINEMATIC_CHROMIUM ? { executablePath: process.env.CINEMATIC_CHROMIUM } : { channel: "chrome" }),
  headless: process.env.CINEMATIC_HEADED !== "1",
  args: software ? ["--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
});
const SHOT_POINTS = [0, 0.16, 0.34, 0.55, 0.78];
const HANDOFF = 0.95;
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 667 }];
const report = {
  url,
  browser: browser.version(),
  softwareWebGL: software,
  viewports: [],
  checks: [],
  textureUploads: null,
  errors: [],
  warnings: [],
  limitations: [
    "Mobile evidence uses viewport/touch emulation; no physical-device testing",
    "Public evidence uses synthetic offline fixture values; no satellite API or private data",
    "Exact checkpoints use the QA seek API; ordinary scroll and focus paths are checked separately",
  ],
};
const contexts = [];
const state = (page) => page.evaluate(() => window.__agriscope.snapshot());
const checkpoint = (page, progress) => page.evaluate((value) => window.__agriscope.seekCheckpoint(value), progress);
const save = (page, name) => page.screenshot({ path: resolve(evidence, `${name}.png`), timeout: 120000 });
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function ignored(urlString) {
  try { return new URL(urlString).pathname === "/favicon.ico"; } catch { return false; }
}

function monitor(page, normal = true) {
  const networkErrors = [];
  const runtimeErrors = [];
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
    if (normal) report.errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon.ico")) {
      runtimeErrors.push(message.text());
      if (normal) report.errors.push(message.text());
    }
    if (message.type() === "warning") report.warnings.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (normal && !ignored(request.url())) networkErrors.push(`requestfailed ${request.url()} ${request.failure()?.errorText || "unknown"}`);
  });
  page.on("response", (response) => {
    if (normal && response.status() >= 400 && !ignored(response.url())) networkErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return { networkErrors, runtimeErrors };
}

function assertSnapshot(snapshot, viewport, label) {
  const required = ["ready", "mode", "p", "shot", "camera", "look", "fov", "roll", "attitude", "spacecraftPosition", "spacecraftVisible", "cloudOpacity", "cloudRotation", "earthOpacity", "atmosphere", "starsOpacity", "starsVisible", "fieldOpacity", "viewport", "drawCalls", "triangles", "assets", "model"];
  for (const key of required) assert.ok(Object.hasOwn(snapshot, key), `${label}: snapshot exposes ${key}`);
  for (const key of ["terrain", "nativeJourney", "descentSurface", "surfaceTransforms"]) assert.equal(Object.hasOwn(snapshot, key), false, `${label}: retired ${key} snapshot is absent`);
  assert.equal(snapshot.ready, true, `${label}: journey is ready`);
  assert.equal(snapshot.mode, "webgl", `${label}: journey uses WebGL`);
  assert.deepEqual(snapshot.viewport, [viewport.width, viewport.height]);
  for (const key of ["p", "fov", "roll", "cloudOpacity", "cloudRotation", "earthOpacity", "atmosphere", "starsOpacity", "fieldOpacity", "drawCalls", "triangles", "assets"]) assert.ok(finite(snapshot[key]), `${label}: ${key} is finite`);
  for (const key of ["camera", "look", "attitude", "spacecraftPosition"]) assert.ok(snapshot[key].every(finite), `${label}: ${key} is finite`);
  assert.equal(snapshot.camera.length, 3); assert.equal(snapshot.look.length, 3); assert.equal(snapshot.attitude.length, 4); assert.equal(snapshot.spacecraftPosition.length, 3);
  assert.equal(typeof snapshot.spacecraftVisible, "boolean");
  assert.equal(snapshot.starsVisible, true, `${label}: stars remain visible`); assert.ok(snapshot.starsOpacity > 0, `${label}: stars retain opacity`);
  assert.ok(Math.abs(snapshot.cloudOpacity - 0.3) < 1e-9, `${label}: authored cloud opacity remains .30`);
  assert.equal(snapshot.earthOpacity, 1, `${label}: Earth remains opaque`); assert.equal(snapshot.atmosphere, 1, `${label}: atmosphere remains opaque`);
  assert.ok(Number.isInteger(snapshot.drawCalls) && snapshot.drawCalls > 5, `${label}: draw calls remain above the minimum`);
  assert.ok(Number.isInteger(snapshot.triangles) && snapshot.triangles > 1000, `${label}: authored geometry remains rendered`);
  const [x, y, z] = snapshot.camera; assert.ok(Math.hypot(x, y + 40, z) > 40.08, `${label}: camera remains outside the globe`);
}

async function ready(page, viewport) {
  await page.waitForFunction(() => window.__agriscope?.snapshot()?.ready && window.__agriscope.snapshot().mode === "webgl", null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll(".cinematic canvas").length === 1);
  const snapshot = await state(page); assertSnapshot(snapshot, viewport, "initial");
  assert.equal(await page.locator("#fallback").isVisible(), false);
  return snapshot;
}

async function assertStaticSample(page) {
  const sample = page.locator("#fallback .static-sample");
  assert.equal(await sample.isVisible(), true, "Static fallback keeps the synthetic field sample");
  const copy = await sample.textContent();
  for (const value of [/FIELD A–204/, /แปลงนาตัวอย่าง/, /18\.4 ไร่/, /NDVI เฉลี่ย 0\.71/, /Sentinel-2 L2A/, /14 ก\.พ\. 2569/, /3\.2%/]) assert.match(copy || "", value);
}

async function staticReady(page) {
  await page.waitForFunction(() => window.__agriscope?.snapshot()?.ready && window.__agriscope.snapshot().mode === "static", null, { timeout: 30000 });
  assert.equal(await page.locator(".cinematic canvas").count(), 0);
  assert.equal(await page.locator("#fallback").isVisible(), true); assert.equal(await page.locator("#loading").isVisible(), false);
  assert.equal(await page.locator("#fallback .text-link").getAttribute("href"), "/login");
  await assertStaticSample(page); assert.match(await page.locator("#fallback").textContent(), /ข้อมูลเป็นตัวอย่างสาธิต/);
}

async function installTextureProbe(page, maxTextureSize, { failResizeContext = false } = {}) {
  await page.addInitScript(({ cap, fail2d }) => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const patchedContexts = new WeakSet();
    const probe = { cap, contexts: 0, uploads: [] };
    window.__agriscopeTextureProbe = probe;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (fail2d && type === "2d") return null;
      const context = originalGetContext.call(this, type, ...args);
      if (!context || !["webgl", "webgl2", "experimental-webgl"].includes(type) || patchedContexts.has(context)) return context;
      patchedContexts.add(context);
      probe.contexts += 1;
      const originalGetParameter = context.getParameter;
      context.getParameter = function getParameter(parameter) {
        if (parameter === 0x0d33) return cap;
        return originalGetParameter.call(this, parameter);
      };
      const recordUpload = (kind, uploadArgs) => {
        let width;
        let height;
        let source;
        if (kind === "texImage2D") {
          source = uploadArgs.length === 6 ? uploadArgs[5] : undefined;
          if (source && Number.isFinite(source.width) && Number.isFinite(source.height)) {
            width = source.width;
            height = source.height;
          } else if (uploadArgs.length >= 9 && Number.isFinite(uploadArgs[3]) && Number.isFinite(uploadArgs[4])) {
            width = uploadArgs[3];
            height = uploadArgs[4];
          }
        } else {
          source = uploadArgs.length === 7 ? uploadArgs[6] : undefined;
          if (source && Number.isFinite(source.width) && Number.isFinite(source.height)) {
            width = source.width;
            height = source.height;
          } else if (uploadArgs.length >= 9 && Number.isFinite(uploadArgs[4]) && Number.isFinite(uploadArgs[5])) {
            width = uploadArgs[4];
            height = uploadArgs[5];
          }
        }
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          const sourceKind = source?.constructor?.name || null;
          const imageSource = ["HTMLImageElement", "HTMLCanvasElement", "ImageBitmap", "OffscreenCanvas", "VideoFrame"].includes(sourceKind);
          probe.uploads.push({ kind, width, height, sourceKind, imageSource });
        }
      };
      const originalTexImage2D = context.texImage2D;
      context.texImage2D = function texImage2D(...uploadArgs) {
        recordUpload("texImage2D", uploadArgs);
        return originalTexImage2D.apply(this, uploadArgs);
      };
      const originalTexSubImage2D = context.texSubImage2D;
      context.texSubImage2D = function texSubImage2D(...uploadArgs) {
        recordUpload("texSubImage2D", uploadArgs);
        return originalTexSubImage2D.apply(this, uploadArgs);
      };
      return context;
    };
  }, { cap: maxTextureSize, fail2d: failResizeContext });
}

async function authoredTextureDimensions(page) {
  return page.evaluate((files) => Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ file, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`Unable to inspect authored texture ${file}`));
    image.src = `/cinematic/textures/${file}`;
  }))), ["earth-day.jpg", "earth-clouds.jpg", "earth-night.png"]);
}

async function assertMobileFieldPanel(page, viewport) {
  const panel = page.locator("#field-panel");
  const collapsed = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visibleChildren = Array.from(element.children).filter((child) => {
      const childStyle = getComputedStyle(child);
      return childStyle.display !== "none" && childStyle.visibility !== "hidden";
    });
    const lastVisible = visibleChildren[visibleChildren.length - 1];
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      maxHeight: parseFloat(style.maxHeight),
      overflowY: style.overflowY,
      lastVisibleBottom: lastVisible?.getBoundingClientRect().bottom ?? rect.top,
      paddingBottom: parseFloat(style.paddingBottom),
      borderBottom: parseFloat(style.borderBottomWidth),
    };
  });
  assert.ok(Math.abs(collapsed.top - 184) <= 1, `${viewport.width}x${viewport.height}: field panel starts at the mobile content offset`);
  assert.ok(Math.abs(collapsed.maxHeight - (viewport.height - 242)) <= 1, `${viewport.width}x${viewport.height}: field panel max-height matches the mobile viewport cap`);
  assert.ok(collapsed.height <= collapsed.maxHeight + 1, `${viewport.width}x${viewport.height}: collapsed field panel respects max-height`);
  const collapsedOverflow = collapsed.scrollHeight > collapsed.clientHeight + 1;
  if (collapsedOverflow) assert.ok(Math.abs(collapsed.height - collapsed.maxHeight) <= 1, `${viewport.width}x${viewport.height}: collapsed overflow fills only the bounded scroll cap`);
  else {
    const contentGap = collapsed.bottom - collapsed.lastVisibleBottom - collapsed.paddingBottom - collapsed.borderBottom;
    assert.ok(contentGap >= -1 && contentGap <= 2, `${viewport.width}x${viewport.height}: collapsed field panel hugs its final visible content`);
    assert.ok(Math.abs(collapsed.clientHeight - collapsed.scrollHeight) <= 1, `${viewport.width}x${viewport.height}: collapsed field panel has no hidden overflow`);
  }
  assert.ok(collapsed.bottom <= viewport.height + 1, `${viewport.width}x${viewport.height}: collapsed field panel stays inside the viewport`);
  assert.equal(collapsed.overflowY, "auto", `${viewport.width}x${viewport.height}: field panel exposes scrolling for expanded content`);

  const trend = page.locator("#inspect-field");
  await trend.click();
  assert.equal(await trend.getAttribute("aria-expanded"), "true");
  const expanded = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { top: rect.top, bottom: rect.bottom, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: style.overflowY };
  });
  assert.equal(expanded.overflowY, "auto", `${viewport.width}x${viewport.height}: expanded trend remains scrollable`);
  assert.ok(expanded.scrollHeight >= expanded.clientHeight, `${viewport.width}x${viewport.height}: expanded trend has measurable content`);
  assert.ok(expanded.bottom <= viewport.height + 1, `${viewport.width}x${viewport.height}: expanded field panel stays inside the viewport`);

  await page.locator(".field-handoff").scrollIntoViewIfNeeded();
  const handoff = await page.locator(".field-handoff").boundingBox();
  assert.ok(handoff && handoff.y >= expanded.top - 1 && handoff.y + handoff.height <= expanded.bottom + 1, `${viewport.width}x${viewport.height}: field handoff is reachable within the panel`);
  await trend.scrollIntoViewIfNeeded();
  const collapse = await trend.boundingBox();
  assert.ok(collapse && collapse.y >= expanded.top - 1 && collapse.y + collapse.height <= expanded.bottom + 1, `${viewport.width}x${viewport.height}: trend collapse control is reachable after scrolling`);
  await trend.click();
  assert.equal(await trend.getAttribute("aria-expanded"), "false");
}

async function settle(page, progress) { await page.waitForFunction((value) => Math.abs(window.__agriscope.snapshot().p - value) < 0.001, progress, { timeout: 60000 }); }

async function userScroll(page, progress) {
  const targetTop = await page.evaluate((value) => {
    const root = document.querySelector(".cinematic"); const journey = document.querySelector("#journey");
    if (!root || !journey) throw new Error("Cinematic journey geometry is unavailable");
    const range = Math.max(1, journey.offsetHeight - innerHeight);
    const top = root.offsetTop + value * range;
    window.scrollTo(0, top);
    return top;
  }, progress);
  await page.waitForFunction((target) => {
    const root = document.querySelector(".cinematic"); const journey = document.querySelector("#journey");
    if (!root || !journey) return false;
    const range = Math.max(1, journey.offsetHeight - innerHeight);
    const expected = Number(((scrollY - root.offsetTop) / range).toFixed(6));
    return Math.abs(scrollY - target) < 1 && window.__agriscope.snapshot().p === expected;
  }, targetTop, { timeout: 60000 });
  return state(page);
}

function assertSameState(actual, expected, label) {
  for (const key of ["p", "shot", "fov", "roll", "cloudOpacity", "cloudRotation", "earthOpacity", "atmosphere", "starsOpacity", "starsVisible", "fieldOpacity", "drawCalls", "triangles", "assets", "spacecraftVisible"]) assert.deepEqual(actual[key], expected[key], `${label}: ${key}`);
  for (const key of ["camera", "look", "attitude", "spacecraftPosition", "viewport"]) assert.deepEqual(actual[key], expected[key], `${label}: ${key}`);
}

async function assertHandoffCheckpoints(page, viewport) {
  const smooth = (start, end, progress) => {
    const t = Math.min(1, Math.max(0, (progress - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  const check = async (progress, label) => {
    const snapshot = await checkpoint(page, progress); assertSnapshot(snapshot, viewport, `handoff ${label}`);
    const actual = snapshot.p;
    const range = await page.evaluate(() => Math.max(1, document.querySelector("#journey").offsetHeight - innerHeight));
    assert.ok(Math.abs(actual - progress) <= 1 / range + 0.00001, `Handoff checkpoint ${label} is within one scroll pixel`);
    const style = await page.locator("#field-panel").evaluate((element) => { const computed = getComputedStyle(element); return { opacity: Number(computed.opacity), visibility: computed.visibility, inert: element.inert }; });
    const expectedOpacity = smooth(0.88, 0.95, actual);
    assert.ok(Math.abs(style.opacity - expectedOpacity) < 0.02, `Field handoff opacity at actual p=${actual}`);
    assert.equal(style.visibility, expectedOpacity > 0 ? "visible" : "hidden", `Field handoff visibility at actual p=${actual}`);
    assert.equal(style.inert, expectedOpacity < 0.5, `Field handoff inert state at actual p=${actual}`);
    return snapshot;
  };
  await check(0.8799, "before fade");
  await check(0.88, "fade start");
  await check(0.915, "midpoint");
  await check(HANDOFF, "handoff");
  const pixels = await page.evaluate(() => {
    const root = document.querySelector(".cinematic"); const journey = document.querySelector("#journey");
    const range = Math.max(1, journey.offsetHeight - innerHeight); const boundary = root.offsetTop + 0.88 * range;
    let below = Math.floor(boundary); while ((below - root.offsetTop) / range >= 0.88) below -= 1;
    let above = Math.ceil(boundary); while ((above - root.offsetTop) / range <= 0.88) above += 1;
    return { below, above };
  });
  await page.evaluate((top) => window.scrollTo(0, top), pixels.below);
  await page.waitForFunction(() => window.__agriscope.snapshot().p < 0.88);
  const below = await state(page); assertSnapshot(below, viewport, "handoff nearest pixel below .88");
  assert.equal(await page.locator("#field-panel").evaluate((element) => element.inert), true, "Nearest pixel below .88 remains inert");
  await page.evaluate((top) => window.scrollTo(0, top), pixels.above);
  await page.waitForFunction(() => window.__agriscope.snapshot().p > 0.88);
  const above = await state(page); assertSnapshot(above, viewport, "handoff nearest pixel above .88");
  assert.equal(await page.locator("#field-panel").evaluate((element) => element.inert), true, "Nearest pixel above .88 remains inert until half opacity");
  await checkpoint(page, HANDOFF);
  return state(page);
}

async function assertLayout(page) {
  const links = await page.locator("header nav a").evaluateAll((elements) => elements.map((element) => element.getAttribute("href")));
  assert.deepEqual([...links].sort(), ["#field", "#mission", "/login?mode=login"].sort(), "Header navigation is limited to field, mission, and login");
  assert.equal(await page.locator(".chapter-anchor").count(), 5); assert.equal(await page.locator(".chapter-anchor h2.sr-only").count(), 5); assert.equal(await page.locator("#rail button").count(), 5);
  for (const box of await page.locator("#rail button").evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return [rect.width, rect.height]; }))) assert.ok(box[0] >= 44 && box[1] >= 44, "Rail controls retain a 44px touch target");
  assert.equal(await page.locator(".field-handoff").getAttribute("href"), "/login"); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow");
}

function assertFailureErrors(failure, errors) {
  const pattern = { webgl: /webgl|context|renderer|3d/i, texture: /load|texture|earth-day|failed|abort|net::err/i }[failure];
  if (failure === "module") {
    assert.ok(errors.every((error) => /load|module|failed|abort|net::err/i.test(error)), "Module failure has no unexpected runtime errors");
    return;
  }
  assert.ok(errors.some((error) => pattern.test(error)), `${failure} failure reports its expected error pattern`);
  assert.ok(errors.every((error) => pattern.test(error) || (failure === "texture" && error === "[AgriScope] Event")), `${failure} failure has no unexpected runtime errors — ${errors.join(" | ")}`);
}

try {
  for (const viewport of viewports) {
    const mobile = viewport.width < 760; const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile }); contexts.push(context);
    const page = await context.newPage(); const normalMonitor = monitor(page);
    const cinematicRequests = []; page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.includes("/cinematic/")) cinematicRequests.push(path); });
    const apiRequests = []; page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
    await page.goto(`${url}?qa=1`); await ready(page, viewport); await assertLayout(page);
    assert.deepEqual(apiRequests, [], "Public cinematic does not call the API");
    assert.equal(cinematicRequests.some((path) => /native-descent|native-[^/]+\.js$|lab-timeline\.js|models\/(farmland|tree|scene4-)|survey-corridor|descent-atmosphere/.test(path)), false, "Five-shot runtime does not load retired native or field-art assets");

    const forward = [];
    for (const [index, point] of SHOT_POINTS.entries()) {
      const snapshot = await checkpoint(page, point); assertSnapshot(snapshot, viewport, `shot ${index + 1}`); assert.equal(snapshot.shot, index + 1);
      forward.push({ snapshot, pixels: await page.screenshot() }); await save(page, `${viewport.width}x${viewport.height}-p-${String(point).replace(".", "")}`);
      if (index === 4) { assert.equal(await page.locator("#instrument").evaluate((element) => getComputedStyle(element).visibility), "visible"); assert.ok(Number(await page.locator("#instrument").evaluate((element) => getComputedStyle(element).opacity)) > 0); }
    }
    await assertHandoffCheckpoints(page, viewport); await save(page, `${viewport.width}x${viewport.height}-p-95`);
    assert.equal(await page.locator("#narrative").evaluate((element) => getComputedStyle(element).opacity), "0"); assert.equal(await page.locator("#narrative").evaluate((element) => element.inert), true); assert.equal(await page.locator("#instrument").evaluate((element) => getComputedStyle(element).visibility), "hidden");
    const metrics = await page.locator("#field-panel .metrics b").allTextContents(); assert.ok(metrics.some((value) => value.includes("18.4"))); assert.ok(metrics.some((value) => value.includes("0.71"))); assert.match(await page.locator("#field-panel").textContent(), /ข้อมูลสาธิต/);
    const trend = page.locator("#inspect-field"); assert.equal(await trend.getAttribute("aria-expanded"), "false"); await trend.click(); assert.equal(await trend.getAttribute("aria-expanded"), "true"); assert.equal(await page.locator("#trend").isVisible(), true); await trend.click(); assert.equal(await trend.getAttribute("aria-expanded"), "false");
    if (mobile) await assertMobileFieldPanel(page, viewport);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    for (let index = forward.length - 1; index >= 0; index -= 1) { const reverse = await checkpoint(page, SHOT_POINTS[index]); assertSnapshot(reverse, viewport, `reverse shot ${index + 1}`); assertSameState(reverse, forward[index].snapshot, `reverse shot ${index + 1}`); assert.deepEqual(await page.screenshot(), forward[index].pixels); }
    await checkpoint(page, HANDOFF); await page.locator("#inspect-field").focus(); await checkpoint(page, 0.78); assert.notEqual(await page.evaluate(() => document.activeElement?.id), "inspect-field");
    await page.locator("#rail button").nth(4).click(); await settle(page, 0.78); assert.equal((await state(page)).shot, 5);

    const userForward = []; for (const point of SHOT_POINTS) { const snapshot = await userScroll(page, point); assertSnapshot(snapshot, viewport, `user-scroll forward ${point}`); userForward.push(snapshot); }
    for (let index = userForward.length - 1; index >= 0; index -= 1) { const snapshot = await userScroll(page, SHOT_POINTS[index]); assertSnapshot(snapshot, viewport, `user-scroll reverse ${SHOT_POINTS[index]}`); assertSameState(snapshot, userForward[index], `user-scroll reverse ${SHOT_POINTS[index]}`); }
    await page.goto(`${url}?qa=1#mission`); await ready(page, viewport); await settle(page, 0.34); assert.ok(Math.abs((await state(page)).p - 0.34) < 0.02);
    await page.goto(`${url}?qa=1#field`); await ready(page, viewport); await settle(page, HANDOFF); assert.ok(Math.abs((await state(page)).p - HANDOFF) < 0.02); await page.getByRole("link", { name: "แปลงเกษตร", exact: true }).click(); await settle(page, HANDOFF); await page.waitForFunction(() => document.activeElement?.id === "inspect-field");
    await page.goto(`${url}?qa=1&shot=5`); await ready(page, viewport); await settle(page, 0.78); assert.equal((await state(page)).shot, 5);
    const resized = { width: viewport.height, height: viewport.width }; await page.setViewportSize(resized); const resizedState = await checkpoint(page, 0.78); assert.deepEqual(resizedState.viewport, [resized.width, resized.height]); assertSnapshot(resizedState, resized, "resized"); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.setViewportSize(viewport);
    await page.goto(`${url}?qa=1`); await ready(page, viewport); await page.getByRole("link", { name: "เข้าสู่ระบบ", exact: true }).first().click(); await page.waitForURL(/\/login\?mode=login$/); assert.equal(await page.locator(".cinematic canvas").count(), 0); await page.goBack(); await ready(page, viewport); assert.equal(await page.locator(".cinematic canvas").count(), 1); assert.equal(await page.locator("#rail button").count(), 5); assert.deepEqual(normalMonitor.networkErrors, [], "Normal runtime has no failed requests or HTTP errors");
    report.viewports.push({ viewport, captures: ["0", ".16", ".34", ".55", ".78", ".95"], checks: ["five checkpoints and reverse pixel/state determinism", "globe/camera/geometry/render invariants", "handoff focus, trend, navigation, resize, scroll, and remount", ...(mobile ? ["mobile field-panel content-height, scroll cap, and reachable controls"] : [])] }); await context.close();
  }

  const textureCap = 4096;
  let page;
  const lowGpu = await browser.newContext({ viewport: viewports[1] }); contexts.push(lowGpu);
  page = await lowGpu.newPage(); const lowGpuMonitor = monitor(page);
  await installTextureProbe(page, textureCap);
  await page.goto(`${url}?qa=1`); await ready(page, viewports[1]);
  const authored = await authoredTextureDimensions(page);
  for (const { file, width, height } of authored) {
    assert.ok(finite(width) && finite(height) && width > 0 && height > 0, `${file}: authored image dimensions are finite`);
    assert.ok(Math.abs(width / height - 2) < 0.001, `${file}: authored image aspect ratio remains 2:1`);
  }
  const textureProbe = await page.evaluate(() => window.__agriscopeTextureProbe);
  assert.ok(textureProbe.contexts > 0, "Low GPU-cap run created a real WebGL context");
  assert.ok(textureProbe.uploads.length > 0, "Low GPU-cap run observed real texture uploads");
  for (const { width, height } of textureProbe.uploads) {
    assert.ok(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0, "Uploaded texture dimensions are finite positive integers");
    assert.ok(width <= textureCap && height <= textureCap, `Uploaded texture ${width}x${height} stays within maxTextureSize ${textureCap}`);
  }
  const authoredUploads = textureProbe.uploads.filter(({ imageSource, width, height }) => imageSource && width >= 1024 && height >= 512);
  assert.ok(authoredUploads.some(({ width, height }) => width === textureCap && height === textureCap / 2), "Oversized authored texture is uploaded at the capped 2:1 dimensions");
  assert.ok(authoredUploads.every(({ width, height }) => Math.abs(width / height - 2) < 0.001), "Uploaded authored image/canvas textures preserve their 2:1 aspect ratio");
  report.textureUploads = {
    cap: textureCap,
    count: textureProbe.uploads.length,
    maxWidth: Math.max(...textureProbe.uploads.map(({ width }) => width)),
    maxHeight: Math.max(...textureProbe.uploads.map(({ height }) => height)),
    authored: authoredUploads.map(({ kind, width, height, sourceKind }) => ({ kind, width, height, sourceKind })),
  };
  await save(page, "low-cap-4096-p-0");
  assert.deepEqual(lowGpuMonitor.networkErrors, [], "Low GPU-cap runtime has no failed requests or HTTP errors");
  assert.deepEqual(lowGpuMonitor.runtimeErrors, [], "Low GPU-cap runtime has no WebGL or shader errors");
  await lowGpu.close(); report.checks.push("4096px maxTextureSize cap preserves real WebGL rendering and texture dimensions");

  const reduced = await browser.newContext({ viewport: viewports[1], reducedMotion: "reduce" }); contexts.push(reduced); page = await reduced.newPage(); monitor(page); await page.goto(`${url}?qa=1`); await staticReady(page); assert.equal(await page.locator("#motion").getAttribute("aria-pressed"), "true"); await page.locator("#resume").click(); await ready(page, viewports[1]); report.checks.push("reduced motion fallback and opt-in"); await reduced.close();
  const motionParam = await browser.newContext({ viewport: viewports[1] }); contexts.push(motionParam); page = await motionParam.newPage(); monitor(page); await page.goto(`${url}?qa=1&motion=reduce`); await staticReady(page); assert.equal(await page.locator("#motion").getAttribute("aria-pressed"), "true"); await page.locator("#resume").click(); await ready(page, viewports[1]); report.checks.push("motion=reduce query fallback and opt-in"); await motionParam.close();
  const nojs = await browser.newContext({ viewport: viewports[1], javaScriptEnabled: false }); contexts.push(nojs); page = await nojs.newPage(); await page.goto(url); assert.equal(await page.locator("#fallback").isVisible(), true); assert.equal(await page.locator(".cinematic canvas").count(), 0); assert.equal(await page.locator("#motion").isVisible(), false); assert.equal(await page.locator("#fallback .text-link").getAttribute("href"), "/login"); await assertStaticSample(page); report.checks.push("no-JavaScript synthetic sample and CTA"); await nojs.close();
  for (const failure of ["module", "webgl", "texture"]) {
    const context = await browser.newContext({ viewport: viewports[1] }); contexts.push(context); page = await context.newPage(); const failureMonitor = monitor(page, false); let intercepted = 0;
    if (failure === "module") await page.route("**/cinematic/main.js", (route) => { intercepted += 1; return route.abort(); });
    if (failure === "webgl") await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) { if (type.includes("webgl")) return null; return original.call(this, type, ...args); }; });
    if (failure === "texture") await page.route("**/cinematic/textures/earth-day.jpg", (route) => { intercepted += 1; return route.abort(); });
    await page.goto(`${url}?qa=1`); if (failure === "module") { await page.waitForSelector("#fallback-reason"); assert.match(await page.locator("#fallback-reason").textContent(), /โหลดประสบการณ์ 3D ไม่สำเร็จ/); } else await staticReady(page);
    if (failure !== "webgl") assert.equal(intercepted, 1); assert.equal(await page.locator("#resume").isVisible(), false); assert.equal(await page.locator(".cinematic canvas").count(), 0); await assertStaticSample(page); assertFailureErrors(failure, failureMonitor.runtimeErrors); await context.close(); report.checks.push(`${failure} fallback remains readable`);
  }
  const resizeFailure = await browser.newContext({ viewport: viewports[1] }); contexts.push(resizeFailure); page = await resizeFailure.newPage(); const resizeFailureMonitor = monitor(page, false);
  await installTextureProbe(page, textureCap, { failResizeContext: true });
  await page.goto(`${url}?qa=1`); await staticReady(page);
  assert.equal(await page.locator("#rail button").count(), 0, "Texture resize failure disposes the rail controls");
  assert.equal(await page.locator(".cinematic canvas").count(), 0, "Texture resize failure removes the renderer canvas");
  assertFailureErrors("texture", resizeFailureMonitor.runtimeErrors);
  await resizeFailure.close(); report.checks.push("texture resize context failure uses the static fallback and disposes runtime DOM");
  assert.deepEqual(report.errors, [], "No normal runtime or shader errors"); report.status = "PASS"; console.log(`PASS ${report.checks.length} cinematic browser checks`);
} catch (error) {
  report.status = "FAIL"; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
  for (const context of contexts) if (context.pages().length) await context.close().catch(() => {});
  await writeFile(resolve(evidence, "browser-report.json"), JSON.stringify(report, null, 2)); await browser.close();
}
