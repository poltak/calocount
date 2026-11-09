import { defineConfig, devices } from "@playwright/test";
import {
  BACKEND_ORIGIN,
  FRONTEND_ORIGIN,
  FRONTEND_PORT,
} from "./src/features/core/tests/browser/origins.js";

/** The build that the browser tests load. Git ignores this directory. */
const BUILD_DIRECTORY = ".browser-test/dist";

type BlackBoxTarget = "legacy" | "next";

function readBlackBoxTarget(value: string | undefined): BlackBoxTarget {
  const target = value === undefined || value === "" ? "legacy" : value;
  if (target !== "legacy" && target !== "next") {
    throw new Error(`BLACK_BOX_TARGET must be legacy or next, not ${target}`);
  }
  return target;
}

/**
 * The app that the tests run against. The tests stay the same on both, because
 * they know only what a user sees.
 *
 * - `legacy`: the old app in `legacy/`, on two local Workers. See
 *   `legacy/scripts/black-box-serve.mjs`.
 * - `next`: the new app in `backend/` and `frontend/`.
 *
 * The default is `legacy` until the new app has each workflow. The change that
 * makes `next` the default deletes the `legacy` paths here and in the fixture.
 */
// oxlint-disable-next-line node/no-process-env -- Playwright runs this file in Node, outside the app, and a run sets its target here.
const target = readBlackBoxTarget(process.env["BLACK_BOX_TARGET"]);
// oxlint-disable-next-line node/no-process-env -- As above. Each worktree can run the old app on ports of its own.
const LEGACY_PORT = Number(process.env["LEGACY_BLACK_BOX_PORT"] || 4274);
/** Use localhost, not 127.0.0.1: a WebAuthn RP ID cannot be an IP address. */
const LEGACY_OWNER_ORIGIN = `http://localhost:${LEGACY_PORT}`;
const LEGACY_PASSKEY_ORIGIN = `http://localhost:${LEGACY_PORT + 1}`;

const legacy = {
  // The template's own tests are for the new app's email sign-in.
  testIgnore: [
    "**/auth/black-box-tests/session.spec.ts",
    "**/auth/black-box-tests/sign-up.spec.ts",
    "**/core/tests/browser/**",
  ],
  baseURL: LEGACY_OWNER_ORIGIN,
  webServer: {
    command: `pnpm run black-box:serve --owner-port ${LEGACY_PORT} --passkey-port ${LEGACY_PORT + 1}`,
    cwd: "../legacy",
    url: `${LEGACY_PASSKEY_ORIGIN}/api/auth/status`,
    reuseExistingServer: false,
    // The first run builds the old app.
    timeout: 300_000,
  },
};

const next = {
  testIgnore: [],
  baseURL: FRONTEND_ORIGIN,
  webServer: {
    // Build the frontend with the backend's origin in it, then serve the
    // files as a static host does.
    command: `vite build --outDir ${BUILD_DIRECTORY} && vite preview --outDir ${BUILD_DIRECTORY} --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
    env: { VITE_API_BASE_URL: BACKEND_ORIGIN },
    url: FRONTEND_ORIGIN,
    reuseExistingServer: false,
  },
};

const app = target === "legacy" ? legacy : next;

export default defineConfig({
  metadata: {
    blackBoxTarget: target,
    legacyOwnerOrigin: LEGACY_OWNER_ORIGIN,
    legacyPasskeyOrigin: LEGACY_PASSKEY_ORIGIN,
  },
  // The build checks in `core/tests/browser/`, and the black box tests in each
  // feature's `black-box-tests/` directory.
  testDir: "src/features",
  // Black-box tests, and API black-box tests (docs/agents/project/rules.md).
  testMatch: ["**/*.spec.ts", "**/*.api-spec.ts"],
  testIgnore: app.testIgnore,
  outputDir: ".browser-test/results",
  // The build has one backend address in it. Each test file or test starts
  // its own backend there, so only one can run at a time. The old app has one
  // database for each Worker, so the same holds there.
  workers: 1,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: app.baseURL,
    // The owner's day and the browser's day are the same in each test.
    timezoneId: "UTC",
    // A failed test leaves a trace in the output directory, to open with
    // `pnpm --filter frontend exec playwright show-trace <file>`.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: app.webServer,
});
