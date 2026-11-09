import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const lintDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(lintDirectory, "..");
const oxlint = path.join(repoRoot, "node_modules/.bin/oxlint");

/** The repository's own rule options, so the tests cover the real configuration. */
async function projectRules() {
  const config = JSON.parse(
    await readFile(path.join(repoRoot, ".oxlintrc.json"), "utf8"),
  );
  return Object.fromEntries(
    Object.entries(config.rules).filter(([name]) =>
      /^(?:architecture|stack|testing)\//.test(name),
    ),
  );
}

/**
 * Lint fixture files with the project's architecture, stack, and testing rules.
 * Returns "<file>: <rule>" for every problem found.
 */
async function lint(context, files, { plugins = lintDirectory } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const configPath = path.join(directory, "oxlintrc.json");
  await writeFile(
    configPath,
    JSON.stringify({
      plugins: ["typescript"],
      categories: {},
      jsPlugins: [
        path.join(plugins, "architecture-plugin.mjs"),
        path.join(plugins, "stack-plugin.mjs"),
        path.join(plugins, "testing-plugin.mjs"),
      ],
      rules: await projectRules(),
    }),
  );

  let output;
  try {
    output = execFileSync(oxlint, ["-c", configPath, "-f", "json", "."], {
      cwd: directory,
      encoding: "utf8",
    });
  } catch (error) {
    output = error.stdout;
  }
  return JSON.parse(output)
    .diagnostics.filter((problem) =>
      /^(?:architecture|stack|testing)\(/.test(problem.code),
    )
    .map(
      (problem) =>
        `${path.relative(directory, path.resolve(directory, problem.filename))}: ${problem.code}`,
    )
    .sort();
}

const feature = (name) => `backend/src/features/${name}`;

/** Stand-ins for the shared Logic base class and props type, as core provides them. */
const coreFiles = (workspace) => ({
  [`${workspace}/src/features/core/logic/logic.ts`]:
    "export class Logic<T = unknown> {\n  constructor(readonly options?: T) {}\n}\n",
  [`${workspace}/src/features/core/logic/types.ts`]:
    "export type BackendLogicProps<S, T> = { s: S; t: T };\n",
});
const importLogic = 'import { Logic } from "../../core/logic/logic.js";\n';
const importProps =
  'import type { BackendLogicProps } from "../../core/logic/types.js";\n';

/** A UI Logic test that follows docs/agents/testing.md. */
const logicTest =
  'import { setupLogicTest } from "../../core/tests/full-application.js";\nexport const setupTest = () => setupLogicTest({}, () => null);\n';

test("accepts a feature that follows the architecture", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/services/types.ts`]:
      "export interface MailServiceInterface {}\n",
    [`${feature("notes")}/services/smtp-mail-service.ts`]:
      'import type { MailServiceInterface } from "./types.js";\nexport class SmtpMailService implements MailServiceInterface {\n  constructor(private readonly deps: { host: string }) {}\n}\n',
    [`${feature("notes")}/storage/notes-storage.ts`]:
      "export class NotesStorage {\n  constructor(private readonly deps: { db: unknown }) {}\n}\n",
    [`${feature("notes")}/logic/notes-logic.ts`]:
      importLogic +
      importProps +
      'import { AppError } from "../../core/errors/app-error.js";\nimport type { OtherThing } from "../../other/types.js";\nexport class NotesLogic extends Logic<unknown> {\n  constructor(deps: BackendLogicProps<"notes" | "notesArchive", "mail">) {\n    super(deps);\n  }\n  fail(thing: OtherThing) { throw new AppError(thing); }\n}\n',
    [`${feature("core")}/live/index.ts`]:
      'import { SmtpMailService } from "../../notes/services/smtp-mail-service.js";\nimport { NotesStorage } from "../../notes/storage/notes-storage.js";\nexport const app = [new SmtpMailService({ host: "" }), new NotesStorage({ db: 1 })];\n',
    [`${feature("notes")}/logic/notes-logic.test.ts`]:
      'import { SmtpMailService } from "../services/smtp-mail-service.js";\nexport const service = new SmtpMailService({ host: "" });\n',
  });

  assert.deepEqual(problems, []);
});

test("keeps features out of each other's private files", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/logic/notes-logic.ts`]:
      importLogic +
      'import { helper } from "../../other/utils/helper.js";\nimport type { Shared } from "../../other/types.js";\nexport class NotesLogic extends Logic {\n  run(value: Shared) { return helper(value); }\n}\n',
    [`${feature("core")}/handlers/validator.ts`]:
      'import { helper } from "../../other/utils/helper.js";\nexport const validator = helper;\n',
  });

  assert.deepEqual(problems, [
    "backend/src/features/core/handlers/validator.ts: architecture(feature-boundaries)",
    "backend/src/features/notes/logic/notes-logic.ts: architecture(feature-boundaries)",
  ]);
});

