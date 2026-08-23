import { expect, test } from "@playwright/test";

test("farmer creates farm, draws field, saves, and sees it after reload", async ({ page }) => {
  let submittedGeometry: unknown;
  let previewRequests = 0;
  let ndviRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/v1\/farms\/[^/]+\/fields$/.test(new URL(request.url()).pathname)) {
      submittedGeometry = request.postDataJSON()?.geometry;
    }
    if (request.method() === "GET" && /\/api\/v1\/fields\/[^/]+\/satellite\/preview$/.test(new URL(request.url()).pathname)) {
      previewRequests += 1;
    }
    if (request.method() === "GET" && /\/api\/v1\/fields\/[^/]+\/satellite\/ndvi-summary$/.test(new URL(request.url()).pathname)) {
      ndviRequests += 1;
    }
  });
  const email = `field-${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill("StrongPass12345");
  await page.getByLabel("ชื่อของคุณ").fill("Field Farmer");
  await page.getByLabel("ชื่อองค์กร").fill("Field Org");
  await page.locator("form").getByRole("button", { name: "สร้างบัญชี" }).click();
  await expect(page).toHaveURL(/\/farms$/);

  await page.getByRole("link", { name: "สร้างฟาร์มแรก", exact: true }).click();
  await page.getByLabel("Farm name").fill("North Farm");
  await page.getByLabel("Province").fill("Chiang Mai");
  await page.getByRole("button", { name: "Save farm" }).click();
  await expect(page.getByRole("heading", { name: "North Farm" })).toBeVisible();
  const farmId = new URL(page.url()).pathname.split("/").at(-1);
  expect(farmId).toBeTruthy();
  const bypassResult = await page.evaluate(async (currentFarmId) => {
    const csrfToken = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("agriscope_csrf="))
      ?.split("=")[1];
    const outsideResponse = await fetch(`http://localhost:8000/api/v1/farms/${currentFarmId}/fields`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": decodeURIComponent(csrfToken ?? "")
      },
      body: JSON.stringify({
        name: "Outside service bounds",
        geometry: {
          type: "Polygon",
          coordinates: [[[97.33, 13], [97.35, 13], [97.35, 13.01], [97.33, 13.01], [97.33, 13]]]
        }
      })
    });
    const outsideBody = await outsideResponse.json();
    const fieldsResponse = await fetch(`http://localhost:8000/api/v1/farms/${currentFarmId}/fields`, {
      credentials: "include"
    });
    const fields = await fieldsResponse.json();
    return {
      status: outsideResponse.status,
      errorCode: outsideBody.error?.code,
      fieldCount: Array.isArray(fields) ? fields.length : null
    };
  }, farmId);
  expect(bypassResult).toEqual({ status: 422, errorCode: "invalid_geometry", fieldCount: 0 });

  await page.getByRole("link", { name: "เพิ่มแปลงแรก", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Draw field" })).toBeVisible();
  const map = page.locator(".maplibregl-canvas");
  const mapContainer = page.getByLabel("Field map");
  await expect(mapContainer).toHaveAttribute("data-map-style-url", /tiles\.openfreemap\.org|style/);
  await expect(mapContainer).toHaveAttribute("data-map-bounds", "97.34,5.61,105.64,20.47");
  await expect(page.getByText("กำลังโหลดแผนที่...", { exact: true })).toBeHidden();
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
  const coordinatePanel = page.locator("details").filter({ hasText: "เพิ่มจุดด้วยพิกัด" });
  await expect(coordinatePanel).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Delete polygon" }).click();
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "0");

  await coordinatePanel.getByText("เพิ่มจุดด้วยพิกัด", { exact: true }).click();
  const latitude = page.getByLabel("ละติจูด");
  const longitude = page.getByLabel("ลองจิจูด");
  await expect(page.getByText("ช่วง 5.61 ถึง 20.47 — ตัวอย่าง 18.7901", { exact: true })).toBeVisible();
  await expect(page.getByText("ช่วง 97.34 ถึง 105.64 — ตัวอย่าง 98.9801", { exact: true })).toBeVisible();
  const outsideCoordinates = [
    ["13", "97.3399"],
    ["13", "105.6401"],
    ["5.6099", "100"],
    ["20.4701", "100"]
  ];
  for (const [index, [lat, lng]] of outsideCoordinates.entries()) {
    await latitude.fill(lat);
    await longitude.fill(lng);
    await page.getByRole("button", { name: "เพิ่มจุดพิกัด" }).click();
    await expect(
      page.getByText("พิกัดต้องอยู่ในกรอบพื้นที่ให้บริการประเทศไทยโดยประมาณ", { exact: true })
    ).toBeVisible();
    await expect(mapContainer).toHaveAttribute("data-vertex-count", "0");
    if (index === 0) {
      await coordinatePanel.getByText("เพิ่มจุดด้วยพิกัด", { exact: true }).click();
      await expect(coordinatePanel).not.toHaveAttribute("open", "");
      await expect(
        page.getByText("พิกัดต้องอยู่ในกรอบพื้นที่ให้บริการประเทศไทยโดยประมาณ", { exact: true })
      ).toBeVisible();
      await coordinatePanel.getByText("เพิ่มจุดด้วยพิกัด", { exact: true }).click();
    }
  }

  await latitude.fill("18.7901");
  await longitude.fill("98.9801");
  await longitude.press("Enter");
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "1");
  await expect(page.getByText("จุด 1: ละติจูด 18.790100, ลองจิจูด 98.980100")).toBeVisible();

  await latitude.fill("18.7901");
  await longitude.fill("98.9801");
  await page.getByRole("button", { name: "เพิ่มจุดพิกัด" }).click();
  await expect(page.getByText("พิกัดนี้ถูกเพิ่มแล้ว", { exact: true })).toBeVisible();
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "1");

  for (const [lat, lng] of [
    ["18.7901", "98.9811"],
    ["18.7911", "98.9811"],
    ["18.7911", "98.9801"]
  ]) {
    await latitude.fill(lat);
    await longitude.fill(lng);
    await page.getByRole("button", { name: "เพิ่มจุดพิกัด" }).click();
  }
  await expect(mapContainer).toHaveAttribute("data-vertex-count", "4");
  await page.getByRole("button", { name: "Save field" }).click();

  await expect.poll(() => submittedGeometry).toEqual({
    type: "Polygon",
    coordinates: [[
      [98.9801, 18.7901],
      [98.9811, 18.7901],
      [98.9811, 18.7911],
      [98.9801, 18.7911],
      [98.9801, 18.7901]
    ]]
  });

  await expect(page.getByRole("button", { name: /^Field 1/ })).toBeVisible();
  await expect(page.getByText(/ตร\.ม\. \/ .* ไร่/)).toBeVisible();
  await page.getByRole("button", { name: "ตรวจสอบภาพดาวเทียมล่าสุด" }).click();
  await expect(page.getByText("พบภาพล่าสุด")).toBeVisible();
  await expect(page.getByText("Sentinel-2 Level-2A", { exact: true })).toBeVisible();
  await expect(page.getByText("12.4%")).toBeVisible();
  expect(previewRequests).toBe(0);
  expect(ndviRequests).toBe(0);
  await page.getByRole("button", { name: "ดูภาพสีจริงของแปลง" }).click();
  await expect(page.getByRole("img", { name: /ภาพสีจริง Sentinel-2 ของขอบเขตแปลงที่เลือก/ })).toBeVisible();
  await expect(page.getByText(/Copernicus Data Space Ecosystem/)).toBeVisible();
  expect(previewRequests).toBe(1);
  await page.getByRole("button", { name: "ดูสรุป NDVI" }).click();
  const ndviSummary = page.getByRole("region", { name: "สรุป NDVI ของแปลง" });
  await expect(ndviSummary).toContainText("0.440");
  await expect(ndviSummary).toContainText("85.0%");
  await expect(ndviSummary).toContainText("agriscope-ndvi-summary-v1");
  await expect(ndviSummary).toContainText("ไม่ใช่การวินิจฉัย");
  expect(ndviRequests).toBe(1);
  await page.getByText("Product / item ID").click();
  await expect(page.getByText("S2A_MSIL2A_20260730T034541_E2E")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Field 1/ })).toBeVisible();
  await expect(page.getByText(/ตร\.ม\. \/ .* ไร่/)).toBeVisible();
  await expect(page.getByText("พบภาพล่าสุด")).toBeVisible();
  await expect(page.getByText("Sentinel-2 Level-2A", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /ภาพสีจริง Sentinel-2/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "สรุป NDVI ของแปลง" })).toHaveCount(0);
  expect(previewRequests).toBe(1);
  expect(ndviRequests).toBe(1);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});
