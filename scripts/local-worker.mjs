// What `check-live-start.mjs` and `black-box-next.mjs` share: an empty local D1
// with the migrations applied, and the Worker of the root `wrangler.jsonc` on
// a local port. Both run Wrangler from `node_modules`, with local state only.
// Neither touches a Cloudflare resource.
import { spawn, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = path.join(root, "node_modules", ".bin", "wrangler");

/** Wrangler without telemetry or prompts, with its log in the ignored `.wrangler/`. */
const wranglerEnv = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG_PATH: path.join(root, ".wrangler", "logs"),
};

/** Make an empty database in `persistTo`, with each file of `backend/migrations`. */
export function prepareState({ persistTo }) {
  rmSync(persistTo, { recursive: true, force: true });
  execFileSync(
    WRANGLER,
    ["d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: wranglerEnv },
  );
}

/** A port that no process listens on right now. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Start the Worker with `wrangler dev`. `vars` become Worker vars for this run
 * only. The child stays in the process group of this script, so that a kill of
 * the group, as Playwright does at the end of a run, also ends Wrangler and the
 * `workerd` below it.
 */
export function startWorker({ port, persistTo, vars }) {
  const varFlags = Object.entries(vars).flatMap(([name, value]) => [
    "--var",
    `${name}:${value}`,
  ]);
  return spawn(
    WRANGLER,
    [
      "dev",
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      persistTo,
      ...varFlags,
    ],
    {
      cwd: root,
      stdio: ["ignore", "inherit", "inherit"],
      env: wranglerEnv,
    },
  );
}

export function stopWorker(child) {
  // Wrangler ends the `workerd` below it when it gets this signal.
  if (child.exitCode === null) child.kill("SIGTERM");
}

/** Resolve when `url` answers with a status below 500; reject after the limit. */
export async function waitForUrl({ url, attempts = 240 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // A request that arrives while the Worker starts can hang, so each try has a limit.
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status < 500) return;
    } catch {
      // The Worker is not listening yet, or did not answer in time.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No answer from ${url}`);
}