test("keeps Storage and Services independent of other layers", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/storage/notes-storage.ts`]:
      'import { NotesLogic } from "../logic/notes-logic.js";\nimport type { App } from "../../core/types.js";\nexport class NotesStorage {\n  logic?: NotesLogic;\n  app?: App;\n}\n',
    [`${feature("notes")}/services/smtp-mail-service.ts`]:
      'import { NotesStorage } from "../storage/notes-storage.js";\nimport type { MailServiceInterface } from "./types.js";\nexport class SmtpMailService implements MailServiceInterface {\n  storage?: NotesStorage;\n}\n',
    // A Service may depend on a Core Service, but not on another feature's Service.
    [`${feature("notes")}/services/push-mail-service.ts`]:
      'import type { LoggerServiceInterface } from "../../core/services/types.js";\nimport type { BillingServiceInterface } from "../../billing/services/types.js";\nimport type { MailServiceInterface } from "./types.js";\nexport class PushMailService implements MailServiceInterface {\n  constructor(\n    private readonly deps: {\n      logger: LoggerServiceInterface;\n      billing: BillingServiceInterface;\n    },\n  ) {}\n}\n',
    // The clock is a second Service of the same feature.
    [`${feature("notes")}/services/queue-mail-service.ts`]:
      'import type { ClockServiceInterface, MailServiceInterface } from "./types.js";\nexport class QueueMailService implements MailServiceInterface {\n  constructor(private readonly deps: { clock: ClockServiceInterface }) {}\n}\n',
    [`${feature("notes")}/storage/archive-storage.ts`]:
      'import type { MailServiceInterface } from "../services/types.js";\nexport class ArchiveStorage {\n  constructor(private readonly deps: { mail: MailServiceInterface }) {}\n}\n',
    [`${feature("notes")}/logic/notes-logic.ts`]:
      importLogic +
      'import { ArchiveLogic } from "./archive-logic.js";\nimport { SmtpMailService } from "../services/smtp-mail-service.js";\nexport class NotesLogic extends Logic {\n  other?: ArchiveLogic;\n  mail = new SmtpMailService();\n}\n',
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/logic/notes-logic.ts: architecture(layer-imports)",
    "backend/src/features/notes/logic/notes-logic.ts: architecture(no-construction)",
    "backend/src/features/notes/logic/notes-logic.ts: architecture(service-implementations)",
    "backend/src/features/notes/services/push-mail-service.ts: architecture(layer-imports)",
    "backend/src/features/notes/services/queue-mail-service.ts: architecture(layer-imports)",
    "backend/src/features/notes/services/smtp-mail-service.ts: architecture(layer-imports)",
    "backend/src/features/notes/storage/archive-storage.ts: architecture(layer-imports)",
    "backend/src/features/notes/storage/notes-storage.ts: architecture(layer-imports)",
    "backend/src/features/notes/storage/notes-storage.ts: architecture(layer-imports)",
  ]);
});

test("lets Logic use only its own feature's Storage", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/logic/notes-logic.ts`]:
      importLogic +
      importProps +
      'export class NotesLogic extends Logic<unknown> {\n  constructor(deps: BackendLogicProps<"auth", "mail">) {\n    super(deps);\n  }\n}\n',
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/logic/notes-logic.ts: architecture(own-storage)",
  ]);
});

