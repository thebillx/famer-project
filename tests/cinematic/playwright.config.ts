import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../e2e",
  testMatch: ["landing-001.spec.ts", "farms-list-001.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: process.env.CINEMATIC_URL ?? "http://127.0.0.1:5180",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  outputDir: process.env.CINEMATIC_EVIDENCE
    ? `${process.env.CINEMATIC_EVIDENCE}/regression-results`
    : "../../test-results/cinematic",
});
