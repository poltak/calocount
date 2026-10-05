// Runs a command with a database behind it.
//
//   node scripts/dev-database.mjs [--migrate] -- <command> [arguments]
//
// The database is the one in DATABASE_URL, read from the process environment
// and then from the root `.env`. When that URL names this machine and nothing
// answers on its port, this script starts the embedded PostgreSQL there, keeps
// its data in `.data/postgres/`, and stops it when the command ends. A
// database that already answers is used as it is, and so is a remote one.
//
// With `--migrate`, a database on this machine also gets the schema
// migrations before the command starts. A remote database never does.
//
//   node scripts/dev-database.mjs --reset
//
// Stops the embedded PostgreSQL if it runs, and deletes its data.
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDirectory = path.join(root, ".data", "postgres");
const logFile = path.join(root, ".data", "postgres.log");
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
// The built migrate script, run directly because the caller built the backend.
const MIGRATE_ARGUMENTS = [
  "--env-file-if-exists=.env",
  "backend/dist/features/core/scripts/migrate.js",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readDatabaseUrl() {
  const envFile = path.join(root, ".env");
  const fromFile = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, "utf8")).DATABASE_URL
    : undefined;
  const value = process.env.DATABASE_URL ?? fromFile;
  if (!value) {
    fail("DATABASE_URL is not set. Copy .env.example to .env first.");
  }
  return new URL(value);
}

function isListening({ host, port }) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function startEmbeddedPostgres(url) {
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!user || !password || !database) {
    fail(
      "The embedded PostgreSQL needs a user, a password, and a database name in DATABASE_URL, as in .env.example.",
    );
  }

  mkdirSync(path.dirname(logFile), { recursive: true });
  const writeLog = (message) => appendFileSync(logFile, `${String(message)}\n`);
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDirectory,
    port: Number(url.port || 5432),
    user,
    password,
    persistent: true,
    // The server's own output is long. It goes to a file, not the terminal.
    onLog: writeLog,
    onError: writeLog,
  });

  if (!existsSync(path.join(dataDirectory, "PG_VERSION"))) {
    await postgres.initialise();
  }
  await postgres.start();

  const client = postgres.getPgClient();
  await client.connect();
  try {
    const existing = await client.query(
      "select 1 from pg_database where datname = $1",
      [database],
    );
    if (existing.rowCount === 0) {
      await postgres.createDatabase(database);
    }
  } finally {
    await client.end();
  }
  return postgres;
}

async function resetEmbeddedPostgres() {
  const pidFile = path.join(dataDirectory, "postmaster.pid");
  if (existsSync(pidFile)) {
    const [pid, , , port] = readFileSync(pidFile, "utf8").split("\n");
    try {
      // PostgreSQL shuts down at once on this signal.
      process.kill(Number(pid), "SIGINT");
    } catch {
      // No such process: the file is left from a server that did not stop cleanly.
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (!(await isListening({ host: "127.0.0.1", port: Number(port) }))) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  rmSync(dataDirectory, { recursive: true, force: true });
  console.log(
    `Deleted ${path.relative(root, dataDirectory)}/. The next \`pnpm run dev\` creates a new database.`,
  );
}

const separator = process.argv.indexOf("--");
const options = process.argv.slice(2, separator === -1 ? undefined : separator);
const [command, ...commandArguments] =
  separator === -1 ? [] : process.argv.slice(separator + 1);
if (options.length === 1 && options[0] === "--reset" && !command) {
  await resetEmbeddedPostgres();
  process.exit(0);
}
if (!command || options.some((option) => option !== "--migrate")) {
  fail(
    "Usage: node scripts/dev-database.mjs [--migrate] -- <command> [arguments]\n       node scripts/dev-database.mjs --reset",
  );
}

const url = readDatabaseUrl();
// A URL writes an IPv6 host in brackets.
const host = url.hostname.replace(/^\[|\]$/g, "");
const isLocal = LOCAL_HOSTS.includes(host);
let postgres;
if (isLocal && !(await isListening({ host, port: Number(url.port || 5432) }))) {
  try {
    postgres = await startEmbeddedPostgres(url);
  } catch (error) {
    fail(
      `The embedded PostgreSQL did not start: ${error instanceof Error ? error.message : String(error)}\nSee ${path.relative(root, logFile)}.`,
    );
  }
  console.log(
    `Started the embedded PostgreSQL on port ${url.port || 5432}. Its data is in ${path.relative(root, dataDirectory)}/.`,
  );
}

async function finish(exitCode) {
  await postgres?.stop().catch(() => undefined);
  process.exit(exitCode);
}

if (options.includes("--migrate") && isLocal) {
  const { status } = spawnSync(process.execPath, MIGRATE_ARGUMENTS, {
    cwd: root,
    stdio: "inherit",
  });
  if (status !== 0) {
    await finish(status ?? 1);
  }
}

const child = spawn(command, commandArguments, { stdio: "inherit" });
// A terminal sends these signals to the command as well. Pass the signal on,
// for when only this process received it, and wait for the command to end.
// The embedded PostgreSQL does not wait. It stops at once on these signals,
// so the command loses its database connections while it shuts down. The
// backend logs that and continues; see `postgres-database.ts`.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  console.error(error.message);
  void finish(1);
});
child.once("exit", (code, signal) => void finish(code ?? (signal ? 1 : 0)));
