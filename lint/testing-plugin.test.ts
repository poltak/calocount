import assert from "node:assert/strict";
import test from "node:test";
import { lint } from "./lint-fixture.ts";
import { coreFiles, importLogic, logicTest } from "./lint-test-helpers.ts";

const logic = (name: string) =>
  importLogic + `export class ${name}Logic extends Logic {}\n`;

test("requires a test beside every UI Logic and LogicPlugin file", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("frontend"),
    "frontend/src/features/notes/ui/notes-logic.ts":
      importLogic + "export class NotesLogic extends Logic {}\n",
    "frontend/src/features/notes/ui/notes-logic.test.ts": logicTest,
    "frontend/src/features/notes/ui/archive-logic.ts":
      importLogic + "export class ArchiveLogic extends Logic {}\n",
    "frontend/src/features/notes/ui/draft-plugin.ts":
      'import { LogicPlugin } from "../../core/logic/logic-plugin.js";\nexport class DraftPlugin extends LogicPlugin {}\n',
    "frontend/src/features/notes/ui/notes-page.tsx":
      "export const NotesPage = () => null;\n",
  });

  assert.deepEqual(problems, [
    "frontend/src/features/notes/ui/archive-logic.ts: testing(ui-logic-tested)",
    "frontend/src/features/notes/ui/draft-plugin.ts: testing(ui-logic-tested)",
  ]);
});

test("keeps UI Logic tests on the full application fixture", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("frontend"),
    "frontend/src/features/notes/ui/notes-logic.ts": logic("Notes"),
    "frontend/src/features/notes/ui/notes-logic.test.ts": logicTest,
    "frontend/src/features/doubles/ui/doubles-logic.ts": logic("Doubles"),
    "frontend/src/features/doubles/ui/doubles-logic.test.ts":
      'import { vi } from "vitest";\n' +
      logicTest +
      'vi.spyOn(globalThis, "fetch");\nexport const wait = vi.waitFor;\n',
    "frontend/src/features/parallel/ui/parallel-logic.ts": logic("Parallel"),
    "frontend/src/features/parallel/ui/parallel-logic.test.ts":
      'import { it } from "vitest";\n' +
      logicTest +
      'it.concurrent("runs", () => undefined);\n',
    "frontend/src/features/rendered/ui/rendered-logic.ts": logic("Rendered"),
    "frontend/src/features/rendered/ui/rendered-logic.test.ts":
      'import { render } from "@testing-library/react";\n' +
      logicTest +
      "export const view = render;\n",
    "frontend/src/features/faked/ui/faked-logic.ts": logic("Faked"),
    "frontend/src/features/faked/ui/faked-logic.test.ts":
      'import { createApp } from "../../core/tests/index.js";\nexport const app = createApp;\n',
    // Tests outside a feature's ui/ directory are not UI Logic tests.
    "frontend/src/features/core/logic/use-logic.test.tsx":
      'import { render } from "@testing-library/react";\nimport { vi } from "vitest";\nexport const uses = [render, vi.fn()];\n',
  });

  assert.deepEqual(problems, [
    "frontend/src/features/doubles/ui/doubles-logic.test.ts: testing(logic-tests)",
    "frontend/src/features/faked/ui/faked-logic.test.ts: testing(logic-tests)",
    "frontend/src/features/faked/ui/faked-logic.test.ts: testing(logic-tests)",
    "frontend/src/features/parallel/ui/parallel-logic.test.ts: testing(logic-tests)",
    "frontend/src/features/rendered/ui/rendered-logic.test.ts: testing(logic-tests)",
  ]);
});

