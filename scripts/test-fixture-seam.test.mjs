// A project cannot change `core/tests/api.ts`, because the template owns it.
// The file must therefore leave each choice of a project to
// `core/tests/index.ts`. A slip here passes each test of the template, and
// stops only a project on another engine or sign-in method.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = await readFile(
  new URL("../backend/src/features/core/tests/api.ts", import.meta.url),
  "utf8",
);

test("the owned fixture imports no database file and no auth file", () => {
  const imports = [...fixture.matchAll(/from "(\.[^"]+)"/g)].map(
    ([, specifier]) => specifier,
  );
  assert.deepEqual(
    imports.filter((specifier) => /\/(database|auth)\//.test(specifier)),
    [],
  );
});

test("the owned fixture names no engine, no sign-in method, and no migration call", () => {
  assert.doesNotMatch(fixture, /pglite|postgres|password|\/api\/session/i);
  assert.doesNotMatch(fixture, /\.migrate\(/);
});
