import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { startWorker } from "./helpers/worker-runtime.mjs";

const ACCESS = {
  CALOCOUNT_ALLOW_LOCAL: "false",
  CALOCOUNT_ACCESS_TEAM_DOMAIN: "team.example.com",
  CALOCOUNT_ACCESS_AUDIENCE: "api-audience",
  CALOCOUNT_MCP_ACCESS_AUDIENCE: "mcp-audience",
  CALOCOUNT_ALLOWED_EMAIL_SHA256: "a".repeat(64),
};

// Reviewed exceptions to "every API route needs the owner's Access session".
const PUBLIC_ROUTES = new Set(["/api/public/summary", "/api/add-meal"]);

/** Every route handler file under app/api plus /mcp, with the HTTP methods each one exports. */
async function privateRoutes() {
  const appRoot = new URL("../app/", import.meta.url);
  const files = (await readdir(appRoot, { recursive: true }))
    .filter((file) => file.endsWith("route.ts") && (file.startsWith("api/") || file.startsWith("mcp/")));
  const routes = [];
  for (const file of files) {
    const path = "/" + file
      .replace(/\/route\.ts$/, "")
      .replace(/\[\.\.\.[^\]]+\]/g, "nested/example")
      .replace(/\[[^\]]+\]/g, "example");
    if (PUBLIC_ROUTES.has(path)) continue;
    const source = await readFile(new URL(file, appRoot), "utf8");
    const methods = [...source.matchAll(/export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]);
    assert.ok(methods.length > 0, `${file} exports no HTTP method`);
    for (const method of methods) routes.push({ path, method });
  }
  return routes;
}

test("every private route rejects a request without an Access token", async () => {
  const routes = await privateRoutes();
  assert.ok(routes.length >= 15, "expected the API routes to be discovered");
  const worker = await startWorker(ACCESS);
  try {
    for (const { path, method } of routes) {
      const response = await worker.request({ path, method, body: method === "GET" || method === "DELETE" ? undefined : {} });
      assert.equal(response.status, 401, `${method} ${path} must require sign-in`);
      assert.equal(response.body?.error?.code, "unauthorized", `${method} ${path}`);
    }
  } finally {
    await worker.dispose();
  }
});

test("private routes fail closed when owner authentication is not configured", async () => {
  const cases = [
    [{ CALOCOUNT_ALLOW_LOCAL: "false" }, 503, "auth_access_settings_missing"],
    [{ ...ACCESS, CALOCOUNT_ALLOWED_EMAIL_SHA256: "" }, 503, "auth_owner_allowlist_missing"],
    // Local mode is anonymous only when no allowlist is configured at all.
    [{ ...ACCESS, CALOCOUNT_ALLOW_LOCAL: "true" }, 403, "forbidden"],
  ];
  for (const [bindings, status, code] of cases) {
    const worker = await startWorker(bindings);
    try {
      for (const [path, method] of [["/api/dashboard/summary", "GET"], ["/api/meals", "POST"], ["/mcp", "POST"]]) {
        const response = await worker.request({ path, method, body: method === "GET" ? undefined : {} });
        assert.equal(response.status, status, `${method} ${path} with ${code}`);
        assert.equal(response.body?.error?.code, code, `${method} ${path}`);
      }
    } finally {
      await worker.dispose();
    }
  }
});

test("the public routes are read-only and fail closed without an owner key", async () => {
  const worker = await startWorker(ACCESS);
  try {
    for (const path of ["/api/public/summary", "/meal-photos/example"]) {
      const response = await worker.request({ path });
      assert.equal(response.status, 503, path);
      assert.equal(response.body?.error?.code, "public_owner_key_missing", path);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/, path);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const write = await worker.request({ path, method, body: method === "DELETE" ? undefined : {} });
        assert.equal(write.status, 405, `${method} ${path} must not be handled`);
      }
    }
  } finally {
    await worker.dispose();
  }
});

test("the public routes use the configured owner and need no sign-in", async () => {
  const worker = await startWorker({ ...ACCESS, CALOCOUNT_OWNER_KEY: "owner" });
  try {
    // No database is bound, so reaching the database error proves the routes ran without an Access token.
    for (const path of ["/api/public/summary", "/meal-photos/example"]) {
      const response = await worker.request({ path });
      assert.equal(response.status, 503, path);
      assert.equal(response.body?.error?.code, "database_unavailable", path);
    }
    const invalidPhotoId = await worker.request({ path: "/meal-photos/not%20a%20valid%20id" });
    assert.equal(invalidPhotoId.status, 404);
  } finally {
    await worker.dispose();
  }
});

test("the legacy add-meal route needs its bearer token", async () => {
  const withoutToken = await startWorker({ ...ACCESS, CALOCOUNT_OWNER_KEY: "owner" });
  try {
    const response = await withoutToken.request({ path: "/api/add-meal", method: "POST", body: {} });
    assert.equal(response.status, 503);
    assert.equal(response.body?.error?.code, "chatgpt_meal_token_missing");
  } finally {
    await withoutToken.dispose();
  }

  const withToken = await startWorker({ ...ACCESS, CALOCOUNT_OWNER_KEY: "owner", CALOCOUNT_CHATGPT_MEAL_TOKEN: "expected-token" });
  try {
    for (const headers of [{}, { authorization: "Bearer wrong-token" }]) {
      const response = await withToken.request({ path: "/api/add-meal", method: "POST", body: {}, headers });
      assert.equal(response.status, 401);
      assert.equal(response.body?.error?.code, "unauthorized");
    }
  } finally {
    await withToken.dispose();
  }
});

test("authentication failures log only a stable event, code and reason", async () => {
  const worker = await startWorker(ACCESS);
  try {
    await worker.request({
      path: "/api/settings?secret-query=1",
      headers: {
        "cf-access-jwt-assertion": "secret-header.secret-payload.secret-signature",
        "cf-access-authenticated-user-email": "private-owner@example.com",
      },
    });
    await worker.request({ path: "/api/dashboard/summary" });
    assert.equal(worker.logs.length, 2);
    for (const line of worker.logs) {
      assert.deepEqual(JSON.parse(line), {
        event: "calocount_access_jwt_verification_failed",
        code: "token",
        reason: "token_invalid",
      });
    }
  } finally {
    await worker.dispose();
  }
});
