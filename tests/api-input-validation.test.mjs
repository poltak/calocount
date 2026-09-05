import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Use the Worker runtime supplied by the existing Wrangler development tool.
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve("miniflare", {
  paths: [require.resolve("wrangler/package.json")],
}));

test("owner API rejects invalid dates and timezones before database access", async () => {
  const root = new URL("../dist/server/", import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((file) => file.endsWith(".js"));
  // The first module is the entry point. Include dynamic route chunks as well.
  files.sort((left, right) => left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right));
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: files.map((file) => ({ type: "ESModule", path: fileURLToPath(new URL(file, root)) })),
    modulesRoot: fileURLToPath(root),
    compatibilityDate: "2026-08-23",
    compatibilityFlags: ["nodejs_compat"],
    bindings: { CALOCOUNT_ALLOW_LOCAL: "true" },
  }));

  try {
    const request = async ({ path, method, body }) => {
      const response = await runtime.dispatchFetch(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    for (const timezone of ["Not/A_Timezone", "Invalid", "Asia/Ho_Chi_Minh_Typo"]) {
      const response = await request({ path: "/api/settings", method: "PATCH", body: { timezone } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "invalid_field");
    }
    for (const timezone of ["UTC", "Asia/Ho_Chi_Minh", "America/New_York"]) {
      const response = await request({ path: "/api/settings", method: "PATCH", body: { timezone } });
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, "database_unavailable");
    }
    for (const [path, method] of [
      ["/api/meals", "POST"],
      ["/api/meals/example", "PATCH"],
      ["/api/meals/example/copy", "POST"],
    ]) {
      for (const consumedAt of [1e100, -1e100]) {
        const response = await request({ path, method, body: { consumedAt } });
        assert.equal(response.status, 400, `${method} ${path} must reject ${consumedAt}`);
        assert.equal(response.body.error.code, "invalid_field");
      }
      const response = await request({ path, method, body: { consumedAt: 1_800_000_000_000 } });
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, "database_unavailable");
    }
  } finally {
    await runtime.dispose();
  }
});
