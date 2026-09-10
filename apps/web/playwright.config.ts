import { defineConfig, devices } from "@playwright/test";

const pythonCommand = JSON.stringify(process.env.AGRISCOPE_PYTHON ?? ".venv/bin/python");

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
      command: `${pythonCommand} -m uvicorn tests.e2e.stac_mock_server:app --host 127.0.0.1 --port 8765`,
      url: "http://127.0.0.1:8765/health",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 30_000
    },
    {
      command:
        `CDSE_STAC_URL=http://127.0.0.1:8765/search CDSE_CLIENT_ID=e2e-client CDSE_CLIENT_SECRET=e2e-secret CDSE_TOKEN_URL=http://127.0.0.1:8765/token CDSE_PROCESS_URL=http://127.0.0.1:8765/process CDSE_STATISTICAL_URL=http://127.0.0.1:8765/statistics ${pythonCommand} -m uvicorn apps.api.agriscope_api.main:app --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/health/live",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 30_000
    },
    {
      command:
        "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty npm -w apps/web run build && npm -w apps/web run start",
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
    },
    {
      name: "mobile-observation",
      testMatch: /field-workspace-001\.spec\.ts/,
      use: { ...devices["Pixel 5"] }
    }
  ]
});
