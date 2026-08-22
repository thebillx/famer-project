import { expect, test } from "@playwright/test";

test("farmer creates farm, draws field, saves, and sees it after reload", async ({ page }) => {
  const email = `field-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("StrongPass12345");
  await page.getByLabel("Your name").fill("Field Farmer");
  await page.getByLabel("Organization name").fill("Field Org");
  await page.locator("form").getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/farms$/);

  await page.getByRole("link", { name: "Create farm" }).click();
  await page.getByLabel("Farm name").fill("North Farm");
  await page.getByLabel("Province").fill("Chiang Mai");
  await page.getByRole("button", { name: "Save farm" }).click();
  await expect(page.getByRole("heading", { name: "North Farm" })).toBeVisible();

  await page.getByRole("link", { name: "Draw first field" }).click();
  await expect(page.getByRole("heading", { name: "Draw field" })).toBeVisible();
  const map = page.locator(".maplibregl-canvas");
  const mapContainer = page.getByLabel("Field map");
  await expect(mapContainer).toHaveAttribute("data-map-style-url", /tiles\.openfreemap\.org|style/);
  const box = await map.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await map.click({ position: { x: box.width * 0.35, y: box.height * 0.35 } });
  await map.click({ position: { x: box.width * 0.65, y: box.height * 0.35 } });
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "2");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.52, { steps: 4 });
  await page.mouse.up();
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "2");
  await map.click({ position: { x: box.width * 0.65, y: box.height * 0.65 } });
  await map.click({ position: { x: box.width * 0.35, y: box.height * 0.65 } });
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "4");
  await page.getByRole("button", { name: "Save field" }).click();

  await expect(page.getByText("Field 1")).toBeVisible();
  await expect(page.getByText(/sqm \/ .* rai/)).toBeVisible();
  await page.getByRole("button", { name: "ตรวจสอบภาพดาวเทียมล่าสุด" }).click();
  await expect(page.getByText("พบภาพล่าสุด")).toBeVisible();
  await expect(page.getByText("Sentinel-2 Level-2A", { exact: true })).toBeVisible();
  await expect(page.getByText("12.4%")).toBeVisible();
  await page.getByText("Product / item ID").click();
  await expect(page.getByText("S2A_MSIL2A_20260730T034541_E2E")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Field 1")).toBeVisible();
  await expect(page.getByText(/sqm \/ .* rai/)).toBeVisible();
  await expect(page.getByText("พบภาพล่าสุด")).toBeVisible();
  await expect(page.getByText("Sentinel-2 Level-2A", { exact: true })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});
