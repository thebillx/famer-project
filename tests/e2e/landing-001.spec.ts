import { expect, test, type Locator } from "@playwright/test";

type Rgba = { r: number; g: number; b: number; a: number };

function parseCssColor(value: string): Rgba {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw new Error(`Unsupported computed color: ${value}`);
  const channels = match[1]
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 };
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

function renderedBackground(backgroundLayers: readonly string[]): Rgba {
  return [...backgroundLayers]
    .reverse()
    .reduce((background, layer) => composite(parseCssColor(layer), background), {
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
}

function relativeLuminance(color: Rgba): number {
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b);
}

function contrastRatio(foreground: Rgba, background: Rgba): number {
  const flattenedForeground = composite(foreground, background);
  const lighter = Math.max(relativeLuminance(flattenedForeground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(flattenedForeground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function computedColorContext(locator: Locator, backgroundStartsAtParent = false) {
  return locator.evaluate((element, startsAtParent) => {
    const backgrounds: string[] = [];
    let current: Element | null = startsAtParent ? element.parentElement : element;
    while (current) {
      backgrounds.push(getComputedStyle(current).backgroundColor);
      current = current.parentElement;
    }
    const style = getComputedStyle(element);
    return {
      color: style.color,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      backgrounds,
    };
  }, backgroundStartsAtParent);
}

function firstShadowColor(boxShadow: string): Rgba {
  const match = boxShadow.match(/rgba?\([^)]+\)/);
  if (!match) throw new Error(`No color found in computed box shadow: ${boxShadow}`);
  return parseCssColor(match[0]);
}

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

test("renders a public Thai-first landing page without API requests", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1")) apiRequests.push(request.url());
  });

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(/AgriScope Thailand/);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "เห็นข้อมูลแปลงชัดขึ้น ก่อนออกไปดูพื้นที่จริง" })).toBeVisible();

  for (const heading of [
    "จากขอบเขตแปลง สู่ข้อมูลที่พร้อมตรวจสอบ",
    "พื้นฐานข้อมูลแปลงที่ตรวจสอบย้อนกลับได้",
    "ดูข้อเท็จจริงสำคัญของแปลงในที่เดียว",
    "ข้อมูลที่ดี ต้องบอกทั้งสิ่งที่รู้และยังไม่รู้",
    "เริ่มจากขอบเขตที่ชัดเจน แล้วค่อยดูข้อมูลล่าสุด",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }

  await expect(page.getByText("ตัวอย่างข้อมูล").first()).toBeVisible();
  await expect(page.getByText(/ตัวเลขและชื่อแปลงทั้งหมดเป็นข้อมูลสมมติ/).first()).toBeVisible();
  await expect(page.getByText(/ข้อมูลดาวเทียมใช้ประกอบการตรวจแปลงภาคสนาม ไม่ยืนยันโรคพืช/)).toBeVisible();
  await expect(page.getByText(/ข้อมูลไม่เพียงพอ/)).toBeVisible();
  await expect(page.getByText(/Copernicus Data Space Ecosystem/).first()).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("exposes valid CTA destinations and section anchors", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "สมัครใช้งาน" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "เข้าสู่ระบบ", exact: true })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "ดูตัวอย่างข้อมูล" })).toHaveAttribute("href", "#farm-insight");

  for (const id of ["how-it-works", "features", "farm-insight", "trust"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }

  await page.getByRole("link", { name: "ดูตัวอย่างข้อมูล" }).click();
  await expect(page).toHaveURL(/#farm-insight$/);
});

test("keeps keyboard focus visible and honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "ข้ามไปยังเนื้อหา" })).toBeFocused();
  await expect(page.getByRole("link", { name: "ข้ามไปยังเนื้อหา" })).toBeVisible();

  const transitionDuration = await page.getByRole("link", { name: "สมัครใช้งาน" }).evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  );
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);

  await page.getByRole("link", { name: "ข้ามไปยังเนื้อหา" }).press("Enter");
  await expect(page.locator("#main-content")).toBeVisible();
});

test("keeps normal-size section labels and two-tone focus indicators at accessible contrast", async ({ page }) => {
  await page.goto("/");

  for (const label of ["ข้อมูลดาวเทียมเพื่อเกษตรไทย", "เริ่มต้นอย่างเป็นขั้นตอน", "ความสามารถที่มีอยู่วันนี้"]) {
    const context = await computedColorContext(page.getByText(label, { exact: true }));
    const background = renderedBackground(context.backgrounds);
    expect(contrastRatio(parseCssColor(context.color), background), `${label} text contrast`).toBeGreaterThanOrEqual(4.5);
  }

  const primaryNav = page.getByRole("navigation", { name: "เมนูหลัก" });
  await primaryNav.getByRole("link", { name: "ความน่าเชื่อถือ" }).focus();
  await page.keyboard.press("Tab");
  const lightSurfaceLink = page.getByRole("link", { name: "เข้าสู่ระบบ", exact: true });
  await expect(lightSurfaceLink).toBeFocused();
  const lightFocus = await computedColorContext(lightSurfaceLink, true);
  expect(lightFocus.outlineStyle).toBe("solid");
  expect(Number.parseFloat(lightFocus.outlineWidth)).toBeGreaterThanOrEqual(3);
  expect(
    contrastRatio(firstShadowColor(lightFocus.boxShadow), renderedBackground(lightFocus.backgrounds)),
    "dark outer focus ring on light header",
  ).toBeGreaterThanOrEqual(3);

  await page.getByRole("link", { name: "สร้างบัญชีหรือเข้าสู่ระบบ" }).focus();
  await page.keyboard.press("Tab");
  const darkSurfaceLink = page.getByRole("link", { name: "ดูวิธีใช้งานอีกครั้ง" });
  await expect(darkSurfaceLink).toBeFocused();
  const darkFocus = await computedColorContext(darkSurfaceLink, true);
  expect(darkFocus.outlineStyle).toBe("solid");
  expect(Number.parseFloat(darkFocus.outlineWidth)).toBeGreaterThanOrEqual(3);
  expect(
    contrastRatio(parseCssColor(darkFocus.outlineColor), renderedBackground(darkFocus.backgrounds)),
    "white inner focus ring on dark CTA",
  ).toBeGreaterThanOrEqual(3);
});

for (const viewport of viewports) {
  test(`has no horizontal page overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("keeps core content available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("เห็นข้อมูลแปลงชัดขึ้น");
  await expect(page.getByRole("link", { name: "สมัครใช้งาน" })).toHaveAttribute("href", "/login");
  await expect(page.getByText(/ข้อมูลดาวเทียมเพื่อช่วยวางแผนตรวจแปลง ไม่ใช่การวินิจฉัยสภาพพืช/)).toBeVisible();

  await context.close();
});