test("lets a handler take Logic and Core Services only", async (context) => {
  const importCollections =
    'import type { BackendLogic, BackendServices, BackendStorage } from "../../core/types.js";\n';
  const problems = await lint(context, {
    ...coreFiles("backend"),
    [`${feature("notes")}/handlers/notes-handlers.ts`]:
      importCollections +
      'export type Props = {\n  logic: Pick<BackendLogic, "notes">;\n  services: Pick<BackendServices, "logger">;\n};\n',
    // One problem for each property.
    [`${feature("notes")}/handlers/mail-handlers.ts`]:
      importCollections +
      'export type Props = {\n  services: Pick<BackendServices, "logger" | "mail">;\n  all: BackendServices;\n  storage: Pick<BackendStorage, "notes">;\n};\n',
    // The session middleware reads the session from the auth Service.
    [`${feature("auth")}/handlers/require-session.ts`]:
      importCollections +
      'export type Props = {\n  logic: Pick<BackendLogic, "authAccess">;\n  services: Pick<BackendServices, "auth">;\n};\n',
    [`${feature("auth")}/handlers/session-handlers.ts`]:
      importCollections +
      'export type Props = { services: Pick<BackendServices, "auth"> };\n',
  });

  assert.deepEqual(problems, [
    "backend/src/features/auth/handlers/session-handlers.ts: architecture(handler-dependencies)",
    "backend/src/features/notes/handlers/mail-handlers.ts: architecture(handler-dependencies)",
    "backend/src/features/notes/handlers/mail-handlers.ts: architecture(handler-dependencies)",
    "backend/src/features/notes/handlers/mail-handlers.ts: architecture(handler-dependencies)",
  ]);
});

test("keeps a transaction on the Storage that it provides", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/logic/notes-logic.ts`]:
      importLogic +
      "export class NotesLogic extends Logic {\n  inside() {\n    return this.deps.transaction((storage) => storage.notes.save());\n  }\n  mixed() {\n    return this.deps.transaction(() => this.deps.storage.notes.save());\n  }\n  outside() {\n    return this.deps.storage.notes.save();\n  }\n}\n",
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/logic/notes-logic.ts: architecture(transaction-scope)",
  ]);
});

test("enforces role names and constructor shape", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/services/mailer.ts`]: "export const mailer = 1;\n",
    [`${feature("notes")}/services/smtp-mail-service.ts`]:
      "export class Mailer {\n  constructor(host: string, port: number) {}\n}\n",
    [`${feature("notes")}/storage/notes-storage.ts`]:
      "export class NotesStorage {\n  constructor(readonly deps: { db: unknown }) {}\n}\n",
    [`${feature("notes")}/logic/notes-logic.ts`]:
      "export class NotesLogic {\n  constructor(props: unknown) {}\n}\n",
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/logic/notes-logic.ts: architecture(constructor-deps)",
    "backend/src/features/notes/logic/notes-logic.ts: architecture(role-naming)",
    "backend/src/features/notes/services/mailer.ts: architecture(role-naming)",
    "backend/src/features/notes/services/smtp-mail-service.ts: architecture(constructor-deps)",
    "backend/src/features/notes/services/smtp-mail-service.ts: architecture(role-naming)",
    "backend/src/features/notes/services/smtp-mail-service.ts: architecture(role-naming)",
    "backend/src/features/notes/storage/notes-storage.ts: architecture(constructor-deps)",
  ]);
});

