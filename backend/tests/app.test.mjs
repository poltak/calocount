import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Database as InMemoryDatabase } from "../dist/database/in-memory/database.js";
import { Database as LiveDatabase } from "../dist/database/live/database.js";
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
  it("wires live storage and services", () => {
    const app = createLiveApp();

    assert.ok(
      app.storage.encounterLifecycle instanceof EncounterLifecycleStorage,
    );
    assert.ok(app.storage.encounterLifecycle.props.db instanceof LiveDatabase);
    assert.ok(app.services.ai instanceof LiveAIService);
    assert.ok(app.services.transcription instanceof LiveTranscriptionService);
    assert.ok(app.services.patientRecords instanceof LivePatientRecordsService);
  });

  it("wires isolated storage and fake services for tests", () => {
    const first = createTestApp();
    const second = createTestApp();

    assert.ok(
      first.storage.encounterLifecycle instanceof EncounterLifecycleStorage,
    );
    assert.ok(
      first.storage.encounterLifecycle.props.db instanceof InMemoryDatabase,
    );
    assert.ok(first.services.ai instanceof FakeAIService);
    assert.ok(first.services.transcription instanceof FakeTranscriptionService);
    assert.ok(
      first.services.patientRecords instanceof FakePatientRecordsService,
    );
    assert.notStrictEqual(
      first.storage.encounterLifecycle,
      second.storage.encounterLifecycle,
    );
    assert.notStrictEqual(first.services.ai, second.services.ai);
    assert.notStrictEqual(
      first.storage.encounterLifecycle.props.db,
      second.storage.encounterLifecycle.props.db,
    );
  });
});
