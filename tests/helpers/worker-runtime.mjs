import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use the Worker runtime supplied by the existing Wrangler development tool.
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve("miniflare", {
  paths: [require.resolve("wrangler/package.json")],
}));

/** Apply every migration in drizzle/ to a D1 database, in order. */
async function applyMigrations(database) {
  const directory = new URL("../../drizzle/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.prepare(statement).run();
    }
  }
}

/**
 * Start the built app Worker with the given bindings. Requests go through the real route handlers.
 * With `storage`, the Worker also gets an empty migrated D1 database and an empty R2 bucket.
 */
export async function startWorker(bindings = {}, { storage = false } = {}) {
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
      ...(storage ? { d1Databases: { DB: "calocount-test" }, r2Buckets: { PHOTOS: "calocount-test" } } : {}),
    }),
    // Collect console output from the Worker instead of printing it.
    handleStructuredLogs({ message }) {
      logs.push(String(message));
    },
  });

  if (storage) await applyMigrations(await runtime.getD1Database("DB"));

  return {
    /** Lines the Worker wrote with console.* so far. */
    logs,
    /** Send a request as given, for bodies that are not JSON. */
    fetch: (path, init) => runtime.dispatchFetch(`http://localhost${path}`, init),
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
