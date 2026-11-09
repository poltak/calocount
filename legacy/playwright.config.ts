import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 20_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4178",
    timezoneId: "UTC",
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm exec vite -- --config tests/browser/vite.config.ts",
    url: "http://127.0.0.1:4178",
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
