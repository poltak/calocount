import { parseTelegramMealMessage } from "./telegram";
import type {
  AiTrace,
  AiProfileConfig,
  MealAnalysisResult,
  StoredAnalysisJob,
  TelegramPhotoMessage,
} from "./types";

function nowMs(): number {
  return Date.now();
}

function ownerKeyValue(ownerKey: string): string {
  const value = ownerKey.trim();
  if (value.length === 0 || value.length > 160) {
    throw new Error("owner_key_not_configured");
  }
  return value;
}

function confidenceScore(value: string): number {
  if (value === "high") return 1;
  if (value === "medium") return 0.5;
  return 0.25;
}

export interface EnsureJobResult {
  readonly job: StoredAnalysisJob;
  readonly created: boolean;
}

interface TelegramUpdateRow {
  readonly id: string;
  readonly meal_id: string | null;
  readonly payload_json: string;
}

interface CanonicalJobRow {
  readonly id: string;
  readonly meal_id: string;
  readonly owner_key: string;
  readonly state: string;
  readonly attempt_count: number;
  readonly available_after: number;
  readonly caption: string;
  readonly photo_key: string | null;
  readonly photo_mime_type: string | null;
  readonly payload_json: string;
}

interface ActiveAiProfileRow {
  readonly adapter: string;
  readonly endpoint: string | null;
  readonly primary_model: string;
  readonly fallback_models_json: string;
  readonly prompt_version: string;
  readonly schema_version: string;
}

function profileFallbackModels(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((model): model is string => typeof model === "string" && model.trim().length > 0);
  } catch {
    return [];
  }
}

export async function loadActiveAiProfile(
  db: D1Database,
  ownerKeyInput: string,
): Promise<AiProfileConfig | null> {
  const ownerKey = ownerKeyValue(ownerKeyInput);
  const row = await db
    .prepare(
      `SELECT p.adapter, p.endpoint, p.primary_model, p.fallback_models_json,
              p.prompt_version, p.schema_version
       FROM settings s
       INNER JOIN ai_profiles p
         ON p.id = s.active_ai_profile_id AND p.owner_key = s.owner_key
       WHERE s.owner_key = ? AND p.enabled = 1
       LIMIT 1`,
    )
    .bind(ownerKey)
    .first<ActiveAiProfileRow>();
  if (!row || row.primary_model.trim().length === 0) {
    return null;
  }
  return {
    adapter: row.adapter.trim() || "openrouter",
    endpoint: row.endpoint?.trim() || null,
    primaryModel: row.primary_model.trim(),
    fallbackModels: profileFallbackModels(row.fallback_models_json),
    promptVersion: row.prompt_version.trim() || "v1",
    schemaVersion: row.schema_version.trim() || "v1",
  };
}

function parsePayload(payloadJson: string): TelegramPhotoMessage {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson) as unknown;
  } catch {
    throw new Error("telegram_payload_invalid");
  }
  const message = parseTelegramMealMessage(payload);
  if (!message) {
    throw new Error("telegram_payload_not_a_meal");
  }
  return message;
}

function hydrateJob(row: CanonicalJobRow): StoredAnalysisJob {
  const message = parsePayload(row.payload_json);
  return {
    id: row.id,
    mealId: row.meal_id,
    ownerKey: row.owner_key,
    state: row.state,
    attemptCount: row.attempt_count,
    availableAfter: row.available_after,
    telegramUpdateId: message.updateId,
    telegramUserId: message.userId,
    telegramFileId: message.fileId,
    telegramChatId: message.chatId,
    caption: row.caption,
    capturedAt: message.capturedAt,
    photoKey: row.photo_key,
    photoMimeType: row.photo_mime_type,
  };
}

async function loadJobById(db: D1Database, jobId: string): Promise<StoredAnalysisJob | null> {
  const row = await db
    .prepare(
      `SELECT j.id, j.meal_id, j.owner_key, j.state, j.attempt_count,
              j.available_after, l.caption, l.photo_key, l.photo_mime_type,
              t.payload_json
       FROM analysis_jobs j
       INNER JOIN meal_logs l ON l.id = j.meal_id AND l.owner_key = j.owner_key
       INNER JOIN telegram_updates t ON t.meal_id = j.meal_id AND t.owner_key = j.owner_key
       WHERE j.id = ?
       LIMIT 1`,
    )
    .bind(jobId)
    .first<CanonicalJobRow>();
  return row ? hydrateJob(row) : null;
}

/**
 * Create the durable Telegram update, pending meal log, and analysis job.
 *
 * Telegram's unique `(owner_key, update_id)` index is the first deduplication
 * boundary. IDs derived from the inserted telegram row make the following
 * inserts idempotent even if two webhook requests race before the row is
 * updated with its meal id.
 */
