#!/usr/bin/env node
// Serves the new app for the black-box tests in frontend/ (see
// frontend/playwright.config.ts). It builds the frontend for the same origin,
// gives the Worker an empty local D1 with each migration, and starts the Worker
// of the root wrangler.jsonc with a known setup code and the reset route on.
//
//   node scripts/black-box-next.mjs --port 4284
//
// The port comes from `NEXT_BLACK_BOX_PORT` when `--port` is missing, and the
// default is 4284. The process stays in the foreground until Playwright stops
// it. The state is in `.wrangler/black-box/`, which Git ignores.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  prepareState,
  root,
  startWorker,
  stopWorker,
  waitForUrl,
} from "./local-worker.mjs";

/** The setup code of the Worker. The fixture reads the same value. */
const BLACK_BOX_SETUP_CODE = "black-box-setup-code";
const STATE_DIRECTORY = path.join(root, ".wrangler", "black-box");

const { values } = parseArgs({
  options: {
    port: {
      type: "string",
      default: process.env.NEXT_BLACK_BOX_PORT || "4284",
    },
    "skip-build": { type: "boolean", default: false },
  },
});
const port = Number(values.port);

if (!values["skip-build"]) {
  // `pnpm run build` builds the frontend with the page's own origin as the API.
  execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
}
prepareState({ persistTo: STATE_DIRECTORY });
const worker = startWorker({
  port,
  persistTo: STATE_DIRECTORY,
  vars: {
    CALOCOUNT_SETUP_CODE: BLACK_BOX_SETUP_CODE,
    CALOCOUNT_OWNER_KEY: "default",
    // Turns on the reset route. Only this script sets it.
    CALOCOUNT_BLACK_BOX: "true",
  },
});

function stop(code) {
  stopWorker(worker);
  process.exit(code);
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
worker.on("exit", (code) => {
  console.error(`black-box-next: the Worker stopped (${code})`);
  process.exit(code ?? 1);
});

await waitForUrl({ url: `http://localhost:${port}/api/auth/status` });
console.log(`black-box-next: the Worker answers on ${port}`);
