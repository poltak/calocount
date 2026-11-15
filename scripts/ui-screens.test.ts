import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = path.join(root, "scripts/ui-screens.ts");

interface DryRunPlan {
  request: { outputDirectory: string; routes: string[] };
  ref: string | null;
}

function plan(...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, "--dry-run", ...args], {
    encoding: "utf8",
  });
  return {
    ...result,
    plan: (result.status === 0 && JSON.parse(result.stdout)) as DryRunPlan,
  };
}

test("takes each screen into the current folder by default", () => {
  const { plan: result } = plan();
  assert.equal(
    result.request.outputDirectory,
    path.join(root, "frontend/.browser-test/screens/current"),
  );
  assert.deepEqual(result.request.routes, []);
  assert.equal(result.ref, null);
});

test("takes only the routes that are given", () => {
  const { plan: result } = plan("--route", "/notes", "--route", "/login");
  assert.deepEqual(result.request.routes, ["/notes", "/login"]);
});

test("names the folder after the commit of a baseline", () => {
  const { plan: result } = plan("--ref", "abc123");
  assert.equal(result.ref, "abc123");
  assert.match(result.request.outputDirectory, /screens\/abc123$/);
});

test("refuses a name that leaves the screens folder", () => {
  for (const name of ["../outside", ".."]) {
    const result = plan("--name", name);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must start with a letter/);
  }
});
