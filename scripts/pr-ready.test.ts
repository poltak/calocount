// Run with pnpm run test:scripts. Exercise real Git merges and saved results.
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
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
const env: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Person",
  GIT_AUTHOR_EMAIL: "person@example.test",
  GIT_COMMITTER_NAME: "Person",
  GIT_COMMITTER_EMAIL: "person@example.test",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function setup(t: TestContext) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pr-ready-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = path.join(dir, "origin.git"),
    upstream = path.join(dir, "upstream"),
    root = path.join(dir, "project"),
    bin = path.join(dir, "bin");
  git(dir, "init", "--bare", "--initial-branch=main", origin);
  git(dir, "clone", origin, upstream);
  const commit = (cwd: string, file: string, text: string) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), text);
    git(cwd, "add", ".");
    git(cwd, "commit", "-m", "Change");
  };
  commit(upstream, "file.txt", "start\n");
  git(upstream, "push", "origin", "main");
  git(dir, "clone", origin, root);
  git(root, "switch", "-c", "feature/trial");
  mkdirSync(path.join(root, "scripts"));
  for (const file of ["pr-ready.ts", "template-files.ts"]) {
    cpSync(new URL(file, import.meta.url), path.join(root, "scripts", file));
  }
  git(root, "add", ".");
  git(root, "commit", "-m", "Add script");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "pnpm"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n[ "$*" = "run check" ] && [ -n "$FAIL_CHECK" ] && exit 1\nexit 0\n',
  );
  chmodSync(path.join(bin, "pnpm"), 0o755);
  const calls = path.join(dir, "calls");
  const run = (step: string, extra: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, ["scripts/pr-ready.ts", step], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...env,
        PATH: `${bin}${path.delimiter}${env.PATH}`,
        CALLS: calls,
        ...extra,
      },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  return {
    root,
    upstream,
    git,
    commit,
    run,
    calls,
    record: () =>
      JSON.parse(readFileSync(path.join(root, ".git/pr-ready.json"), "utf8")),
  };
}
test("refuses main and a dirty working tree", (t) => {
  const x = setup(t);
  x.git(x.root, "switch", "main");
  // The script was committed only on the feature branch.
  x.git(x.root, "merge", "feature/trial");
  assert.match(x.run("merge").output, /feature branch/);
  x.git(x.root, "switch", "feature/trial");
  writeFileSync(path.join(x.root, "dirty"), "x");
  assert.equal(x.run("merge").status, 1);
});
test("merges origin/main and keeps conflicts for the person to resolve", (t) => {
  const x = setup(t);
  x.commit(x.upstream, "new", "new");
  x.git(x.upstream, "push", "origin", "main");
  assert.equal(x.run("merge").status, 0);
  x.commit(x.root, "file.txt", "feature\n");
  x.commit(x.upstream, "file.txt", "main\n");
  x.git(x.upstream, "push", "origin", "main");
  const result = x.run("merge");
  assert.equal(result.status, 1);
  assert.match(result.output, /file.txt/);
  assert.ok(x.git(x.root, "rev-parse", "MERGE_HEAD"));
  assert.match(x.run("merge").output, /git commit --no-edit/);
});
test("records checks and reports them, then refuses results for an old commit", (t) => {
  const x = setup(t);
  x.commit(x.root, "backend/change", "x");
  assert.equal(x.run("check").status, 0);
  assert.equal(x.record().checks.check.status, "passed");
  assert.equal(x.run("browser").status, 0);
  assert.equal(x.record().checks.browser.status, "not-needed");
  const result = x.run("report");
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Checks at [a-f0-9]{12}/);
  x.commit(x.root, "backend/change", "y");
  assert.equal(x.run("report").status, 1);
});
for (const file of [
  "frontend/src/features/core/ui/routes.tsx",
  "frontend/src/features/x/ui/page.tsx",
]) {
  test(`runs browser tests for ${file}`, (t) => {
    const x = setup(t);
    if (file.includes("/x/")) {
      x.commit(
        x.root,
        "frontend/src/features/x/black-box-tests/test.spec.ts",
        "test",
      );
    }
    x.commit(x.root, file, "change");
    assert.equal(x.run("browser").status, 0);
    assert.match(readFileSync(x.calls, "utf8"), /run test:browser/);
    assert.equal(x.record().checks.browser.status, "passed");
  });
}
test("report refuses an earlier pass after a failed run at the same commit", (t) => {
  const x = setup(t);
  x.commit(x.root, "backend/change", "x");
  assert.equal(x.run("check").status, 0);
  assert.equal(x.run("browser").status, 0);
  assert.equal(x.run("check", { FAIL_CHECK: "1" }).status, 1);
  assert.equal(x.run("report").status, 1);
});
test("all stops at a failed check", (t) => {
  const x = setup(t);
  x.commit(x.root, "frontend/src/features/core/ui/routes.tsx", "change");
  assert.equal(x.run("all", { FAIL_CHECK: "1" }).status, 1);
  assert.equal(readFileSync(x.calls, "utf8"), "run check\n");
});
