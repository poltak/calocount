import assert from "node:assert/strict";
import test from "node:test";
import { lint } from "./lint-fixture.ts";
import {
  coreFiles,
  feature,
  importLogic,
  importProps,
} from "./lint-test-helpers.ts";

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
