import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Kysely, sql } from "kysely";

import { AIService as FakeAIService } from "../dist/features/ai/services/fake-ai-service.js";
import { AIService as LiveAIService } from "../dist/features/ai/services/ai-service.js";
import { EncounterLifecycleStorage } from "../dist/features/encounter-lifecycle/storage/encounter-lifecycle-storage.js";
import { PatientRecordsService as FakePatientRecordsService } from "../dist/features/patient-records/services/fake-patient-records-service.js";
import { PatientRecordsService as LivePatientRecordsService } from "../dist/features/patient-records/services/patient-records-service.js";
import { TranscriptionService as FakeTranscriptionService } from "../dist/features/transcription/services/fake-transcription-service.js";
import { TranscriptionService as LiveTranscriptionService } from "../dist/features/transcription/services/transcription-service.js";
import { createApp as createLiveApp } from "../dist/live/index.js";
import { createApp as createTestApp } from "../dist/tests/index.js";

describe("createApp", () => {
  it("requires a database URL for the live app", () => {
    assert.throws(
      () => createLiveApp({ databaseUrl: "" }),
      /DATABASE_URL is required/,
    );
  });

  it("wires live storage and services without connecting", async () => {
    const app = createLiveApp({
      databaseUrl: "postgresql://user:password@127.0.0.1:1/shadow",
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
      assert.ok(first.storage.encounterLifecycle.props.db instanceof Kysely);
      assert.ok(first.services.ai instanceof FakeAIService);
      assert.ok(
        first.services.transcription instanceof FakeTranscriptionService,
      );
      assert.ok(
        first.services.patientRecords instanceof FakePatientRecordsService,
      );
      assert.notStrictEqual(
        first.storage.encounterLifecycle.props.db,
        second.storage.encounterLifecycle.props.db,
      );

      const result = await sql`select 42 as answer`.execute(
        first.storage.encounterLifecycle.props.db,
      );
      assert.deepEqual(result.rows, [{ answer: 42 }]);

      await sql`create table isolation_check (id integer)`.execute(
        first.storage.encounterLifecycle.props.db,
      );
      await assert.rejects(
        sql`select id from isolation_check`.execute(
          second.storage.encounterLifecycle.props.db,
        ),
        /does not exist/,
      );
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
