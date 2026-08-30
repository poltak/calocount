import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () => ({
  createdAt: integer("created_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
const updatedAt = () => ({
  updatedAt: integer("updated_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Per-owner targets and Telegram configuration. The app uses one row per owner. */
export const settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    telegramUserId: text("telegram_user_id"),
    telegramChatId: text("telegram_chat_id"),
    timezone: text("timezone").notNull().default("UTC"),
    dailyCalorieTarget: integer("daily_calorie_target"),
    dailyProteinTargetG: real("daily_protein_target_g"),
    activeAiProfileId: text("active_ai_profile_id"),
    photoRetentionDays: integer("photo_retention_days").notNull().default(30),
    ...createdAt(),
    ...updatedAt(),
  },
  (table) => [uniqueIndex("settings_owner_key_idx").on(table.ownerKey)],
);

export const dailyWeights = sqliteTable(
  "daily_weights",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    logicalDate: text("logical_date").notNull(),
    weightKg: real("weight_kg").notNull(),
    recordedAt: integer("recorded_at", { mode: "number" }).notNull(),
    ...createdAt(),
    ...updatedAt(),
  },
  (table) => [
    uniqueIndex("daily_weights_owner_date_idx").on(table.ownerKey, table.logicalDate),
  ],
);

export const mealLogs = sqliteTable(
  "meal_logs",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    consumedAt: integer("consumed_at", { mode: "number" }).notNull(),
    source: text("source").notNull().default("dashboard"),
    caption: text("caption").notNull().default(""),
    mealType: text("meal_type"),
    status: text("status").notNull().default("complete"),
    photoKey: text("photo_key"),
    photoMimeType: text("photo_mime_type"),
    photoSizeBytes: integer("photo_size_bytes"),
    totalCalories: real("total_calories").notNull().default(0),
    totalProteinG: real("total_protein_g").notNull().default(0),
    totalCarbsG: real("total_carbs_g").notNull().default(0),
    totalFatG: real("total_fat_g").notNull().default(0),
    confidence: real("confidence"),
    assumptionsJson: text("assumptions_json").notNull().default("[]"),
    notes: text("notes"),
    externalRequestId: text("external_request_id"),
    ...createdAt(),
    ...updatedAt(),
  },
  (table) => [
    index("meal_logs_owner_consumed_at_idx").on(table.ownerKey, table.consumedAt),
    index("meal_logs_owner_status_updated_idx").on(table.ownerKey, table.status, table.updatedAt),
    uniqueIndex("meal_logs_external_request_id_idx").on(table.externalRequestId),
  ],
);

export const mealItems = sqliteTable(
  "meal_items",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    name: text("name").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("serving"),
    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    confidence: real("confidence"),
    source: text("source").notNull().default("manual"),
    ...createdAt(),
    ...updatedAt(),
  },
  (table) => [
    index("meal_items_meal_id_idx").on(table.mealId),
    index("meal_items_owner_meal_id_idx").on(table.ownerKey, table.mealId),
  ],
);

export const analysisJobs = sqliteTable(
  "analysis_jobs",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    state: text("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    availableAfter: integer("available_after", { mode: "number" }).notNull(),
    ...createdAt(),
    ...updatedAt(),
  },
  (table) => [
    index("analysis_jobs_owner_state_available_idx").on(table.ownerKey, table.state, table.availableAfter),
    index("analysis_jobs_meal_id_idx").on(table.mealId),
  ],
);

export const mealRevisions = sqliteTable(
  "meal_revisions",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id").notNull(),
    ownerKey: text("owner_key").notNull(),
    source: text("source").notNull().default("dashboard"),
    beforeJson: text("before_json").notNull(),
    afterJson: text("after_json").notNull(),
    reason: text("reason").notNull().default("correction"),
    ...createdAt(),
  },
  (table) => [index("meal_revisions_owner_meal_created_idx").on(table.ownerKey, table.mealId, table.createdAt)],
);

export const aiProfiles = sqliteTable(
  "ai_profiles",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    adapter: text("adapter").notNull().default("openrouter"),
    endpoint: text("endpoint"),
    primaryModel: text("primary_model").notNull(),
    fallbackModelsJson: text("fallback_models_json").notNull().default("[]"),
    requiredCapabilitiesJson: text("required_capabilities_json").notNull().default("[\"image\",\"structured_outputs\"]"),
    privacyPolicyJson: text("privacy_policy_json").notNull().default("{\"zdr\":true,\"data_collection\":\"deny\"}"),
    maxInputPrice: real("max_input_price"),
    maxOutputPrice: real("max_output_price"),
    promptVersion: text("prompt_version").notNull().default("v1"),
    schemaVersion: text("schema_version").notNull().default("v1"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    ...createdAt(),
    ...updatedAt(),
  },
  (table) => [
    index("ai_profiles_owner_enabled_idx").on(table.ownerKey, table.enabled),
    uniqueIndex("ai_profiles_owner_id_idx").on(table.ownerKey, table.id),
  ],
);

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id"),
    jobId: text("job_id"),
    ownerKey: text("owner_key").notNull(),
    requestId: text("request_id"),
    adapter: text("adapter").notNull(),
    requestedModel: text("requested_model"),
    actualModel: text("actual_model"),
    upstreamProvider: text("upstream_provider"),
    fallbackFromModel: text("fallback_from_model"),
    promptVersion: text("prompt_version"),
    schemaVersion: text("schema_version"),
    inputTextTokens: integer("input_text_tokens"),
    inputImageTokens: integer("input_image_tokens"),
    outputTokens: integer("output_tokens"),
    reportedCostUsd: real("reported_cost_usd"),
    rawUsageJson: text("raw_usage_json"),
    status: text("status").notNull().default("complete"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    ...createdAt(),
  },
  (table) => [
    index("ai_runs_owner_created_idx").on(table.ownerKey, table.createdAt),
    index("ai_runs_owner_meal_created_idx").on(table.ownerKey, table.mealId, table.createdAt),
  ],
);

export const telegramUpdates = sqliteTable(
  "telegram_updates",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    updateId: integer("update_id").notNull(),
    chatId: text("chat_id"),
    telegramUserId: text("telegram_user_id"),
    mealId: text("meal_id"),
    payloadJson: text("payload_json").notNull(),
    processedAt: integer("processed_at", { mode: "number" }),
    ...createdAt(),
  },
  (table) => [
    uniqueIndex("telegram_updates_owner_update_idx").on(table.ownerKey, table.updateId),
    index("telegram_updates_owner_created_idx").on(table.ownerKey, table.createdAt),
  ],
);

/** Share links expose a read-only projection without storing the raw token. */
export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    ...createdAt(),
    expiresAt: integer("expires_at", { mode: "number" }),
    revokedAt: integer("revoked_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("share_links_token_hash_idx").on(table.tokenHash),
    index("share_links_owner_created_idx").on(table.ownerKey, table.createdAt),
  ],
);

export type Settings = typeof settings.$inferSelect;
export type MealLog = typeof mealLogs.$inferSelect;
export type MealItem = typeof mealItems.$inferSelect;
export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type MealRevision = typeof mealRevisions.$inferSelect;
export type AiProfile = typeof aiProfiles.$inferSelect;
export type AiRun = typeof aiRuns.$inferSelect;
export type TelegramUpdate = typeof telegramUpdates.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