test("requires every source file to sit in a known role directory", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    "backend/src/helpers.ts": "export const helper = 1;\n",
    [`${feature("notes")}/notes.ts`]: "export const notes = 1;\n",
    [`${feature("notes")}/misc/thing.ts`]: "export const thing = 1;\n",
    [`${feature("notes")}/types.ts`]: "export type Note = string;\n",
    [`${feature("notes")}/scripts/import-notes.ts`]: "export const run = 1;\n",
    [`${feature("notes")}/workers/import-worker.ts`]: "export const run = 1;\n",
    "frontend/src/main.tsx": "export const main = 1;\n",
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/misc/thing.ts: architecture(file-layout)",
    "backend/src/features/notes/notes.ts: architecture(file-layout)",
    "backend/src/helpers.ts: architecture(file-layout)",
  ]);
});

test("lets only workers call postMessage with no target origin", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  for (const role of ["workers", "services", "ui"]) {
    const file = path.join(directory, feature("notes"), role, "send.ts");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      "export const send = (worker: Worker) => worker.postMessage(1);\n",
    );
  }

  let output;
  try {
    output = execFileSync(
      oxlint,
      ["-c", path.join(repoRoot, ".oxlintrc.json"), "-f", "json", "."],
      { cwd: directory, encoding: "utf8" },
    );
  } catch (error) {
    output = error.stdout;
  }

  assert.deepEqual(
    JSON.parse(output)
      .diagnostics.filter((problem) => problem.code.includes("post-message"))
      .map((problem) => problem.filename.split("/").at(-2))
      .sort(),
    ["services", "ui"],
  );
});

test("confines vendor packages to the layer that wraps them", async (context) => {
  const problems = await lint(context, {
    ...coreFiles("backend"),
    ...coreFiles("frontend"),
    [`${feature("notes")}/logic/notes-logic.ts`]:
      importLogic +
      'import { betterAuth } from "better-auth";\nimport { Kysely } from "kysely";\nexport class NotesLogic extends Logic {\n  uses = [betterAuth, Kysely];\n}\n',
    [`${feature("notes")}/storage/notes-storage.ts`]:
      'import type { Kysely } from "kysely";\nexport class NotesStorage {\n  constructor(private readonly deps: { db: Kysely<unknown> }) {}\n}\n',
    "frontend/src/features/notes/ui/notes-logic.ts":
      importLogic +
      'import { useMemo } from "react";\nimport type { InferResponseType } from "hono/client";\nexport class NotesLogic extends Logic {\n  uses?: [typeof useMemo, InferResponseType<never>];\n}\n',
    "frontend/src/features/notes/ui/notes-page.tsx":
      'import { useMemo } from "react";\nexport const NotesPage = () => useMemo(() => 0, []);\n',
    "frontend/src/features/notes/ui/notes-logic.test.ts": logicTest,
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/logic/notes-logic.ts: stack(vendor-imports)",
    "backend/src/features/notes/logic/notes-logic.ts: stack(vendor-imports)",
    "frontend/src/features/notes/ui/notes-logic.ts: stack(vendor-imports)",
    "frontend/src/features/notes/ui/notes-logic.ts: stack(vendor-imports)",
  ]);
});

