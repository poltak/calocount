// Starts the built backend as a deployment does, and checks that it becomes
// ready, answers from the database, stays up when the database closes its
// connections, and stops cleanly.
//
//   node scripts/check-live-start.mjs
//
// No other test runs `server/start.ts`, the live composition root, the
// environment parser, or the `pg` driver. The UI Logic tests and the browser
// tests use the test root, with an in-memory database.
//
// The configuration is the one in `.env.example`, so this check also fails
// when that file lacks a variable that the server requires. It does not use
// the values in `.env`. The database comes from `dev-database.mjs`: a
// PostgreSQL that already answers at the URL in `.env.example`, or the
// embedded one.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const TIME_LIMIT_MS = 60_000;
// The database script runs this file again with this argument, after the
// database answers and has the migrations.
const WITH_DATABASE = "--with-database";
// An address that is reserved for documentation. The sign-in attempt below
// then counts for this address, not for a person who uses the same database.
const CALLER_ADDRESS = "192.0.2.10";

function runBehindDatabase() {
  const example = parseEnv(
    readFileSync(path.join(root, ".env.example"), "utf8"),
  );
  const child = spawn(
    process.execPath,
    [
      "scripts/dev-database.mjs",
      "--migrate",
      "--",
      process.execPath,
      "scripts/check-live-start.mjs",
      WITH_DATABASE,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        ...example,
        // `.env.example` leaves these two empty, for each person to fill in.
        BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
        APP_OWNER_EMAIL: "owner@example.test",
        APP_CLIENT_ADDRESS_HEADER: "x-forwarded-for",
        // The system selects a free port, so a dev server that runs is no conflict.
        PORT: "0",
        // One JSON object for each line, as in production. The port is read from it.
        LOG_FORMAT: "json",
        LOG_LEVEL: "info",
      },
    },
  );
  child.once("exit", (code) => process.exit(code ?? 1));
}

function waitForServerUrl({ server, exited }) {
  return new Promise((resolve, reject) => {
    let pending = "";
    server.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      const lines = (pending + String(chunk)).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.message === "Server listening") {
            resolve(entry.url);
          }
        } catch {
          // Not a log entry.
        }
      }
    });
    void exited.then((code) =>
      reject(
        new Error(`The server stopped before it listened (exit code ${code}).`),
      ),
    );
  });
}

async function expectStatus({ url, expected, init }) {
  const response = await fetch(url, init);
  if (response.status !== expected) {
    throw new Error(
      `${init?.method ?? "GET"} ${new URL(url).pathname} answered ${response.status}, not ${expected}: ${await response.text()}`,
    );
  }
}

/** Close every other connection to the database, as a database restart does. */
async function closeDatabaseConnections() {
  // The driver is a dependency of the backend, not of the repository root.
  const { Client } = createRequire(path.join(root, "backend/package.json"))(
    "pg",
  );
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()",
    );
  } finally {
    await client.end();
  }
}

async function waitUntilReady(url) {
  let status;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    status = (await fetch(`${url}/health/ready`)).status;
    if (status === 200) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `The server was not ready again after its database connections closed. The last answer was ${status}.`,
  );
}

async function checkServer({ server, exited }) {
  const url = await waitForServerUrl({ server, exited });

  await expectStatus({ url: `${url}/health`, expected: 200 });
  // The readiness route sends a query through the `pg` driver.
  await expectStatus({ url: `${url}/health/ready`, expected: 200 });
  // A sign-in for an unknown account reads and writes the migrated tables. It
  // is refused with 401 only when the migrations ran on this database.
  await expectStatus({
    url: `${url}/api/session`,
    expected: 401,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: process.env.BETTER_AUTH_URL,
        "x-forwarded-for": CALLER_ADDRESS,
      },
      body: JSON.stringify({
        email: "nobody@example.test",
        password: "not-a-real-password",
      }),
    },
  });

  // The server must stay up when the database closes its connections, and
  // must connect again for the next request.
  await closeDatabaseConnections();
  await waitUntilReady(url);

  // On this signal, the server must close its connections and its database
  // pool, and then end by itself.
  server.kill("SIGTERM");
  const exitCode = await exited;
  if (exitCode !== 0) {
    throw new Error(`The server stopped with exit code ${exitCode}.`);
  }
}

async function runCheck() {
  const server = spawn(
    process.execPath,
    ["backend/dist/features/core/server/start.js"],
    { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
  );
  const exited = new Promise((resolve) => server.once("exit", resolve));
  const timeLimit = setTimeout(() => {
    console.error(
      `The check did not finish in ${TIME_LIMIT_MS / 1000} seconds.`,
    );
    server.kill("SIGKILL");
    process.exit(1);
  }, TIME_LIMIT_MS);

  try {
    await checkServer({ server, exited });
    console.log("The live server started, answered, and stopped.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    server.kill("SIGKILL");
    process.exitCode = 1;
  } finally {
    clearTimeout(timeLimit);
  }
}

if (process.argv.includes(WITH_DATABASE)) {
  await runCheck();
} else {
  runBehindDatabase();
}
