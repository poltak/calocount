import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { checkScreenCoverage } from "./ui-screens-coverage.ts";

async function fixture(context: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "screens-coverage-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const results: { file: string; width: string; theme: string }[] = [];
  for (const width of ["desktop", "phone"]) {
    for (const theme of ["light", "dark"]) {
      const file = `root.${width}.${theme}.png`;
      await writeFile(path.join(directory, file), "fixture");
      results.push({ file, width, theme });
    }
  }
  const screen = { route: "/", url: "/", results };
  const save = () =>
    writeFile(path.join(directory, "root.json"), JSON.stringify(screen));
  await save();
  return { directory, screen, save };
}

test("accepts every width and theme for the source redirect route", async (context) => {
  const { directory } = await fixture(context);
  await checkScreenCoverage(directory, ["/"]);
});

test("rejects a requested route with no JSON", async (context) => {
  const { directory } = await fixture(context);
  await assert.rejects(
    checkScreenCoverage(directory, ["/", "/missing"]),
    /Missing screen for route "\/missing"/,
  );
});

test("rejects a missing width and theme in any state", async (context) => {
  const { directory, screen, save } = await fixture(context);
  screen.results.pop();
  await save();
  await assert.rejects(
    checkScreenCoverage(directory, ["/"]),
    /Missing screen result: \/ .*phone dark/,
  );
});

test("rejects a PNG that the JSON names but does not exist", async (context) => {
  const { directory } = await fixture(context);
  await rm(path.join(directory, "root.desktop.light.png"));
  await assert.rejects(
    checkScreenCoverage(directory, ["/"]),
    /Missing PNG: \/ .*desktop light/,
  );
});