test("keeps state out of frontend components", async (context) => {
  const page = (name) => `frontend/src/features/notes/ui/${name}.tsx`;
  const problems = await lint(context, {
    [page("named")]:
      'import { useState } from "react";\nexport const Page = () => useState(0);\n',
    [page("aliased")]:
      'import { useState as hold } from "react";\nexport const Page = () => hold(0);\n',
    [page("reducer")]:
      'import { useReducer } from "react";\nexport const Page = () => useReducer((n: number) => n, 0);\n',
    [page("action-state")]:
      'import { useActionState } from "react";\nexport const Page = () => useActionState((n: number) => n, 0);\n',
    [page("optimistic")]:
      'import { useOptimistic } from "react";\nexport const Page = () => useOptimistic(0);\n',
    [page("default-import")]:
      'import React from "react";\nexport const Page = () => React.useState(0);\n',
    [page("default-as-name")]:
      'import { default as React } from "react";\nexport const Page = () => React.useState(0);\n',
    [page("namespace")]:
      'import * as React from "react";\nexport const Page = () => React.useState(0);\n',
    [page("dynamic")]:
      'export const load = async () => (await import("react")).useState;\n',
    [page("required")]:
      'export const Page = () => require("react").useState(0);\n',
    [page("re-export")]: 'export { useState } from "react";\n',
    [page("re-export-default")]: 'export { default } from "react";\n',
    [page("re-export-all")]: 'export * from "react";\n',

    [page("allowed-named")]:
      'import { useMemo, type ReactNode } from "react";\nexport const Page = (children: ReactNode) => useMemo(() => children, [children]);\n',
    [page("allowed-types")]:
      'import type React from "react";\nimport type * as ReactTypes from "react";\nimport { type useState } from "react";\nexport type { useReducer } from "react";\nexport type Types = [React.ReactNode, ReactTypes.ReactNode, typeof useState];\n',
    "frontend/src/features/notes/ui/page.test.tsx":
      'import * as React from "react";\nexport const Page = () => React.useState(0);\n',
  });

  assert.deepEqual(
    problems.filter((problem) => problem.includes("no-component-state")),
    [
      "action-state",
      "aliased",
      "default-as-name",
      "default-import",
      "dynamic",
      "named",
      "namespace",
      "optimistic",
      "re-export-all",
      "re-export-default",
      "re-export",
      "reducer",
      "required",
    ].map((name) => `${page(name)}: stack(no-component-state)`),
  );
});

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
  const logic = (name) =>
    importLogic + `export class ${name}Logic extends Logic {}\n`;
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

test("runs a project's stricter rule in a second run, with no default rule", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, feature("notes"), "utils/pay.ts");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    'import stripe from "stripe";\ndebugger;\nexport const pay = stripe;\n',
  );
  // The shape that docs/agents/setup.md gives for `.oxlintrc.project.json`.
  const configPath = path.join(directory, ".oxlintrc.project.json");
  await writeFile(
    configPath,
    JSON.stringify({
      plugins: [],
      categories: { correctness: "off" },
      jsPlugins: [path.join(lintDirectory, "stack-plugin.mjs")],
      rules: {
        "stack/vendor-imports": [
          "error",
          {
            vendors: [
              {
                packages: ["stripe"],
                allowedIn: ["^features/[^/]+/services/"],
                where: "a Service implementation",
              },
            ],
          },
        ],
      },
    }),
  );

  const result = spawnSync(oxlint, ["-c", configPath, "-f", "json", "."], {
    cwd: directory,
    encoding: "utf8",
  });

  assert.deepEqual(
    JSON.parse(result.stdout).diagnostics.map((problem) => problem.code),
    ["stack(vendor-imports)"],
  );
});

/**
 * A copy of `lint/` beside a `lint.project.json`, because the plugins read that
 * file from their parent directory. Returns the path of the copy.
 */
async function pluginsWithProjectFile(context, text) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-project-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await cp(lintDirectory, path.join(directory, "lint"), { recursive: true });
  await writeFile(path.join(directory, "lint.project.json"), text);
  return path.join(directory, "lint");
}

