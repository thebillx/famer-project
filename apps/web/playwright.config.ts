import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../../tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: ".venv/bin/uvicorn apps.api.agriscope_api.main:app --host 127.0.0.1 --port 8000",
      url: "http://127.0.0.1:8000/health/live",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 30_000
    },
    {
      command: "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm -w apps/web run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 60_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
