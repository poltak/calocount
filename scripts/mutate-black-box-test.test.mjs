// Run with pnpm run test:scripts. Inspect the real copy and its report.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
const source = `import { expect } from "@playwright/test";
await expect(locator).toHaveText("Saved");
await expect(locator).not.toHaveText("Other");
await expect(locator).toBeVisible();
const text = '.toHaveText("Hidden")';
// .toHaveText("Hidden")
await expect.poll(() => 1).toBe(1);
`;
function setup(t, specSource = source) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mutation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, "bin"));
  const spec = "frontend/src/features/x/black-box-tests/x.spec.ts";
  const copy = path.join(root, spec.replace(".spec.ts", ".mutated.spec.ts"));
  mkdirSync(path.dirname(copy), { recursive: true });
  writeFileSync(path.join(root, spec), specSource);
  for (const file of ["mutate-black-box-test.mjs", "template-files.mjs"])
    cpSync(new URL(file, import.meta.url), path.join(root, "scripts", file));
  const fake = `#!${process.execPath}
const fs = require('node:fs');
if (process.argv.includes('build')) process.exit(0);
const copy = ${JSON.stringify(copy)};
fs.copyFileSync(copy, process.env.SAVED);
fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, process.env.REPORT || JSON.stringify({suites:[{specs:[{tests:[{results:[{status:process.env.STATUS || 'failed',errors:process.env.NO_ERROR ? [] : [{message:process.env.MESSAGE || 'Error: Changed by the check: expected',location:{file:copy,line:2}}]}]}]}]}]}));
process.exit(1);
`;
  writeFileSync(path.join(root, "bin/pnpm"), fake);
  chmodSync(path.join(root, "bin/pnpm"), 0o755);
  const saved = path.join(root, "saved");
  const run = (extra = {}, file = spec) => {
    const r = spawnSync(
      process.execPath,
      ["scripts/mutate-black-box-test.mjs", file],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: path.join(root, "bin") + path.delimiter + process.env.PATH,
          SAVED: saved,
          ...extra,
        },
      },
    );
    return { status: r.status, output: r.stdout + r.stderr };
  };
  return { root, copy, saved, run };
}
test("finds checks, changes the copy, reports the error, and deletes the copy", (t) => {
  const x = setup(t),
    r = x.run();
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /2: toHaveText  fails when changed/);
  assert.match(r.output, /3: toHaveText  by hand: a negated check/);
  assert.match(r.output, /4: toBeVisible  by hand/);
  assert.match(r.output, /7: toBe  by hand: an expect.poll/);
  assert.doesNotMatch(r.output, /5:|6:/);
  assert.equal(existsSync(x.copy), false);
  const saved = readFileSync(x.saved, "utf8");
  assert.match(saved, /expect as baseExpect/);
  assert.match(saved, /baseExpect.extend\(changedMatchers\(\)\).configure/);
  assert.match(saved, /\.changedToHaveText\(/);
  assert.match(saved, /function changedMatchers/);
  assert.equal(
    saved.slice(0, saved.indexOf("\nfunction changedMatchers")).split("\n")
      .length,
    source.split("\n").length,
  );
});
test("reports checks that did not fail and cleans up after a failed run", (t) => {
  const x = setup(t),
    r = x.run({ NO_ERROR: "1" });
  assert.equal(r.status, 1);
  assert.match(r.output, /DID NOT FAIL/);
  assert.equal(existsSync(x.copy), false);
});
test("reports an unknown result after a timeout", (t) => {
  const x = setup(t),
    r = x.run({ NO_ERROR: "1", STATUS: "timedOut" });
  assert.equal(r.status, 1);
  assert.match(r.output, /not known: the run stopped early/);
});
test("refuses paths outside black-box-tests", (t) => {
  const x = setup(t);
  assert.equal(x.run({}, "frontend/other.spec.ts").status, 1);
});
test("keeps an existing copy", (t) => {
  const x = setup(t);
  writeFileSync(x.copy, "keep");
  const r = x.run();
  assert.equal(r.status, 1);
  assert.match(r.output, /Delete the existing copy/);
  assert.equal(readFileSync(x.copy, "utf8"), "keep");
});
const twoTests = `import { expect } from "@playwright/test";
test("first", async () => {
  await expect(locator).toHaveText("One");
});
test("second", async () => {
  await expect(locator).toHaveText("Two");
});
`;
test("reports a check of a test that did not run as not known", (t) => {
  const x = setup(t, twoTests);
  const report = {
    suites: [
      {
        specs: [
          {
            line: 2,
            tests: [{ results: [{ status: "failed", errors: [] }] }],
          },
        ],
      },
    ],
  };
  const r = x.run({ REPORT: JSON.stringify(report) });
  assert.equal(r.status, 1);
  assert.match(r.output, /3: toHaveText  DID NOT FAIL/);
  assert.match(r.output, /6: toHaveText  not known: its test did not run/);
});
test("fails when the run fails before the tests", (t) => {
  const x = setup(t);
  const r = x.run({
    REPORT: JSON.stringify({ suites: [], errors: [{ message: "no build" }] }),
  });
  assert.equal(r.status, 1);
  assert.match(r.output, /failed before the tests:\nno build/);
  assert.doesNotMatch(r.output, /DID NOT FAIL/);
  assert.equal(existsSync(x.copy), false);
});
test("reports other matchers by hand and skips methods that are not checks", (t) => {
  const x = setup(
    t,
    `import { expect } from "@playwright/test";
await expect(locator).toMatchObject({ a: 1 });
const label = count.toString();
await expect(list).toSatisfy((items) => items.length > 0);
`,
  );
  const r = x.run();
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /2: toMatchObject  fails when changed/);
  assert.doesNotMatch(r.output, /toString/);
  assert.match(
    r.output,
    /4: toSatisfy  by hand: the script does not change this matcher/,
  );
});
test("reports a toHaveAttribute check with no value by hand", (t) => {
  const x = setup(
    t,
    `import { expect } from "@playwright/test";
await expect(link).toHaveAttribute("href", "/notes");
await expect(button).toHaveAttribute("disabled");
await expect(button).toHaveAttribute("disabled", { timeout: 1000 });
await expect(button).toHaveAttribute(
  "disabled",
);
`,
  );
  const r = x.run();
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /2: toHaveAttribute  fails when changed/);
  assert.match(r.output, /3: toHaveAttribute  by hand: checks only that/);
  assert.match(r.output, /4: toHaveAttribute  by hand: checks only that/);
  assert.match(r.output, /5: toHaveAttribute  by hand: checks only that/);
});
test("does not count another error on the line of a check", (t) => {
  const x = setup(t);
  const r = x.run({ MESSAGE: "TypeError: value is not iterable" });
  assert.equal(r.status, 1);
  assert.match(r.output, /2: toHaveText  not known: another error/);
});