test("adds the project's roles, root files, and composition files to the rules", async (context) => {
  const files = {
    ...coreFiles("backend"),
    "backend/src/worker.ts": "export const entry = 1;\n",
    [`${feature("notes")}/jobs/send.ts`]: "export const send = 1;\n",
    [`${feature("rides")}/tiles/read.ts`]: "export const read = 1;\n",
    [`${feature("notes")}/tiles/read.ts`]: "export const read = 1;\n",
    [`${feature("notes")}/utils/wire.ts`]:
      'import { read } from "../../rides/tiles/read.js";\nexport const wired = read;\n',
  };
  const plugins = await pluginsWithProjectFile(
    context,
    JSON.stringify({
      roles: ["jobs"],
      rolesByFeature: { rides: ["tiles"] },
      srcRootFiles: ["worker.ts"],
      compositionFiles: ["features/notes/utils/wire.ts"],
    }),
  );

  const problems = await lint(context, files, { plugins });

  assert.deepEqual(problems, [
    "backend/src/features/notes/tiles/read.ts: architecture(file-layout)",
  ]);
  assert.deepEqual(await lint(context, files), [
    "backend/src/features/notes/jobs/send.ts: architecture(file-layout)",
    "backend/src/features/notes/tiles/read.ts: architecture(file-layout)",
    "backend/src/features/notes/utils/wire.ts: architecture(feature-boundaries)",
    "backend/src/features/rides/tiles/read.ts: architecture(file-layout)",
    "backend/src/worker.ts: architecture(file-layout)",
  ]);
});

test("lets each feature import a project's shared feature, which imports only template-shared features", async (context) => {
  const plugins = await pluginsWithProjectFile(
    context,
    JSON.stringify({ sharedFeatures: ["geo"] }),
  );

  const problems = await lint(
    context,
    {
      ...coreFiles("backend"),
      [`${feature("geo")}/utils/distance.ts`]:
        'import { Logic } from "../../core/logic/logic.js";\nexport const distance = Logic;\n',
      [`${feature("geo")}/utils/reach-types.ts`]:
        'import type { Note } from "../../notes/types.js";\nexport type Reach = Note;\n',
      [`${feature("geo")}/utils/reach-private.ts`]:
        'import { note } from "../../notes/utils/note.js";\nexport const reach = note;\n',
      [`${feature("notes")}/types.ts`]: "export type Note = string;\n",
      [`${feature("notes")}/utils/note.ts`]:
        'import { distance } from "../../geo/utils/distance.js";\nexport const note = distance;\n',
    },
    { plugins },
  );

  assert.deepEqual(problems, [
    "backend/src/features/geo/utils/reach-private.ts: architecture(feature-boundaries)",
    "backend/src/features/geo/utils/reach-types.ts: architecture(feature-boundaries)",
  ]);
});

test("keeps the boundaries when a project lists each feature as shared", async (context) => {
  const plugins = await pluginsWithProjectFile(
    context,
    JSON.stringify({ sharedFeatures: ["notes", "rides"] }),
  );

  const problems = await lint(
    context,
    {
      [`${feature("rides")}/utils/ride.ts`]: "export const ride = 1;\n",
      [`${feature("notes")}/utils/note.ts`]:
        'import { ride } from "../../rides/utils/ride.js";\nexport const note = ride;\n',
    },
    { plugins },
  );

  assert.deepEqual(problems, [
    "backend/src/features/notes/utils/note.ts: architecture(feature-boundaries)",
  ]);
});

test("stops lint when the project file has a key or a value that it cannot read", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lint-rules-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "file.ts"), "export const file = 1;\n");

  for (const [text, message] of [
    [
      '{ "rules": { "architecture/file-layout": "off" } }',
      /unknown key "rules"/,
    ],
    ['{ "vendors": [] }', /unknown key "vendors"/],
    ['{ "roles": "workers" }', /"roles" must be a list of names/],
    ['{ "roles": [1] }', /"roles" must be a list of names/],
    ['{ "rolesByFeature": ["rides"] }', /"rolesByFeature" must map/],
    ['{ "rolesByFeature": { "rides": "tiles" } }', /"rolesByFeature" must map/],
    ["{ roles", /JSON/],
  ]) {
    const plugins = await pluginsWithProjectFile(context, text);
    const configPath = path.join(directory, "oxlintrc.json");
    await writeFile(
      configPath,
      JSON.stringify({
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins: [path.join(plugins, "architecture-plugin.mjs")],
      }),
    );

    const result = spawnSync(oxlint, ["-c", configPath, "."], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0, text);
    assert.match(`${result.stdout}${result.stderr}`, message, text);
  }
});
