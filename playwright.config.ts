import { defineConfig, devices } from "@playwright/test";

const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = configuredBaseURL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  globalSetup: "./scripts/playwright-global-setup.mjs",
  globalTeardown: "./scripts/playwright-global-teardown.mjs",
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: configuredBaseURL
    ? undefined
    : {
        command: "node scripts/run-local-dev.mjs --port 3000",
        url: `${baseURL}/dev/auth`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
