import { defineConfig, devices } from "@playwright/test";
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
 * - `next`: the new app in `backend/` and `frontend/`, as one Worker that
 *   serves the API and the built frontend on one origin. See
 *   `scripts/black-box-next.mjs`.
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
// oxlint-disable-next-line node/no-process-env -- As above. Each worktree can run the new app on a port of its own.
const NEXT_PORT = Number(process.env["NEXT_BLACK_BOX_PORT"] || 4284);
const NEXT_ORIGIN = `http://localhost:${NEXT_PORT}`;

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
  // The build checks in `core/tests/browser/` run here on the Worker, with
  // the passkey sign-in. They do not run on `legacy`.
  testIgnore: [],
  baseURL: NEXT_ORIGIN,
  webServer: {
    // Builds the frontend, migrates a fresh local D1, and starts the Worker.
    command: `node scripts/black-box-next.mjs --port ${NEXT_PORT}`,
    cwd: "..",
    url: `${NEXT_ORIGIN}/api/auth/status`,
    reuseExistingServer: false,
    // The first run builds the backend and the frontend.
    timeout: 300_000,
  },
};

const app = target === "legacy" ? legacy : next;

export default defineConfig({
  metadata: {
    blackBoxTarget: target,
    legacyOwnerOrigin: LEGACY_OWNER_ORIGIN,
    legacyPasskeyOrigin: LEGACY_PASSKEY_ORIGIN,
  },
  // The build checks in `core/tests/browser/`, and the black-box tests in each
  // feature's `black-box-tests/` directory.
  testDir: "src/features",
  // Black-box tests, and API black-box tests (docs/agents/project/rules.md).
  testMatch: ["**/*.spec.ts", "**/*.api-spec.ts"],
  testIgnore: app.testIgnore,
  outputDir: ".browser-test/results",
  // Each Worker has one database for a whole run, and the fixture empties it
  // before each test, so only one test can run at a time.
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
