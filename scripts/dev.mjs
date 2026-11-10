// `pnpm run dev`: the Worker on the local D1, and the Vite dev server in front
// of it. The browser uses the Vite origin only, and Vite proxies the routes of
// the Worker (see frontend/vite.config.ts). The D1 state stays in
// `.wrangler/state/` between runs. Neither process touches a Cloudflare resource.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const bin = (name) => path.join(root, "node_modules", ".bin", name);
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG_PATH: path.join(root, ".wrangler", "logs"),
};
const workerPort = process.env.DEV_WORKER_PORT || "8787";

// Wrangler stops at start when the assets directory is missing, and the Vite
// dev server serves the pages, so an empty directory is enough.
mkdirSync(path.join(root, "frontend", "dist"), { recursive: true });
execFileSync(bin("wrangler"), ["d1", "migrations", "apply", "DB", "--local"], {
  cwd: root,
  stdio: "inherit",
  env: { ...env, CI: "1" },
});

const children = [
  spawn(
    bin("wrangler"),
    ["dev", "--local", "--ip", "127.0.0.1", "--port", workerPort],
    { cwd: root, stdio: "inherit", env },
  ),
  spawn(
    path.join(root, "frontend", "node_modules", ".bin", "vite"),
    ["--clearScreen", "false"],
    {
      cwd: path.join(root, "frontend"),
      stdio: "inherit",
      env: { ...env, DEV_WORKER_PORT: workerPort },
    },
  ),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code;
}
for (const child of children) child.on("exit", (code) => stop(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
