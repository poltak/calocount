#!/usr/bin/env node
// Serves the old app for the black-box tests in frontend/ (see
// frontend/playwright.config.ts). It builds the app when one of its inputs
// changed, gives each Worker an empty migrated D1 database, and starts two
// local Workers on the same build:
//
// - `owner`: sign-in is off (CALOCOUNT_ALLOW_LOCAL=true), so each browser is
//   the signed-in owner. A test that starts signed in uses this one.
// - `passkey`: passkey sign-in with a known setup code, for the sign-in tests.
//
// Both set CALOCOUNT_BLACK_BOX=true, which turns on the reset route in
// worker/black-box.ts. The fixture calls it before each test.
//
//   node scripts/black-box-serve.mjs --owner-port 4274 --passkey-port 4275
//
// The process stays in the foreground until Playwright stops it.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HASH_FILE = path.join(root, "dist", ".black-box-input-hash");
const STATE_DIRECTORY = path.join(root, ".wrangler", "black-box");
const INPUT_DIRECTORIES = ["app", "db", "domain", "worker", "public", "drizzle"];
const INPUT_FILES = ["package.json", "vite.config.ts", "wrangler.jsonc", "tsconfig.json", "tsconfig.client.json", "../pnpm-lock.yaml"];
/** The setup code of the passkey Worker. The fixture reads the same value. */
const BLACK_BOX_SETUP_CODE = "black-box-setup-code";

const { values } = parseArgs({
  options: {
    "owner-port": { type: "string", default: "4274" },
    "passkey-port": { type: "string", default: "4275" },
  },
});

/** Wrangler itself, not through pnpm, so that a stop signal reaches it. */
const WRANGLER = path.join(root, "node_modules", ".bin", "wrangler");
const toolEnv = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: path.join(root, ".wrangler", "logs") };

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: toolEnv });
}

/** Every file below a folder, sorted, so that the hash does not depend on the read order. */
function filesBelow(directory) {
  return readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function inputHash() {
  const hash = createHash("sha256");
  for (const file of [...INPUT_DIRECTORIES.flatMap(filesBelow), ...INPUT_FILES]) {
    hash.update(`${file}\n`);
    hash.update(readFileSync(path.join(root, file)));
  }
  return hash.digest("hex");
}

function buildWhenInputsChanged() {
  const hash = inputHash();
  if (existsSync(HASH_FILE) && readFileSync(HASH_FILE, "utf8") === hash) {
    console.log("black-box-serve: the inputs did not change, so the build stays");
    return;
  }
  run("pnpm", ["exec", "vite", "build"]);
  writeFileSync(HASH_FILE, hash);
}

/** An empty database with each migration, in a folder of its own. */
function prepareState(name) {
  const persistTo = path.join(STATE_DIRECTORY, name);
  rmSync(persistTo, { recursive: true, force: true });
  run("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo]);
  return persistTo;
}

const children = [];

function startWorker({ name, port, inspectorPort, vars }) {
  const persistTo = prepareState(name);
  const args = [
    "dev",
    "--config", "dist/server/wrangler.json",
    "--port", String(port),
    "--inspector-port", String(inspectorPort),
    "--persist-to", persistTo,
    "--show-interactive-dev-session=false",
    ...Object.entries({ CALOCOUNT_BLACK_BOX: "true", CALOCOUNT_OWNER_KEY: "default", ...vars })
      .flatMap(([key, value]) => ["--var", `${key}:${value}`]),
  ];
  const child = spawn(WRANGLER, args, { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: toolEnv });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`black-box-serve: the ${name} Worker stopped (${signal ?? code})`);
      stop(1);
    }
  });
  children.push(child);
}

async function waitForWorker(port) {
  const url = `http://localhost:${port}/api/auth/status`;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The Worker is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`black-box-serve: no answer from ${url}`);
}

let stopping = false;
function stop(code) {
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

buildWhenInputsChanged();
const ownerPort = Number(values["owner-port"]);
const passkeyPort = Number(values["passkey-port"]);
// Playwright waits for the passkey Worker, so the owner Worker must answer first.
startWorker({ name: "owner", port: ownerPort, inspectorPort: ownerPort + 5000, vars: { CALOCOUNT_ALLOW_LOCAL: "true" } });
await waitForWorker(ownerPort);
startWorker({
  name: "passkey",
  port: passkeyPort,
  inspectorPort: passkeyPort + 5000,
  vars: { CALOCOUNT_ALLOW_LOCAL: "false", CALOCOUNT_AUTH_MODE: "passkey", CALOCOUNT_SETUP_CODE: BLACK_BOX_SETUP_CODE },
});
await waitForWorker(passkeyPort);
console.log(`black-box-serve: owner on ${ownerPort}, passkey on ${passkeyPort}`);
