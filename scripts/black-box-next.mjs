#!/usr/bin/env node
// Serves the new app for the black-box tests in frontend/ (see
// frontend/playwright.config.ts). It builds the frontend for the same origin
// one time, and starts one Worker of the root wrangler.jsonc for each test
// worker, with a known setup code and the reset route on. Each Worker has a
// local D1 of its own with each migration, because a test empties the
// database when it starts, and the test workers run at the same time.
//
//   node scripts/black-box-next.mjs --port 4284 --workers 4
//
// Worker `n` listens on the port plus `n`. The port comes from
// `NEXT_BLACK_BOX_PORT` when `--port` is missing (default 4284), and the count
// from `NEXT_BLACK_BOX_WORKERS` (default 4). The process stays in the
// foreground until Playwright stops it, and prints `READY_LINE` when each
// Worker answers. The state is in `.wrangler/black-box/`, which Git ignores.
import { execFileSync } from "node:child_process";
import { cpSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  freePort,
  prepareState,
  root,
  startWorker,
  stopWorker,
  waitForUrl,
} from "./local-worker.mjs";

/** The setup code of the Workers. The fixture reads the same value. */
const BLACK_BOX_SETUP_CODE = "black-box-setup-code";
const STATE_DIRECTORY = path.join(root, ".wrangler", "black-box");
/** `frontend/playwright.config.ts` waits for this line. */
const READY_LINE = "black-box-next: each Worker answers";

const { values } = parseArgs({
  options: {
    port: {
      type: "string",
      default: process.env.NEXT_BLACK_BOX_PORT || "4284",
    },
    workers: {
      type: "string",
      default: process.env.NEXT_BLACK_BOX_WORKERS || "4",
    },
    "skip-build": { type: "boolean", default: false },
  },
});
const firstPort = Number(values.port);
const workerCount = Number(values.workers);

if (!values["skip-build"]) {
  // `pnpm run build` builds the frontend with the page's own origin as the API.
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
}
// The migrations run one time. Each Worker gets a copy of the migrated state.
const migrated = path.join(STATE_DIRECTORY, "migrated");
prepareState({ persistTo: migrated });
const workers = [];
for (let index = 0; index < workerCount; index += 1) {
  const persistTo = path.join(STATE_DIRECTORY, String(index));
  cpSync(migrated, persistTo, { recursive: true });
  const worker = startWorker({
    port: firstPort + index,
    // Two Workers on the default inspector port do not start.
    inspectorPort: await freePort(),
    persistTo,
    vars: {
      CALOCOUNT_SETUP_CODE: BLACK_BOX_SETUP_CODE,
      CALOCOUNT_OWNER_KEY: "default",
      // Turns on the reset route. Only this script sets it.
      CALOCOUNT_BLACK_BOX: "true",
    },
  });
  worker.on("exit", (code) => {
    console.error(`black-box-next: Worker ${index} stopped (${code})`);
    stop(code ?? 1);
  });
  workers.push(worker);
}

function stop(code) {
  for (const worker of workers) {
    stopWorker(worker);
  }
  process.exit(code);
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

await Promise.all(
  workers.map((_, index) =>
    waitForUrl({
      url: `http://localhost:${firstPort + index}/api/auth/status`,
    }),
  ),
);
console.log(READY_LINE);
