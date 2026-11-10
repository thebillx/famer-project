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
    report.viewports.push({ viewport, captures: ["0", ".16", ".34", ".55", ".78", ".95"], checks: ["five checkpoints and reverse pixel/state determinism", "globe/camera/geometry/render invariants", "handoff focus, trend, navigation, resize, scroll, and remount"] }); await context.close();
  }

  const reduced = await browser.newContext({ viewport: viewports[1], reducedMotion: "reduce" }); contexts.push(reduced); let page = await reduced.newPage(); monitor(page); await page.goto(`${url}?qa=1`); await staticReady(page); assert.equal(await page.locator("#motion").getAttribute("aria-pressed"), "true"); await page.locator("#resume").click(); await ready(page, viewports[1]); report.checks.push("reduced motion fallback and opt-in"); await reduced.close();
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
  assert.deepEqual(report.errors, [], "No normal runtime or shader errors"); report.status = "PASS"; console.log(`PASS ${report.checks.length} cinematic browser checks`);
} catch (error) {
  report.status = "FAIL"; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
  for (const context of contexts) if (context.pages().length) await context.close().catch(() => {});
  await writeFile(resolve(evidence, "browser-report.json"), JSON.stringify(report, null, 2)); await browser.close();
}
