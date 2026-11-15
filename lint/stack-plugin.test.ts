import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { lint, oxlint, repoRoot } from "./lint-fixture.ts";
import {
  coreFiles,
  feature,
  importLogic,
  logicTest,
  type OxlintOutput,
} from "./lint-test-helpers.ts";

const page = (name: string) => `frontend/src/features/notes/ui/${name}.tsx`;

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

  let output: string;
  try {
    output = execFileSync(
      oxlint,
      ["-c", path.join(repoRoot, ".oxlintrc.json"), "-f", "json", "."],
      { cwd: directory, encoding: "utf8" },
    );
  } catch (error) {
    output = (error as { stdout: string }).stdout;
  }

  assert.deepEqual(
    (JSON.parse(output) as OxlintOutput).diagnostics
      .filter((problem) => problem.code.includes("post-message"))
      .map((problem) => problem.filename.split("/").at(-2))
      .toSorted(),
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

const call = (param: string) =>
  `export const run = (client: any, id: string, rest: object) => client.get({ param: ${param} });\n`;

test("requires encodeApiParam for each path parameter in the frontend", async (context) => {
  const problems = await lint(context, {
    "frontend/src/features/notes/ui/ok.ts": call("{ id: encodeApiParam(id) }"),
    "frontend/src/features/notes/ui/raw.ts": call("{ id }"),
    "frontend/src/features/notes/ui/spread.ts": call("{ ...rest }"),
    "frontend/src/features/notes/ui/other.ts": call("{ id: String(id) }"),
    "frontend/src/features/notes/ui/raw.test.ts": call("{ id }"),
    "frontend/src/features/core/tests/seed.ts": call("{ id }"),
    "backend/src/features/notes/utils/raw.ts": call("{ id }"),
    "frontend/src/features/notes/ui/variable-ok.ts":
      "export const run = (client: any, id: string) => {\n  const param = { id: encodeApiParam(id) };\n  return client.get({ param });\n};\n",
    "frontend/src/features/notes/ui/variable-raw.ts":
      "export const run = (client: any, id: string) => {\n  const param = { id };\n  return client.get({ param });\n};\n",
  });

  assert.deepEqual(problems, [
    "frontend/src/features/notes/ui/other.ts: stack(encode-api-params)",
    "frontend/src/features/notes/ui/raw.ts: stack(encode-api-params)",
    "frontend/src/features/notes/ui/spread.ts: stack(encode-api-params)",
    "frontend/src/features/notes/ui/variable-raw.ts: stack(encode-api-params)",
  ]);
});

test("allows the zod validator only in core handlers", async (context) => {
  const source =
    'import { zValidator } from "@hono/zod-validator";\nexport const v = zValidator;\n';
  const problems = await lint(context, {
    [`${feature("core")}/handlers/validator.ts`]: source,
    [`${feature("notes")}/handlers/notes-handlers.ts`]: source,
  });

  assert.deepEqual(problems, [
    "backend/src/features/notes/handlers/notes-handlers.ts: stack(vendor-imports)",
  ]);
});
