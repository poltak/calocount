// Joins the issues of a project that uses beads, one time on each machine,
// in the main checkout:
//
//   pnpm run issues:join
//
// It runs the steps of "Join a project that uses beads" in
// docs/agents/beads.md. All worktrees use the issues of the main checkout, so
// it refuses to run in a linked worktree. `bd bootstrap` keeps the issues that
// exist, so a second run is safe.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fail, git } from "./template-files.ts";
const root = process.cwd();
const command = (...args: string[]) => git({ root, args }).stdout;
if (!existsSync(".beads")) {
  fail(
    "This branch has no issues. For a new project, run pnpm run issues:init.",
  );
}
if (
  path.resolve(command("rev-parse", "--git-dir")) !==
  path.resolve(command("rev-parse", "--git-common-dir"))
) {
  const main = command("worktree", "list", "--porcelain")
    .split("\n")[0]
    ?.slice(9);
  fail(
    `All worktrees use the issues of the main checkout. Run issues:join in ${main}.`,
  );
}
function bd(args: string[]) {
  console.log(`Run pnpm exec bd ${args.join(" ")}.`);
  const result = spawnSync("pnpm", ["exec", "bd", ...args], {
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    fail(
      args[0] === "bootstrap"
        ? "bd bootstrap failed. It uses the SSH URL in .beads/config.yaml. The SSH key for GitHub must work."
        : "The bd command failed.",
    );
  }
}
bd(["metrics", "off"]);
bd(["bootstrap", "--yes"]);
console.log("Set .beads permissions to 700.");
chmodSync(".beads", 0o700);
console.log("Set beads.role to maintainer.");
command("config", "beads.role", "maintainer");
bd(["list"]);
