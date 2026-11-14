// Run with pnpm run test:scripts. Keep joining safe to run again.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
function setup(t: TestContext) {
  const root = mkdtempSync(path.join(os.tmpdir(), "issues-join-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Person",
    GIT_AUTHOR_EMAIL: "person@example.test",
    GIT_COMMITTER_NAME: "Person",
    GIT_COMMITTER_EMAIL: "person@example.test",
  };
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
  git("init", "--quiet", "--initial-branch=main");
  mkdirSync(path.join(root, "scripts"));
  for (const file of ["issues-join.ts", "template-files.mjs"])
    cpSync(new URL(file, import.meta.url), path.join(root, "scripts", file));
  mkdirSync(path.join(root, "bin"));
  writeFileSync(
    path.join(root, "bin/pnpm"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n[ "$*" = "exec bd bootstrap --yes" ] && [ -n "$FAIL_BOOTSTRAP" ] && exit 1\nexit 0\n',
  );
  chmodSync(path.join(root, "bin/pnpm"), 0o755);
  const run = (extra: Record<string, string> = {}, cwd = root) => {
    const r = spawnSync(process.execPath, ["scripts/issues-join.ts"], {
      cwd,
      encoding: "utf8",
      env: {
        ...env,
        PATH: `${path.join(root, "bin")}${path.delimiter}${env.PATH}`,
        CALLS: path.join(root, "calls"),
        ...extra,
      },
    });
    return { status: r.status, output: r.stdout + r.stderr };
  };
  return { root, run, git };
}
test("refuses a checkout without issues", (t) => {
  const x = setup(t);
  assert.equal(x.run().status, 1);
  assert.match(x.run().output, /issues:init/);
});
test("joins in order and sets permissions and role", (t) => {
  const x = setup(t);
  mkdirSync(path.join(x.root, ".beads"));
  assert.equal(x.run().status, 0);
  assert.equal(
    readFileSync(path.join(x.root, "calls"), "utf8"),
    "exec bd metrics off\nexec bd bootstrap --yes\nexec bd list\n",
  );
  assert.equal(statSync(path.join(x.root, ".beads")).mode & 0o777, 0o700);
  assert.equal(x.git("config", "beads.role"), "maintainer");
  assert.equal(x.run().status, 0);
});
test("explains a bootstrap failure", (t) => {
  const x = setup(t);
  mkdirSync(path.join(x.root, ".beads"));
  const r = x.run({ FAIL_BOOTSTRAP: "1" });
  assert.equal(r.status, 1);
  assert.match(r.output, /SSH key for GitHub/);
});
test("refuses a linked worktree and names the main checkout", (t) => {
  const x = setup(t);
  mkdirSync(path.join(x.root, ".beads"));
  writeFileSync(path.join(x.root, ".beads/config.yaml"), "x");
  x.git("add", ".");
  x.git("commit", "-qm", "Start");
  const other = path.join(x.root, "other");
  x.git("worktree", "add", "-qb", "other", other);
  const r = x.run({}, other);
  assert.equal(r.status, 1);
  assert.ok(r.output.includes(x.root));
  assert.match(r.output, /main checkout/);
});