export async function ensureAnalysisJob(
  db: D1Database,
  message: TelegramPhotoMessage,
  ownerKeyInput = "default",
): Promise<EnsureJobResult> {
  const ownerKey = ownerKeyValue(ownerKeyInput);
  const telegramRowId = crypto.randomUUID();
  const updateInsert = await db
    .prepare(
      `INSERT INTO telegram_updates
       (id, owner_key, update_id, chat_id, telegram_user_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (owner_key, update_id) DO NOTHING`,
    )
    .bind(
      telegramRowId,
      ownerKey,
      message.updateId,
      message.chatId,
      message.userId,
      message.payloadJson,
    )
    .run();

  const telegramUpdate = await db
    .prepare(
      `SELECT id, meal_id, payload_json
       FROM telegram_updates
       WHERE owner_key = ? AND update_id = ?
       LIMIT 1`,
    )
    .bind(ownerKey, message.updateId)
    .first<TelegramUpdateRow>();
  if (!telegramUpdate) {
    throw new Error("telegram_update_not_created");
  }

  const mealId = telegramUpdate.meal_id ?? `meal_telegram_${telegramUpdate.id}`;
  const consumedAt = Date.parse(message.capturedAt);
  if (!Number.isSafeInteger(consumedAt)) {
    throw new Error("telegram_timestamp_invalid");
  }

  await db
    .prepare(
      `INSERT INTO meal_logs
       (id, owner_key, consumed_at, source, caption, status,
        photo_key, photo_mime_type, total_calories, total_protein_g,
        total_carbs_g, total_fat_g, assumptions_json)
       VALUES (?, ?, ?, 'telegram', ?, 'pending', NULL, NULL, 0, 0, 0, 0, '[]')
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(mealId, ownerKey, consumedAt, message.caption)
    .run();

  await db
    .prepare(
      `UPDATE telegram_updates
       SET meal_id = ?
       WHERE owner_key = ? AND update_id = ? AND (meal_id IS NULL OR meal_id = '')`,
    )
    .bind(mealId, ownerKey, message.updateId)
    .run();

  const jobId = `job_telegram_${telegramUpdate.id}`;
  const jobInsert = await db
    .prepare(
      `INSERT INTO analysis_jobs
       (id, meal_id, owner_key, state, attempt_count, available_after)
       VALUES (?, ?, ?, 'pending', 0, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .bind(jobId, mealId, ownerKey, nowMs())
    .run();

  const job = await loadJobById(db, jobId);
  if (!job) {
    throw new Error("analysis_job_not_created");
  }

  return {
    job,
    created: (updateInsert.meta?.changes ?? 0) > 0 || (jobInsert.meta?.changes ?? 0) > 0,
  };
}

export async function claimAnalysisJob(db: D1Database, jobId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE analysis_jobs
       SET state = 'processing', attempt_count = attempt_count + 1,
           updated_at = ?
       WHERE id = ? AND state IN ('pending', 'retry') AND available_after <= ?`,
    )
    .bind(nowMs(), jobId, nowMs())
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function loadAnalysisJob(
  db: D1Database,
  jobId: string,
): Promise<StoredAnalysisJob | null> {
  return loadJobById(db, jobId);
}

export async function markJobRetry(
  db: D1Database,
  jobId: string,
  errorCode: string,
  delayMs = 10_000,
): Promise<void> {
  const safeCode = errorCode.slice(0, 80);
  const timestamp = nowMs();
  await db
    .prepare(
      `UPDATE analysis_jobs
       SET state = 'retry', last_error_code = ?, last_error_message = ?,
           available_after = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(safeCode, safeCode, timestamp + Math.max(0, delayMs), timestamp, jobId)
    .run();
}

export async function markJobFailed(
  db: D1Database,
  jobId: string,
  errorCode: string,
): Promise<void> {
  const safeCode = errorCode.slice(0, 80);
  const timestamp = nowMs();
  await db
    .prepare(
      `UPDATE analysis_jobs
       SET state = 'failed', last_error_code = ?, last_error_message = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(safeCode, safeCode, timestamp, jobId)
    .run();
  await db
    .prepare(
      `UPDATE meal_logs
       SET status = 'failed', updated_at = ?
       WHERE id = (SELECT meal_id FROM analysis_jobs WHERE id = ?)`
    )
    .bind(timestamp, jobId)
    .run();
}

export async function saveMealAndTrace(
  db: D1Database,
  job: StoredAnalysisJob,
  analysis: MealAnalysisResult,
  trace: AiTrace,
  photoKey: string,
  photoMimeType: string,
): Promise<void> {
  const timestamp = nowMs();
  const assumptionsJson = JSON.stringify(analysis.assumptions);

  await db
    .prepare(
      `UPDATE meal_logs
       SET status = 'complete', photo_key = ?, photo_mime_type = ?,
           total_calories = ?, total_protein_g = ?, total_carbs_g = ?,
           total_fat_g = ?, confidence = ?, assumptions_json = ?, updated_at = ?
       WHERE id = ? AND owner_key = ?`,
    )
    .bind(
      photoKey,
      photoMimeType,
      analysis.totals.calories,
      analysis.totals.proteinGrams,
      analysis.totals.carbsGrams ?? 0,
      analysis.totals.fatGrams ?? 0,
      confidenceScore(analysis.confidence),
      assumptionsJson,
      timestamp,
      job.mealId,
      job.ownerKey,
    )
    .run();

  await db
    .prepare(`DELETE FROM meal_items WHERE meal_id = ? AND owner_key = ?`)
    .bind(job.mealId, job.ownerKey)
    .run();

  for (const item of analysis.items) {
    const quantity = item.grams ?? 1;
    const unit = item.grams === null ? item.serving.slice(0, 80) || "serving" : "g";
    await db
      .prepare(
        `INSERT INTO meal_items
         (id, meal_id, owner_key, name, quantity, unit, calories,
          protein_g, carbs_g, fat_g, confidence, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        job.mealId,
        job.ownerKey,
        item.name,
        quantity,
        unit,
        item.calories,
        item.proteinGrams,
        item.carbsGrams ?? 0,
        item.fatGrams ?? 0,
        confidenceScore(item.confidence),
        timestamp,
        timestamp,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT INTO ai_runs
       (id, meal_id, job_id, owner_key, adapter, requested_model,
        actual_model, upstream_provider, prompt_version, schema_version,
        input_text_tokens, input_image_tokens, output_tokens,
        reported_cost_usd, raw_usage_json, status, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?)`,
    )
    .bind(
      crypto.randomUUID(),
      job.mealId,
      job.id,
      job.ownerKey,
      trace.backend,
      trace.requestedModel,
      trace.actualModel,
      trace.upstreamProvider,
      trace.promptVersion,
      trace.schemaVersion,
      trace.usage.inputTokens,
      null,
      trace.usage.outputTokens,
      trace.usage.costUsd,
      JSON.stringify(trace.usage),
      trace.latencyMs,
    )
    .run();

  await db
    .prepare(
      `UPDATE analysis_jobs
       SET state = 'complete', last_error_code = NULL, last_error_message = ?, updated_at = ?
       WHERE id = ? AND meal_id = ? AND owner_key = ?`,
    )
    .bind(null, timestamp, job.id, job.mealId, job.ownerKey)
    .run();

  await db
    .prepare(
      `UPDATE telegram_updates
       SET processed_at = ?
       WHERE owner_key = ? AND update_id = ?`,
    )
    .bind(timestamp, job.ownerKey, job.telegramUpdateId)
    .run();
}

export async function recordAiFailure(
  db: D1Database,
  job: StoredAnalysisJob,
  trace: AiTrace | null,
  errorCode: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_runs
       (id, meal_id, job_id, owner_key, adapter, requested_model,
        actual_model, upstream_provider, prompt_version, schema_version,
        input_text_tokens, input_image_tokens, output_tokens,
        reported_cost_usd, raw_usage_json, status, error_code, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      job.mealId,
      job.id,
      job.ownerKey,
      trace?.backend ?? "unknown",
      trace?.requestedModel ?? null,
      trace?.actualModel ?? null,
      trace?.upstreamProvider ?? null,
      trace?.promptVersion ?? null,
      trace?.schemaVersion ?? null,
      trace?.usage.inputTokens ?? null,
      null,
      trace?.usage.outputTokens ?? null,
      trace?.usage.costUsd ?? null,
      trace ? JSON.stringify(trace.usage) : null,
      errorCode.slice(0, 80),
      trace?.latencyMs ?? null,
    )
    .run();
}

export async function findStaleAnalysisJobs(
  db: D1Database,
  staleMinutes = 15,
): Promise<readonly string[]> {
  const safeMinutes = Math.max(1, Math.min(240, Math.floor(staleMinutes)));
  const result = await db
    .prepare(
      `SELECT id FROM analysis_jobs
       WHERE state = 'processing' AND updated_at < ?
       ORDER BY updated_at ASC
       LIMIT 25`,
    )
    .bind(nowMs() - safeMinutes * 60_000)
    .all<{ readonly id: string }>();
  return result.results
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function resetStaleAnalysisJob(db: D1Database, jobId: string): Promise<void> {
  const timestamp = nowMs();
  await db
    .prepare(
      `UPDATE analysis_jobs
       SET state = 'retry', last_error_code = 'stale_job',
           last_error_message = 'stale_job', available_after = ?, updated_at = ?
       WHERE id = ? AND state = 'processing'`,
    )
    .bind(timestamp, timestamp, jobId)
    .run();
}

export function retryLimit(value: string | undefined): number {
  const parsed = value ? Number(value) : 3;
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : 3;
}
