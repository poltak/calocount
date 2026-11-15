// Starts the Worker as `pnpm run dev` does, on an empty local D1 with each
// migration applied, and checks that it answers and stops.
//
//   node scripts/check-live-start.mjs
//
// `test:live-start` builds the frontend and the backend first. The check shows
// that the Worker bundles from the root `wrangler.jsonc`, that it builds its
// App from the bindings, and that its first query reaches the migrated tables.
// No other test runs `server/worker.ts`, the live composition root, or the
// config parser. The tests use the test root, on `node:sqlite`.
//
// The state is in `.wrangler/live-start/`, which Git ignores. Nothing here
// uses a Cloudflare resource.
import path from "node:path";
import {
  freePort,
  prepareState,
  root,
  startWorker,
  stopWorker,
  waitForUrl,
} from "./local-worker.mjs";

const TIME_LIMIT_MS = 120_000;
const STATE_DIRECTORY = path.join(root, ".wrangler", "live-start");

async function expectJson({ url, expected }) {
  const response = await fetch(url);
  if (response.status !== expected) {
    throw new Error(
      `GET ${new URL(url).pathname} answered ${response.status}, not ${expected}: ${await response.text()}`,
    );
  }
  return response.json();
}

async function runCheck() {
  prepareState({ persistTo: STATE_DIRECTORY });
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const worker = startWorker({
    port,
    persistTo: STATE_DIRECTORY,
    vars: { CALOCOUNT_SETUP_CODE: "live-start-setup-code" },
  });
  const stopped = new Promise((resolve) => worker.once("exit", resolve));
  const timeLimit = setTimeout(() => {
    console.error(
      `The check did not finish in ${TIME_LIMIT_MS / 1000} seconds.`,
    );
    stopWorker(worker);
    process.exit(1);
  }, TIME_LIMIT_MS);

  try {
    await Promise.race([
      waitForUrl({ url: `${origin}/health` }),
      stopped.then(() => {
        throw new Error("The Worker stopped before it answered.");
      }),
    ]);
    await expectJson({ url: `${origin}/health`, expected: 200 });
    // The readiness route runs a query on the local D1.
    await expectJson({ url: `${origin}/health/ready`, expected: 200 });
    // The status route reads the migrated passkey table.
    const status = await expectJson({
      url: `${origin}/api/auth/status`,
      expected: 200,
    });
    if (status.mode !== "passkey" || status.hasPasskeys !== false) {
      throw new Error(`Unexpected sign-in status: ${JSON.stringify(status)}`);
    }
    console.log("The live Worker started, answered, and stopped.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    clearTimeout(timeLimit);
    stopWorker(worker);
    await stopped;
  }
}

await runCheck();
