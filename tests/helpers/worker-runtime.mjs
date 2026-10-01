import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use the Worker runtime supplied by the existing Wrangler development tool.
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve("miniflare", {
  paths: [require.resolve("wrangler/package.json")],
}));

/** Start the built app Worker with the given bindings. Requests go through the real route handlers. */
export async function startWorker(bindings = {}) {
  const root = new URL("../../dist/server/", import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(".js"));
  // The first module is the entry point. Include dynamic route chunks as well.
  files.sort((left, right) => left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right));
  const logs = [];
  const runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      modules: files.map((file) => ({ type: "ESModule", path: fileURLToPath(new URL(file, root)) })),
      modulesRoot: fileURLToPath(root),
      compatibilityDate: "2026-08-23",
      compatibilityFlags: ["nodejs_compat"],
      bindings,
    }),
    // Collect console output from the Worker instead of printing it.
    handleStructuredLogs({ message }) {
      logs.push(String(message));
    },
  });

  return {
    /** Lines the Worker wrote with console.* so far. */
    logs,
    async request({ path, method = "GET", body, headers = {} }) {
      const response = await runtime.dispatchFetch(`http://localhost${path}`, {
        method,
        headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Not every response is JSON, for example a framework 405.
      }
      return { status: response.status, headers: response.headers, body: json, text };
    },
    dispose: () => runtime.dispose(),
  };
}
