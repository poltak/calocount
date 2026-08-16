import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureAnalysisJob,
  loadActiveAiProfile,
  saveMealAndTrace,
} from "../workers/ingest/jobs";
import { parseTelegramMealMessage } from "../workers/ingest/telegram";
import type { AiTrace, MealAnalysisResult, StoredAnalysisJob } from "../workers/ingest/types";

const update = {
  update_id: 42,
  message: {
    date: 1_700_000_000,
    from: { id: 123 },
    chat: { id: -456 },
    caption: "Chicken and rice",
    photo: [{ file_id: "small" }, { file_id: "large" }],
  },
};

class RecordingDatabase {
  readonly sql: string[] = [];
  private readonly telegramId = "telegram-row";
  private readonly payloadJson: string;

  constructor(payloadJson: string) {
    this.payloadJson = payloadJson;
  }

  prepare(sql: string): D1PreparedStatement {
    this.sql.push(sql);
    return new RecordingStatement(this, sql);
  }

  batch<T = unknown>(_statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    void _statements;
    return Promise.resolve([]);
  }

  exec(_query: string): Promise<D1ExecResult> {
    void _query;
    return Promise.resolve({ count: 0, duration: 0 });
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    void _constraintOrBookmark;
    throw new Error("not used in test");
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }

  resultFor(sql: string): unknown {
    if (sql.includes("SELECT p.adapter")) {
      return {
        adapter: "openrouter",
        endpoint: "https://router.example.test/v1/chat/completions",
        primary_model: "test/vision-model",
        fallback_models_json: '["test/fallback"]',
        prompt_version: "meal.v2",
        schema_version: "meal.v3",
      };
    }
    if (sql.includes("SELECT id, meal_id, payload_json")) {
      return { id: this.telegramId, meal_id: null, payload_json: this.payloadJson };
    }
    if (sql.includes("SELECT j.id, j.meal_id")) {
      return {
        id: "job_telegram_telegram-row",
        meal_id: "meal_telegram_telegram-row",
        owner_key: "owner",
        state: "pending",
        attempt_count: 0,
        available_after: Date.now(),
        caption: "Chicken and rice",
        photo_key: null,
        photo_mime_type: null,
        payload_json: this.payloadJson,
      };
    }
    return null;
  }
}

class RecordingStatement {

  constructor(private readonly db: RecordingDatabase, private readonly sql: string) {}

  bind(..._values: unknown[]): D1PreparedStatement {
    void _values;
    return this;
  }

  async first<T = Record<string, unknown>>(_columnName?: string): Promise<T | null> {
    void _columnName;
    return this.db.resultFor(this.sql) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: [],
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
      },
    };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: [],
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: true,
        changes: 1,
      },
    };
  }

  raw<T = unknown[]>(options: { readonly columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { readonly columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(
    options?: { readonly columnNames?: boolean },
  ): Promise<[string[], ...T[]] | T[]> {
    if (options?.columnNames) {
      return [[]] as [string[], ...T[]];
    }
    return [] as T[];
  }

}

const analysis: MealAnalysisResult = {
  summary: "Chicken and rice",
  items: [
    {
      name: "Chicken",
      serving: "one breast",
      grams: 180,
      calories: 300,
      proteinGrams: 50,
      carbsGrams: 0,
      fatGrams: 8,
      confidence: "medium",
      assumptions: [],
    },
  ],
  totals: { calories: 300, proteinGrams: 50, carbsGrams: 0, fatGrams: 8 },
  confidence: "medium",
  assumptions: [],
  questions: [],
};

const trace: AiTrace = {
  backend: "openrouter",
  requestedModel: "test/model",
  actualModel: "test/model",
  upstreamProvider: "test-provider",
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 0.001 },
  latencyMs: 100,
  promptVersion: "v1",
  schemaVersion: "v1",
};

test("ensureAnalysisJob uses canonical Telegram, meal, and job tables", async () => {
  const message = parseTelegramMealMessage(update);
  assert.ok(message);
  const db = new RecordingDatabase(message.payloadJson);
  const ensured = await ensureAnalysisJob(db as D1Database, message, "owner");

  assert.equal(ensured.job.mealId, "meal_telegram_telegram-row");
  assert.equal(ensured.job.state, "pending");
  assert.match(db.sql.join("\n"), /telegram_updates/);
  assert.match(db.sql.join("\n"), /meal_logs/);
  assert.match(db.sql.join("\n"), /analysis_jobs/);
  assert.doesNotMatch(db.sql.join("\n"), /INSERT INTO meals/);
});

test("active D1 AI profile overrides provider defaults", async () => {
  const db = new RecordingDatabase(JSON.stringify(update));
  const profile = await loadActiveAiProfile(db as D1Database, "owner");
  assert.deepEqual(profile, {
    adapter: "openrouter",
    endpoint: "https://router.example.test/v1/chat/completions",
    primaryModel: "test/vision-model",
    fallbackModels: ["test/fallback"],
    promptVersion: "meal.v2",
    schemaVersion: "meal.v3",
  });
  assert.match(db.sql.join("\n"), /FROM settings/);
  assert.match(db.sql.join("\n"), /ai_profiles/);
});

test("saveMealAndTrace updates canonical meal tables and AI trace columns", async () => {
  const db = new RecordingDatabase(JSON.stringify(update));
  const job: StoredAnalysisJob = {
    id: "job-1",
    mealId: "meal-1",
    ownerKey: "owner",
    state: "processing",
    attemptCount: 1,
    availableAfter: Date.now(),
    telegramUpdateId: 42,
    telegramUserId: "123",
    telegramFileId: "large",
    telegramChatId: "-456",
    caption: "Chicken and rice",
    capturedAt: new Date(1_700_000_000_000).toISOString(),
    photoKey: null,
    photoMimeType: null,
  };
  await saveMealAndTrace(db as D1Database, job, analysis, trace, "meals/job-1/original", "image/jpeg");

  const sql = db.sql.join("\n");
  assert.match(sql, /UPDATE meal_logs/);
  assert.match(sql, /DELETE FROM meal_items/);
  assert.match(sql, /INSERT INTO meal_items/);
  assert.match(sql, /INSERT INTO ai_runs/);
  assert.match(sql, /UPDATE analysis_jobs/);
  assert.match(sql, /input_text_tokens/);
  assert.match(sql, /reported_cost_usd/);
  assert.doesNotMatch(sql, /INSERT INTO meals/);
});