test("keeps black box tests on page objects and the black box fixture", async (context) => {
  const fixture =
    'import { test } from "../../core/black-box-tests/black-box-test.js";\n';
  const problems = await lint(context, {
    "frontend/src/features/core/black-box-tests/black-box-test.ts":
      "export const test = () => undefined;\n",
    "frontend/src/features/auth/black-box-tests/sign-in-page-object.ts":
      'import type { Page } from "@playwright/test";\nexport const signInPage = (page: Page) => page.getByRole("heading");\n',
    "frontend/src/features/notes/black-box-tests/notes-page-object.ts":
      'import type { Page } from "@playwright/test";\nexport const notesPage = (page: Page) => ({\n  note: (title: string) => page.getByRole("listitem").filter({ hasText: title }),\n  open: () => page.getByRole("heading", { name: "Edit note" }).waitFor(),\n});\n',
    // A workflow can cross features, so a test may use the page objects of
    // another feature.
    "frontend/src/features/notes/black-box-tests/notes.spec.ts":
      'import { expect } from "@playwright/test";\n' +
      fixture +
      'import { signInPage } from "../../auth/black-box-tests/sign-in-page-object.js";\nimport { notesPage } from "./notes-page-object.js";\nexport const check = (page: never) => [test, signInPage(page), expect(notesPage(page).note("A"))];\n',
    "frontend/src/features/markup/black-box-tests/markup-page-object.ts":
      'import { expect, type Page } from "@playwright/test";\nexport const find = (page: Page) => [expect, page.locator(".note"), page.getByTestId("note")];\n',
    "frontend/src/features/finds/black-box-tests/finds.spec.ts":
      fixture +
      'export const steps = (page: never) => [test, page.getByRole("button"), page.route("**", () => undefined), page.waitForTimeout(100)];\n',
    "frontend/src/features/calls/black-box-tests/calls.spec.ts":
      fixture +
      'export const seed = (page: never) => [test, page.request.post("/api/notes")];\nexport const run = async ({ request }: never) => request;\n',
    "frontend/src/features/plain/black-box-tests/plain.spec.ts":
      'import { test } from "@playwright/test";\nimport { PlainLogic } from "../ui/plain-logic.js";\nexport const uses = [test, PlainLogic];\n',
    "frontend/src/features/placed/ui/placed-page-object.ts":
      "export const placed = true;\n",
    "frontend/src/features/mixed/black-box-tests/helpers.ts":
      "export const helper = true;\n",
    "frontend/src/features/mixed/black-box-tests/mixed.test.ts":
      "export const unit = true;\n",
    // The build checks may answer a request themselves, so they are exempt.
    "frontend/src/features/core/tests/browser/built-app.spec.ts":
      'import { test } from "@playwright/test";\nexport const answer = (page: never) => [test, page.route("**", () => undefined)];\n',
    "frontend/src/features/core/tests/browser/example-pages.spec.ts":
      'import { test } from "@playwright/test";\nexport const answer = (page: never) => [test, page.route("**", () => undefined)];\n',
  });

  assert.deepEqual(problems, [
    "frontend/src/features/calls/black-box-tests/calls.spec.ts: testing(black-box-tests)",
    "frontend/src/features/calls/black-box-tests/calls.spec.ts: testing(black-box-tests)",
    "frontend/src/features/finds/black-box-tests/finds.spec.ts: testing(black-box-tests)",
    "frontend/src/features/finds/black-box-tests/finds.spec.ts: testing(black-box-tests)",
    "frontend/src/features/finds/black-box-tests/finds.spec.ts: testing(black-box-tests)",
    "frontend/src/features/markup/black-box-tests/markup-page-object.ts: testing(black-box-tests)",
    "frontend/src/features/markup/black-box-tests/markup-page-object.ts: testing(black-box-tests)",
    "frontend/src/features/markup/black-box-tests/markup-page-object.ts: testing(black-box-tests)",
    "frontend/src/features/mixed/black-box-tests/helpers.ts: testing(black-box-tests)",
    "frontend/src/features/mixed/black-box-tests/mixed.test.ts: testing(black-box-tests)",
    "frontend/src/features/placed/ui/placed-page-object.ts: testing(black-box-tests)",
    "frontend/src/features/plain/black-box-tests/plain.spec.ts: testing(black-box-tests)",
    "frontend/src/features/plain/black-box-tests/plain.spec.ts: testing(black-box-tests)",
  ]);
});

const spec = (body: string) =>
  'import { expect } from "@playwright/test";\n' +
  "export const check = async (page: never, row: never, shortDayLabel: (date: Date) => string, daysAgo: (days: number) => Date) => {\n" +
  body +
  "};\n";

test("builds each date in an expected value from the clock or the date helpers", async (context) => {
  const problems = await lint(context, {
    "frontend/src/features/notes/black-box-tests/helper.spec.ts": spec(
      "  await expect(row).toHaveText(shortDayLabel(daysAgo(2)));\n  await expect(row).toHaveText(`${shortDayLabel(daysAgo(2))} saved`);\n",
    ),
    "frontend/src/features/notes/black-box-tests/month.spec.ts": spec(
      '  await expect(row).toHaveText("Nov 8");\n',
    ),
    "frontend/src/features/notes/black-box-tests/long.spec.ts": spec(
      '  await expect.soft(row).not.toContainText("November 8, 2026");\n  await expect(row).toHaveText(`8 Nov`);\n',
    ),
    "frontend/src/features/notes/black-box-tests/iso.spec.ts": spec(
      '  expect(await row).toBe("2026-11-08");\n',
    ),
    "frontend/src/features/notes/black-box-tests/numeric.spec.ts": spec(
      '  await expect(row).toHaveValue("11/08/2026");\n',
    ),
    // A date outside `expect` is data that the test makes, and `expect` takes
    // text of a locator without a date.
    "frontend/src/features/notes/black-box-tests/outside.spec.ts": spec(
      '  const label = "Nov 8";\n  await expect(page).toHaveTitle("Notes");\n  await expect(row).toHaveText("Saved 8 notes");\n  expect(label).toBeDefined();\n  void page.getByText("Nov 8");\n',
    ),
    "frontend/src/features/notes/black-box-tests/frozen.spec.ts": spec(
      '  await (page as any).clock.setFixedTime(new Date("2026-11-08T10:00:00"));\n  await expect(row).toHaveText("Nov 8");\n',
    ),
    "frontend/src/features/notes/api-tests/export.api-spec.ts": spec(
      '  expect(await row).toEqual("2026-11-08");\n',
    ),
    // Other test files are not black box tests.
    "frontend/src/features/notes/ui/notes-logic.test.ts": spec(
      '  expect(row).toBe("Nov 8");\n',
    ),
  });

  assert.deepEqual(
    problems.filter((problem) => problem.includes("no-fixed-date-in-expect")),
    [
      "frontend/src/features/notes/api-tests/export.api-spec.ts: testing(no-fixed-date-in-expect)",
      "frontend/src/features/notes/black-box-tests/iso.spec.ts: testing(no-fixed-date-in-expect)",
      "frontend/src/features/notes/black-box-tests/long.spec.ts: testing(no-fixed-date-in-expect)",
      "frontend/src/features/notes/black-box-tests/long.spec.ts: testing(no-fixed-date-in-expect)",
      "frontend/src/features/notes/black-box-tests/month.spec.ts: testing(no-fixed-date-in-expect)",
      "frontend/src/features/notes/black-box-tests/numeric.spec.ts: testing(no-fixed-date-in-expect)",
    ],
  );
});
