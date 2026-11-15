import { defineConfig, devices } from "@playwright/test";
import {
  FIRST_PORT,
  WORKER_COUNT,
  workerOrigin,
} from "./src/features/core/tests/browser/worker-origin.js";

/**
 * The app that the tests run against: the app in `backend/` and `frontend/`,
 * as Workers that each serve the API and the built frontend on one origin,
 * one Worker for each test worker. See `scripts/black-box-next.mjs`.
 */
const webServer = {
  // Builds the frontend, migrates a fresh local D1 for each Worker, and starts the Workers.
  command: `node scripts/black-box-next.mjs --port ${FIRST_PORT} --workers ${WORKER_COUNT}`,
  cwd: "..",
  // The script prints this line when each Worker answers.
  wait: { stdout: /black-box-next: each Worker answers/ },
  reuseExistingServer: false,
  // The first run builds the backend and the frontend.
  timeout: 300_000,
};

export default defineConfig({
  // The build checks in `core/tests/browser/`, and the black-box tests in each
  // feature's `black-box-tests/` directory.
  testDir: "src/features",
  // Black-box tests, and API black-box tests (docs/agents/project/rules.md).
  testMatch: ["**/*.spec.ts", "**/*.api-spec.ts"],
  outputDir: ".browser-test/results",
  // Each test worker has a Worker and a database of its own, so the fixture
  // empties only the database of its own test worker.
  workers: WORKER_COUNT,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    // The `test` of `worker-origin.ts` replaces it with the Worker of each test worker.
    baseURL: workerOrigin(0),
    // The owner's day and the browser's day are the same in each test.
    timezoneId: "UTC",
    // A failed test leaves a trace in the output directory, to open with
    // `pnpm --filter frontend exec playwright show-trace <file>`.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: webServer,
});
