// Turns on the beads issue tracker in a project, one time, in its main
// checkout:
//
//   pnpm run issues:init [--prefix <name>]
//
// A bare `bd init` sets `core.hooksPath`, and Git then does not run the secret
// check. It also writes the instructions of beads into the files of the
// agents. This script gives `bd init` the two flags that stop both. It replaces
// the commit that `bd init` makes, without the README of beads, which has
// instructions for agents. The default prefix is the name in `package.json`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { VERSION_FILE, fail, git, readVersionFile } from "./template-files.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIRECTORY = ".beads";
const COMMIT_MESSAGE = "Turn on the beads issue tracker";

const read = (...args) => git({ root, args }).stdout;

function readPrefix() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: { prefix: { type: "string" } },
    }));
  } catch (error) {
    fail(`${error.message}\n\nUsage: pnpm run issues:init [--prefix <name>]`);
  }
  return (
    values.prefix ??
    JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).name
  );
}

function refuseWhenNotReady() {
  if (!readVersionFile({ root })) {
    fail(
      `This repository has no ${VERSION_FILE}. The template has no issues of its own, so run this in a project.`,
    );
  }
  if (existsSync(path.join(root, DATA_DIRECTORY))) {
    fail(
      `This project has ${DATA_DIRECTORY}/. To use it, follow "Join a project that uses beads" in docs/agents/setup.md.`,
    );
  }
  if (
    read("rev-parse", "--git-dir") !== read("rev-parse", "--git-common-dir")
  ) {
    fail(
      "All worktrees use the issues of the main checkout, so run this there.",
    );
  }
  if (read("status", "--porcelain") !== "") {
    fail(
      "The working tree has changes. Commit them first, because this script commits what `bd init` writes.",
    );
  }
}

function initialize() {
  const start = read("rev-parse", "HEAD");
  const { status } = spawnSync(
    "pnpm",
    [
      "exec",
      "bd",
      "init",
      "--skip-hooks",
      "--skip-agents",
      "--prefix",
      readPrefix(),
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (status !== 0) {
    fail(
      `\`bd init\` failed. Delete ${DATA_DIRECTORY}/ if it exists, and run this again.`,
    );
  }
  read("reset", "--quiet", "--soft", start);
  read("add", "--", DATA_DIRECTORY);
  read(
    "rm",
    "--quiet",
    "--force",
    "--ignore-unmatch",
    "--",
    `${DATA_DIRECTORY}/README.md`,
  );
  read("commit", "--quiet", "--message", COMMIT_MESSAGE);
}

refuseWhenNotReady();
initialize();

const hooksPath = git({
  root,
  args: ["config", "--get", "core.hooksPath"],
  allowFailure: true,
}).stdout;
if (hooksPath) {
  fail(
    `\`core.hooksPath\` is "${hooksPath}", so Git does not run the secret check. Run \`git config --unset core.hooksPath\`.`,
  );
}

console.log(
  "Beads is on. Next:\n" +
    "  1. Run `pnpm exec bd dolt push` to make the issues on the remote.\n" +
    "  2. Push the commit.",
);
