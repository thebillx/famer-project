import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e",
  testMatch: ["landing-001.spec.ts", "farms-list-001.spec.ts", "cinematic-flow-002.spec.ts", "cinematic-lab-001.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: process.env.CINEMATIC_URL ?? "http://127.0.0.1:5180",
    channel: process.env.CINEMATIC_CHROMIUM ? undefined : "chrome",
    launchOptions: process.env.CINEMATIC_CHROMIUM ? {
      executablePath: process.env.CINEMATIC_CHROMIUM,
      args: process.env.CINEMATIC_SOFTWARE_WEBGL === "1" ? ["--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
    } : undefined,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  outputDir: process.env.CINEMATIC_EVIDENCE
    ? `${process.env.CINEMATIC_EVIDENCE}/regression-results`
    : "../../test-results/cinematic",
});
