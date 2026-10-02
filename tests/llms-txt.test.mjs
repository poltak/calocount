import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { startWorker } from "./helpers/worker-runtime.mjs";

// llms.txt is the only guide an agent gets, so these tests check what it says
// against the built Worker: a wrong or missing field here is a bug for agents.
const LOCAL = { CALOCOUNT_ALLOW_LOCAL: "true", CALOCOUNT_OWNER_KEY: "owner" };
const ACCESS = {
  CALOCOUNT_ALLOW_LOCAL: "false",
  CALOCOUNT_ACCESS_TEAM_DOMAIN: "team.example.com",
  CALOCOUNT_ACCESS_AUDIENCE: "api-audience",
  CALOCOUNT_MCP_ACCESS_AUDIENCE: "mcp-audience",
  CALOCOUNT_ALLOWED_EMAIL_SHA256: "a".repeat(64),
  CALOCOUNT_OWNER_KEY: "owner",
};
const MCP_HEADERS = { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" };

const guide = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");

/** The text under a `## title` heading. */
function section(title) {
  const start = guide.indexOf(`## ${title}\n`);
  assert.ok(start >= 0, `llms.txt has no "${title}" section`);
  const end = guide.indexOf("\n## ", start + 1);
  return guide.slice(start, end < 0 ? undefined : end);
}

/** The names that start the bullets of a section, such as `days[].weightKg`. */
function documentedNames(title) {
  return [...section(title).matchAll(/^- `([^`]+)`:/gm)].map((match) => match[1]);
}

/** The path a section tells the agent to request. */
function requestPath(title) {
  const match = section(title).match(/^`GET (\/\S+)`$/m);
  assert.ok(match, `the "${title}" section names no request`);
  return match[1];
}

/** Follow a documented name into a response. `name[]` steps into the first element of an array. */
function valueAt(body, name) {
  let value = body;
  for (const part of name.split(".")) {
    const key = part.replace(/\[\]$/, "");
    assert.ok(value !== null && typeof value === "object" && key in value, `the response has no ${name}`);
    value = value[key];
    if (part.endsWith("[]")) {
      assert.ok(Array.isArray(value) && value.length > 0, `${name} needs a non-empty array in the test data`);
      value = value[0];
    }
  }
  return value;
}

/** Save goals, one entry and one weight, so every documented array has a row. */
async function seed(worker) {
  const today = new Date().toISOString().slice(0, 10);
  const goals = await worker.request({ path: "/api/settings", method: "PATCH", body: { dailyCalorieTarget: 2100, dailyProteinTargetG: 140 } });
  assert.equal(goals.status, 200);
  const meal = await worker.request({
    path: "/api/meals",
    method: "POST",
    body: {
      consumedAt: Date.parse(`${today}T00:00:01Z`), mealType: "lunch", source: "dashboard", status: "complete",
      items: [{ name: "Rice bowl", quantity: 1, unit: "serving", calories: 500, proteinG: 30, carbsG: 60, fatG: 12, fiberG: 4 }],
    },
  });
  assert.equal(meal.status, 201);
  const weight = await worker.request({ path: "/api/weights", method: "PUT", body: { logicalDate: today, weightKg: 66.3 } });
  assert.equal(weight.status, 200);
}

test("each public view returns every field llms.txt documents, and documents every field it returns", async () => {
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    await seed(worker);
    for (const title of ["Daily view", "Dashboard view"]) {
      const names = documentedNames(title);
      assert.ok(names.length >= 10, `the "${title}" section documents its fields`);
      const response = await worker.request({ path: requestPath(title) });
      assert.equal(response.status, 200, title);
      for (const name of names) valueAt(response.body, name);

      const documentedTopLevel = new Set(names.map((name) => name.split(".")[0].replace(/\[\]$/, "")));
      assert.deepEqual(Object.keys(response.body).filter((key) => !documentedTopLevel.has(key)), [], `${title}: fields missing from llms.txt`);
    }

    // The daily view is the one agents read whole, so its rows are documented field by field.
    const daily = (await worker.request({ path: requestPath("Daily view") })).body;
    const dailyNames = new Set(documentedNames("Daily view"));
    for (const list of ["days", "goalChanges"]) {
      const undocumented = Object.keys(daily[list][0]).filter((key) => !dailyNames.has(`${list}[].${key}`));
      assert.deepEqual(undocumented, [], `${list}: fields missing from llms.txt`);
    }
    assert.deepEqual(Object.keys(daily.units).sort(), ["calories", "carbsG", "fatG", "proteinG", "weightKg"]);
  } finally {
    await worker.dispose();
  }
});

test("every path llms.txt links to or names under /api/ answers without sign-in", async () => {
  const links = [...guide.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1]);
  const apiPaths = [...guide.matchAll(/\/api\/[A-Za-z0-9_./?=&-]+/g)].map((match) => match[0]);
  const paths = [...new Set([...links, ...apiPaths])];
  assert.ok(paths.includes(requestPath("Daily view")) && paths.includes(requestPath("Dashboard view")));

  const worker = await startWorker(ACCESS);
  try {
    for (const path of paths) {
      const response = await worker.request({ path });
      // No database is bound, so reaching the database error proves the route ran without an Access token.
      assert.equal(response.body?.error?.code, "database_unavailable", `${path} must be public`);
    }
    // The guide calls /mcp private. It must refuse a request that carries no Access token.
    assert.match(section("Private MCP endpoint"), /`\/mcp`/);
    const mcp = await worker.request({ path: "/mcp", method: "POST", headers: MCP_HEADERS, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    assert.equal(mcp.status, 401);
  } finally {
    await worker.dispose();
  }
});

test("llms.txt lists exactly the MCP tools the server offers and marks the ones that write", async () => {
  const documented = [...section("Private MCP endpoint").matchAll(/^- `([a-z_]+)`:([^]*?)(?=\n- |\n\n)/gm)]
    .map((match) => ({ name: match[1], writes: /writes data/.test(match[2]) }));
  const worker = await startWorker(LOCAL, { storage: true });
  try {
    const listed = await worker.request({ path: "/mcp", method: "POST", headers: MCP_HEADERS, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    assert.equal(listed.status, 200);
    const offered = listed.body.result.tools.map((tool) => ({ name: tool.name, writes: tool.annotations.readOnlyHint !== true }));
    const byName = (left, right) => left.name.localeCompare(right.name);
    assert.deepEqual(documented.sort(byName), offered.sort(byName));
  } finally {
    await worker.dispose();
  }
});
