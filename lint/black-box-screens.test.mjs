import assert from "node:assert/strict";
import test from "node:test";
import { lint } from "./lint-fixture.mjs";

const fixture =
  'import { test } from "../../core/black-box-tests/black-box-test.js";\n';

test("lets a screens file seed rows only with the screens helper, and find no element", async (context) => {
  const problems = await lint(context, {
    "frontend/src/features/core/black-box-tests/black-box-test.ts":
      "export const test = () => undefined;\n",
    "frontend/src/features/core/tests/browser/screens.ts":
      "export const captureScreens = () => undefined;\nexport const seedThroughApi = () => undefined;\n",
    "frontend/src/features/notes/black-box-tests/notes.screens.ts":
      fixture +
      'import { captureScreens, seedThroughApi } from "../../core/tests/browser/screens.js";\nexport const run = [test, seedThroughApi(), captureScreens()];\n',
    // It finds an element and calls the API itself.
    "frontend/src/features/peeks/black-box-tests/peeks.screens.ts":
      fixture +
      'export const run = (page: never) => [test, page.getByRole("button"), page.request.post("/api/notes")];\n',
    // It does not take `test` from the fixture.
    "frontend/src/features/loose/black-box-tests/loose.screens.ts":
      "export const run = true;\n",
    // A black box test makes its data through the UI, not with the helper.
    "frontend/src/features/sneaks/black-box-tests/sneaks.spec.ts":
      fixture +
      'import { seedThroughApi } from "../../core/tests/browser/screens.js";\nexport const run = [test, seedThroughApi];\n',
  });

  assert.deepEqual(problems, [
    "frontend/src/features/loose/black-box-tests/loose.screens.ts: testing(black-box-tests)",
    "frontend/src/features/peeks/black-box-tests/peeks.screens.ts: testing(black-box-tests)",
    "frontend/src/features/peeks/black-box-tests/peeks.screens.ts: testing(black-box-tests)",
    "frontend/src/features/sneaks/black-box-tests/sneaks.spec.ts: testing(black-box-tests)",
  ]);
});
