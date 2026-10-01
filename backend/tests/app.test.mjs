import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Kysely, sql } from "kysely";
import { Logic } from "@shadow/common/features/core/logic/logic";

import { FakeAIService } from "../dist/features/ai/services/fake-ai-service.js";
import { LiveAIService } from "../dist/features/ai/services/live-ai-service.js";
import { EncounterLifecycleLogic } from "../dist/features/encounter-lifecycle/logic/encounter-lifecycle-logic.js";
import { EncounterLifecycleStorage } from "../dist/features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { FakePatientRecordsService } from "../dist/features/patient-records/services/fake-patient-records-service.js";
import { LivePatientRecordsService } from "../dist/features/patient-records/services/live-patient-records-service.js";
import { FakeTranscriptionService } from "../dist/features/transcription/services/fake-transcription-service.js";
import { LiveTranscriptionService } from "../dist/features/transcription/services/live-transcription-service.js";
import { createApp as createLiveApp } from "../dist/live/index.js";
import { createApp as createTestApp } from "../dist/tests/index.js";

describe("createApp", () => {
  it("requires a database URL for the live app", () => {
    assert.throws(
      () => createLiveApp({ databaseUrl: "" }),
      /DATABASE_URL is required/,
    );
  });

  it("wires live storage, services, and Logic without connecting", async () => {
    const app = createLiveApp({
      databaseUrl: "postgresql://user:password@127.0.0.1:1/shadow",
      auth: {
        secret: "test-secret-that-is-at-least-32-characters",
        baseUrl: "http://shadow.test",
        trustedOrigins: [],
      },
      ownerEmail: "owner@example.test",
    });

    try {
      assert.ok(
        app.storage.encounterLifecycle instanceof EncounterLifecycleStorage,
      );
      assert.ok(app.storage.encounterLifecycle.props.db instanceof Kysely);
      assert.ok(app.services.ai instanceof LiveAIService);
      assert.ok(app.services.transcription instanceof LiveTranscriptionService);
      assert.ok(
        app.services.patientRecords instanceof LivePatientRecordsService,
      );
      assert.ok(
        app.logic.encounterLifecycle instanceof EncounterLifecycleLogic,
      );
      assert.ok(app.logic.encounterLifecycle instanceof Logic);
      assert.strictEqual(
        app.logic.encounterLifecycle.props.storage.encounterLifecycle,
        app.storage.encounterLifecycle,
      );
      assert.strictEqual(
        app.logic.encounterLifecycle.props.services,
        app.services,
      );
      assert.strictEqual(
        app.logic.encounterLifecycle.deps,
        app.logic.encounterLifecycle.props,
      );
    } finally {
      await app.close();
    }
  });

  it("wires a working in-memory database and fake services", async () => {
    const first = createTestApp();
    const second = createTestApp();

    try {
      assert.ok(
        first.storage.encounterLifecycle instanceof EncounterLifecycleStorage,
      );
      assert.ok(first.db instanceof Kysely);
      assert.ok(first.services.ai instanceof FakeAIService);
      assert.ok(
        first.services.transcription instanceof FakeTranscriptionService,
      );
      assert.ok(
        first.services.patientRecords instanceof FakePatientRecordsService,
      );
      assert.ok(
        first.logic.encounterLifecycle instanceof EncounterLifecycleLogic,
      );
      assert.strictEqual(
        first.logic.encounterLifecycle.props.storage.encounterLifecycle,
        first.storage.encounterLifecycle,
      );
      assert.strictEqual(
        first.logic.encounterLifecycle.props.services,
        first.services,
      );
      assert.strictEqual(
        first.logic.encounterLifecycle.deps,
        first.logic.encounterLifecycle.props,
      );
      assert.notStrictEqual(
        first.logic.encounterLifecycle,
        second.logic.encounterLifecycle,
      );
      assert.notStrictEqual(
        first.logic.encounterLifecycle.state,
        second.logic.encounterLifecycle.state,
      );
      assert.notStrictEqual(first.db, second.db);

      const result = await sql`select 42 as answer`.execute(first.db);
      assert.deepEqual(result.rows, [{ answer: 42 }]);

      await sql`create table isolation_check (id integer)`.execute(first.db);
      await assert.rejects(
        sql`select id from isolation_check`.execute(second.db),
        /does not exist/,
      );
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });

  it("releases the database even when Logic cleanup fails", async (context) => {
    const app = createTestApp();
    const db = app.db;
    const destroy = db.destroy.bind(db);
    const calls = [];

    context.mock.method(app.logic.encounterLifecycle, "cleanup", async () => {
      calls.push("logic");
      throw new Error("cleanup failed");
    });
    context.mock.method(db, "destroy", async () => {
      calls.push("database");
      await destroy();
    });

    try {
      await assert.rejects(app.close(), /cleanup failed/);
      assert.deepEqual(calls, ["logic", "database"]);
    } finally {
      await destroy();
    }
  });
});
