import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// The Deploy to Cloudflare button copies this repository as it is. These tests
// keep the shared files free of the values of one instance.

type WranglerConfig = {
  name: string;
  keep_vars?: boolean;
  vars?: Record<string, string>;
  d1_databases?: Array<{ binding: string; migrations_dir?: string }>;
};

function readText(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function wranglerConfig(): WranglerConfig {
  const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", readText("wrangler.jsonc"));
  assert.equal(error, undefined, "wrangler.jsonc must parse");
  return config as WranglerConfig;
}

/** The names a dotenv file sets. */
function dotenvNames(path: string): string[] {
  return readText(path).split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")));
}

const packageJson = JSON.parse(readText("package.json")) as {
  scripts: Record<string, string>;
  cloudflare?: { bindings?: Record<string, { description?: string }> };
};

test("the shared Wrangler config sets only values that are the same for every instance", () => {
  const config = wranglerConfig();
  assert.deepEqual(Object.keys(config.vars ?? {}).sort(), ["CALOCOUNT_ALLOW_LOCAL", "CALOCOUNT_OWNER_KEY"]);
  assert.equal(config.vars?.CALOCOUNT_ALLOW_LOCAL, "false");
  // Each instance sets its Access values in the dashboard. A deploy must not delete them.
  assert.equal(config.keep_vars, true);
});

test("the button asks only for the owner email, and no secret has the name of a variable", () => {
  const secrets = dotenvNames(".dev.vars.example");
  assert.deepEqual(secrets, ["CALOCOUNT_OWNER_EMAIL"]);
  const variables = Object.keys(wranglerConfig().vars ?? {});
  assert.deepEqual(secrets.filter((name) => variables.includes(name)), []);
  // Local development turns sign-in off, so its values stay in the local example only.
  assert.ok(dotenvNames(".dev.vars.local.example").includes("CALOCOUNT_ALLOW_LOCAL"));
});

test("each value the button shows has a description", () => {
  const names = [...dotenvNames(".dev.vars.example"), ...Object.keys(wranglerConfig().vars ?? {})];
  for (const name of names) {
    assert.ok(packageJson.cloudflare?.bindings?.[name]?.description, `${name} needs a description in package.json`);
  }
});

test("a deploy applies the D1 migrations by binding name before it deploys the Worker", () => {
  const binding = wranglerConfig().d1_databases?.[0];
  assert.equal(binding?.migrations_dir, "drizzle");
  // The button can give the database another name, so the commands use the binding.
  assert.match(packageJson.scripts["db:migrate:remote"], new RegExp(`wrangler d1 migrations apply ${binding?.binding} --remote$`));
  assert.match(packageJson.scripts["db:migrate:local"], new RegExp(`wrangler d1 migrations apply ${binding?.binding} --local$`));
  const deploy = packageJson.scripts.deploy;
  assert.ok(deploy.indexOf("pnpm run build") < deploy.indexOf("pnpm run db:migrate:remote"), deploy);
  assert.ok(deploy.indexOf("pnpm run db:migrate:remote") < deploy.indexOf("wrangler deploy"), deploy);
});
