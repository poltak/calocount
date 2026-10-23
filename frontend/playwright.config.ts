import { defineConfig, devices } from "@playwright/test";
import {
  BACKEND_ORIGIN,
  FRONTEND_ORIGIN,
  FRONTEND_PORT,
} from "./src/features/core/tests/browser/origins.js";

/** The build that the browser tests load. Git ignores this directory. */
const BUILD_DIRECTORY = ".browser-test/dist";

export default defineConfig({
  // The build checks in `core/tests/browser/`, and the black box tests in each
  // feature's `tests/` directory.
  testDir: "src/features",
  testMatch: "**/*.spec.ts",
  outputDir: ".browser-test/results",
  // The build has one backend address in it. Each test file or test starts
  // its own backend there, so only one can run at a time.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: FRONTEND_ORIGIN,
    // A failed test leaves a trace in the output directory, to open with
    // `pnpm --filter frontend exec playwright show-trace <file>`.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build the frontend with the backend's origin in it, then serve the
    // files as a static host does.
    command: `vite build --outDir ${BUILD_DIRECTORY} && vite preview --outDir ${BUILD_DIRECTORY} --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
    env: { VITE_API_BASE_URL: BACKEND_ORIGIN },
    url: FRONTEND_ORIGIN,
    reuseExistingServer: false,
  },
});
