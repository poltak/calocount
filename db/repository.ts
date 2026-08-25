import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  lt,
  sql,
} from "drizzle-orm";
import { getDb } from "./index";
import {
  aiProfiles,
  aiRuns,
  analysisJobs,
  dailyWeights,
  mealItems,
  mealLogs,
  mealRevisions,
  settings,
  telegramUpdates,
} from "./schema";

export type AppDb = ReturnType<typeof getDb>;

export type MealItemInput = {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  confidence?: number | null;
  source?: string;
};

export type MealInput = {
  id?: string;
  consumedAt?: number;
  source?: string;
  caption?: string;
  mealType?: string | null;
  status?: string;
  photoKey?: string | null;
  photoMimeType?: string | null;
  photoSizeBytes?: number | null;
  confidence?: number | null;
  assumptions?: unknown[];
  notes?: string | null;
  items?: MealItemInput[];
};

export type MealPatch = Partial<MealInput> & {
  reason?: string;
};

export type MealWithItems = {
  meal: typeof mealLogs.$inferSelect;
  items: Array<typeof mealItems.$inferSelect>;
};

export type DailyWeightInput = {
  logicalDate: string;
  weightKg: number;
};

export type SettingsPatch = Partial<{
  telegramUserId: string | null;
  telegramChatId: string | null;
  timezone: string;
  dailyCalorieTarget: number | null;
  dailyProteinTargetG: number | null;
  activeAiProfileId: string | null;
  photoRetentionDays: number;
}>;

export type AiProfileInput = {
  id?: string;
  adapter?: string;
  endpoint?: string | null;
  primaryModel: string;
  fallbackModels?: string[];
  requiredCapabilities?: string[];
  privacyPolicy?: Record<string, unknown>;
  maxInputPrice?: number | null;
  maxOutputPrice?: number | null;
  promptVersion?: string;
  schemaVersion?: string;
  enabled?: boolean;
};

export function createId(prefix: string): string {
  let random = `${Date.now()}`;
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      random = crypto.randomUUID();
    } else {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  }
  return `${prefix}_${random}`;
}

export function nowMs(): number {
  return Date.now();
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeJson(value: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function normaliseItem(item: MealItemInput, ownerKey: string, mealId: string) {
  return {
    id: item.id ?? createId("item"),
    mealId,
    ownerKey,
    name: item.name.trim(),
    quantity: finiteNumber(item.quantity, 1),
    unit: item.unit?.trim() || "serving",
    calories: Math.max(0, finiteNumber(item.calories)),
    proteinG: Math.max(0, finiteNumber(item.proteinG)),
    carbsG: Math.max(0, finiteNumber(item.carbsG)),
    fatG: Math.max(0, finiteNumber(item.fatG)),
    confidence: item.confidence == null ? null : finiteNumber(item.confidence),
    source: item.source?.trim() || "manual",
  };
}

export function calculateTotals(items: Array<MealItemInput | typeof mealItems.$inferSelect>) {
  return items.reduce(
    (totals, item) => ({
      calories: totals.calories + Math.max(0, finiteNumber(item.calories)),
      proteinG: totals.proteinG + Math.max(0, finiteNumber(item.proteinG)),
      carbsG: totals.carbsG + Math.max(0, finiteNumber(item.carbsG)),
      fatG: totals.fatG + Math.max(0, finiteNumber(item.fatG)),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

function mealSnapshot(meal: MealWithItems) {
  return {
    meal: meal.meal,
    items: meal.items,
  };
}

export async function listMeals(
  db: AppDb,
  ownerKey: string,
  options: { from?: number; to?: number; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const conditions = [eq(mealLogs.ownerKey, ownerKey)];
  if (options.from != null) conditions.push(gte(mealLogs.consumedAt, options.from));
  if (options.to != null) conditions.push(lt(mealLogs.consumedAt, options.to));

  const meals = await db
    .select()
    .from(mealLogs)
    .where(and(...conditions))
    .orderBy(desc(mealLogs.consumedAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0))
    .prepare()
    .all();

  if (meals.length === 0) return [];

  const ids = meals.map((meal) => meal.id);
  const items = await db
    .select()
    .from(mealItems)
    .where(and(eq(mealItems.ownerKey, ownerKey), inArray(mealItems.mealId, ids)))
    .orderBy(desc(mealItems.createdAt))
    .prepare()
    .all();

  const itemMap = new Map<string, Array<typeof mealItems.$inferSelect>>();
  for (const item of items) {
    const current = itemMap.get(item.mealId) ?? [];
    current.push(item);
    itemMap.set(item.mealId, current);
  }

  return meals.map((meal) => ({ meal, items: itemMap.get(meal.id) ?? [] }));
}

export async function getDailyWeight({
  db,
  ownerKey,
  logicalDate,
}: {
  db: AppDb;
  ownerKey: string;
  logicalDate: string;
}) {
  return db
    .select()
    .from(dailyWeights)
    .where(and(
      eq(dailyWeights.ownerKey, ownerKey),
      eq(dailyWeights.logicalDate, logicalDate),
    ))
    .limit(1)
    .prepare()
    .get();
}

export async function listDailyWeights({
  db,
  ownerKey,
  from,
  to,
}: {
  db: AppDb;
  ownerKey: string;
  from?: string;
  to?: string;
}) {
  const conditions = [eq(dailyWeights.ownerKey, ownerKey)];
  if (from) conditions.push(gte(dailyWeights.logicalDate, from));
  if (to) conditions.push(lte(dailyWeights.logicalDate, to));

  return db
    .select()
    .from(dailyWeights)
    .where(and(...conditions))
    .orderBy(desc(dailyWeights.logicalDate))
    .limit(366)
    .prepare()
    .all();
}

export async function upsertDailyWeight({
  db,
  ownerKey,
  input,
}: {
  db: AppDb;
  ownerKey: string;
  input: DailyWeightInput;
}) {
  const timestamp = nowMs();
  await db
    .insert(dailyWeights)
    .values({
      id: createId("weight"),
      ownerKey,
      logicalDate: input.logicalDate,
      weightKg: input.weightKg,
      recordedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [dailyWeights.ownerKey, dailyWeights.logicalDate],
      set: {
        weightKg: input.weightKg,
        recordedAt: timestamp,
        updatedAt: timestamp,
      },
    })
    .prepare()
    .run();

  const saved = await getDailyWeight({ db, ownerKey, logicalDate: input.logicalDate });
  if (!saved) throw new Error("daily_weight_save_failed");
  return saved;
}

export async function findMeal(db: AppDb, ownerKey: string, mealId: string): Promise<MealWithItems | null> {
  const meal = await db
    .select()
    .from(mealLogs)
    .where(and(eq(mealLogs.ownerKey, ownerKey), eq(mealLogs.id, mealId)))
    .limit(1)
    .prepare()
    .get();
  if (!meal) return null;

  const items = await db
    .select()
    .from(mealItems)
    .where(and(eq(mealItems.ownerKey, ownerKey), eq(mealItems.mealId, mealId)))
    .orderBy(desc(mealItems.createdAt))
    .prepare()
    .all();
  return { meal, items };
}

export async function createMeal(db: AppDb, ownerKey: string, input: MealInput): Promise<MealWithItems> {
  const mealId = input.id ?? createId("meal");
  const items = (input.items ?? []).map((item) => normaliseItem(item, ownerKey, mealId));
  const totals = calculateTotals(items);
  const timestamp = nowMs();

  const mealInsert = db.insert(mealLogs).values({
    id: mealId,
    ownerKey,
    consumedAt: input.consumedAt ?? timestamp,
    source: input.source?.trim() || "dashboard",
    caption: input.caption?.trim() || "",
    mealType: input.mealType ?? null,
    status: input.status?.trim() || "complete",
    photoKey: input.photoKey ?? null,
    photoMimeType: input.photoMimeType ?? null,
    photoSizeBytes: input.photoSizeBytes ?? null,
    totalCalories: totals.calories,
    totalProteinG: totals.proteinG,
    totalCarbsG: totals.carbsG,
    totalFatG: totals.fatG,
    confidence: input.confidence ?? null,
    assumptionsJson: safeJson(input.assumptions, []),
    notes: input.notes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (items.length > 0) {
    await db.batch([
      mealInsert,
      db.insert(mealItems).values(items.map((item) => ({
        ...item,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))),
    ]);
  } else {
    await db.batch([mealInsert]);
  }

  const created = await findMeal(db, ownerKey, mealId);
  if (!created) throw new Error("meal_create_failed");
  return created;
}

export async function updateMeal(
  db: AppDb,
  ownerKey: string,
  mealId: string,
  patch: MealPatch,
  source = "dashboard",
): Promise<MealWithItems | null> {
  const before = await findMeal(db, ownerKey, mealId);
  if (!before) return null;

  const nextItems = patch.items
    ? patch.items.map((item) => normaliseItem(item, ownerKey, mealId))
    : before.items;
  const totals = calculateTotals(nextItems);
  const timestamp = nowMs();
  const nextMeal = {
    ...before.meal,
    consumedAt: patch.consumedAt ?? before.meal.consumedAt,
    source: patch.source ?? before.meal.source,
    caption: patch.caption ?? before.meal.caption,
    mealType: patch.mealType === undefined ? before.meal.mealType : patch.mealType,
    status: patch.status ?? before.meal.status,
    photoKey: patch.photoKey === undefined ? before.meal.photoKey : patch.photoKey,
    photoMimeType: patch.photoMimeType === undefined ? before.meal.photoMimeType : patch.photoMimeType,
    photoSizeBytes: patch.photoSizeBytes === undefined ? before.meal.photoSizeBytes : patch.photoSizeBytes,
    totalCalories: totals.calories,
    totalProteinG: totals.proteinG,
    totalCarbsG: totals.carbsG,
    totalFatG: totals.fatG,
    confidence: patch.confidence === undefined ? before.meal.confidence : patch.confidence,
    assumptionsJson: patch.assumptions === undefined ? before.meal.assumptionsJson : safeJson(patch.assumptions, []),
    notes: patch.notes === undefined ? before.meal.notes : patch.notes,
    updatedAt: timestamp,
  };

  const mealUpdate = db.update(mealLogs).set({
    consumedAt: nextMeal.consumedAt,
    source: nextMeal.source,
    caption: nextMeal.caption,
    mealType: nextMeal.mealType,
    status: nextMeal.status,
    photoKey: nextMeal.photoKey,
    photoMimeType: nextMeal.photoMimeType,
    photoSizeBytes: nextMeal.photoSizeBytes,
    totalCalories: nextMeal.totalCalories,
    totalProteinG: nextMeal.totalProteinG,
    totalCarbsG: nextMeal.totalCarbsG,
    totalFatG: nextMeal.totalFatG,
    confidence: nextMeal.confidence,
    assumptionsJson: nextMeal.assumptionsJson,
    notes: nextMeal.notes,
    updatedAt: timestamp,
  }).where(and(eq(mealLogs.ownerKey, ownerKey), eq(mealLogs.id, mealId)));
  const revisionInsert = db.insert(mealRevisions).values({
    id: createId("revision"),
    mealId,
    ownerKey,
    source,
    beforeJson: safeJson(mealSnapshot(before), {}),
    afterJson: safeJson({ meal: nextMeal, items: nextItems }, {}),
    reason: patch.reason?.trim() || (source === "dashboard" ? "edit" : "correction"),
    createdAt: timestamp,
  });

  if (!patch.items) {
    await db.batch([mealUpdate, revisionInsert]);
  } else {
    const itemDelete = db.delete(mealItems)
      .where(and(eq(mealItems.ownerKey, ownerKey), eq(mealItems.mealId, mealId)));
    if (nextItems.length > 0) {
      await db.batch([
        mealUpdate,
        itemDelete,
        db.insert(mealItems).values(nextItems.map((item) => ({
          ...item,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))),
        revisionInsert,
      ]);
    } else {
      await db.batch([mealUpdate, itemDelete, revisionInsert]);
    }
  }

  return findMeal(db, ownerKey, mealId);
}

/**
 * Delete a meal and all records that belong to its analysis history.
 *
 * The meal row is deleted last so the batch remains safe if foreign keys are
 * enabled for these tables in a later schema revision.
 */
export async function deleteMeal(
  db: AppDb,
  ownerKey: string,
  mealId: string,
): Promise<MealWithItems | null> {
  const existing = await findMeal(db, ownerKey, mealId);
  if (!existing) return null;

  await db.batch([
    db.delete(mealItems).where(and(eq(mealItems.ownerKey, ownerKey), eq(mealItems.mealId, mealId))),
    db.delete(analysisJobs).where(and(eq(analysisJobs.ownerKey, ownerKey), eq(analysisJobs.mealId, mealId))),
    db.delete(mealRevisions).where(and(eq(mealRevisions.ownerKey, ownerKey), eq(mealRevisions.mealId, mealId))),
    db.delete(aiRuns).where(and(eq(aiRuns.ownerKey, ownerKey), eq(aiRuns.mealId, mealId))),
    db.delete(telegramUpdates).where(and(eq(telegramUpdates.ownerKey, ownerKey), eq(telegramUpdates.mealId, mealId))),
    db.delete(mealLogs).where(and(eq(mealLogs.ownerKey, ownerKey), eq(mealLogs.id, mealId))),
  ]);

  return existing;
}

export async function getSettings(db: AppDb, ownerKey: string) {
  return db
    .select()
    .from(settings)
    .where(eq(settings.ownerKey, ownerKey))
    .limit(1)
    .prepare()
    .get();
}

export async function upsertSettings(db: AppDb, ownerKey: string, patch: SettingsPatch) {
  const existing = await getSettings(db, ownerKey);
  const timestamp = nowMs();
  const id = existing?.id ?? `settings_${ownerKey}`;
  if (existing) {
    await db.update(settings).set({
      telegramUserId: patch.telegramUserId === undefined ? existing.telegramUserId : patch.telegramUserId,
      telegramChatId: patch.telegramChatId === undefined ? existing.telegramChatId : patch.telegramChatId,
      timezone: patch.timezone ?? existing.timezone,
      dailyCalorieTarget: patch.dailyCalorieTarget === undefined ? existing.dailyCalorieTarget : patch.dailyCalorieTarget,
      dailyProteinTargetG: patch.dailyProteinTargetG === undefined ? existing.dailyProteinTargetG : patch.dailyProteinTargetG,
      activeAiProfileId: patch.activeAiProfileId === undefined ? existing.activeAiProfileId : patch.activeAiProfileId,
      photoRetentionDays: patch.photoRetentionDays ?? existing.photoRetentionDays,
      updatedAt: timestamp,
    }).where(and(eq(settings.id, id), eq(settings.ownerKey, ownerKey))).prepare().run();
  } else {
    await db.insert(settings).values({
      id,
      ownerKey,
      telegramUserId: patch.telegramUserId ?? null,
      telegramChatId: patch.telegramChatId ?? null,
      timezone: patch.timezone ?? "UTC",
      dailyCalorieTarget: patch.dailyCalorieTarget ?? null,
      dailyProteinTargetG: patch.dailyProteinTargetG ?? null,
      activeAiProfileId: patch.activeAiProfileId ?? null,
      photoRetentionDays: patch.photoRetentionDays ?? 30,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).prepare().run();
  }
  const saved = await getSettings(db, ownerKey);
  if (!saved) throw new Error("settings_save_failed");
  return saved;
}

export async function getDashboardSummary(db: AppDb, ownerKey: string, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = startMs + 86_400_000;
  const weekStartMs = startMs - 6 * 86_400_000;
  const logicalDate = start.toISOString().slice(0, 10);
  const weekStartDate = new Date(weekStartMs).toISOString().slice(0, 10);
  const [settingsRow, today, recentMeals, recentWeights] = await Promise.all([
    getSettings(db, ownerKey),
    db.select({
      calories: sql<number>`coalesce(sum(${mealLogs.totalCalories}), 0)`,
      proteinG: sql<number>`coalesce(sum(${mealLogs.totalProteinG}), 0)`,
      carbsG: sql<number>`coalesce(sum(${mealLogs.totalCarbsG}), 0)`,
      fatG: sql<number>`coalesce(sum(${mealLogs.totalFatG}), 0)`,
      mealCount: sql<number>`count(*)`,
    }).from(mealLogs).where(and(
      eq(mealLogs.ownerKey, ownerKey),
      eq(mealLogs.status, "complete"),
      gte(mealLogs.consumedAt, startMs),
      lt(mealLogs.consumedAt, endMs),
    )).prepare().get(),
    listMeals(db, ownerKey, { from: weekStartMs, to: endMs, limit: 500 }),
    listDailyWeights({ db, ownerKey, from: weekStartDate, to: logicalDate }),
  ]);

  const days = new Map<string, { calories: number; proteinG: number }>();
  for (const entry of recentMeals) {
    if (entry.meal.status !== "complete") continue;
    const key = new Date(entry.meal.consumedAt).toISOString().slice(0, 10);
    const current = days.get(key) ?? { calories: 0, proteinG: 0 };
    current.calories += entry.meal.totalCalories;
    current.proteinG += entry.meal.totalProteinG;
    days.set(key, current);
  }
  const sevenDay = [...days.values()].reduce(
    (total, day) => ({ calories: total.calories + day.calories, proteinG: total.proteinG + day.proteinG }),
    { calories: 0, proteinG: 0 },
  );

  return {
    date: logicalDate,
    targets: {
      calories: settingsRow?.dailyCalorieTarget ?? null,
      proteinG: settingsRow?.dailyProteinTargetG ?? null,
    },
    today: {
      calories: Number(today?.calories ?? 0),
      proteinG: Number(today?.proteinG ?? 0),
      carbsG: Number(today?.carbsG ?? 0),
      fatG: Number(today?.fatG ?? 0),
      mealCount: Number(today?.mealCount ?? 0),
    },
    sevenDay: {
      calories: sevenDay.calories,
      proteinG: sevenDay.proteinG,
      averageCalories: sevenDay.calories / 7,
      averageProteinG: sevenDay.proteinG / 7,
      daysWithMeals: days.size,
    },
    recentMeals,
    recentWeights,
  };
}

export async function listAiRuns(db: AppDb, ownerKey: string, options: { mealId?: string; limit?: number } = {}) {
  const conditions = [eq(aiRuns.ownerKey, ownerKey)];
  if (options.mealId) conditions.push(eq(aiRuns.mealId, options.mealId));
  return db.select().from(aiRuns).where(and(...conditions)).orderBy(desc(aiRuns.createdAt)).limit(Math.min(options.limit ?? 100, 500)).prepare().all();
}

export async function listAiProfiles(db: AppDb, ownerKey: string) {
  return db.select().from(aiProfiles).where(eq(aiProfiles.ownerKey, ownerKey)).orderBy(desc(aiProfiles.updatedAt)).prepare().all();
}

export async function getAiProfile(db: AppDb, ownerKey: string, profileId: string) {
  return db.select().from(aiProfiles).where(and(
    eq(aiProfiles.ownerKey, ownerKey),
    eq(aiProfiles.id, profileId),
  )).limit(1).prepare().get();
}

export async function createAiProfile(db: AppDb, ownerKey: string, input: AiProfileInput) {
  if (!input.primaryModel?.trim()) throw new Error("ai_profile_model_required");
  const timestamp = nowMs();
  const id = input.id ?? createId("profile");
  await db.insert(aiProfiles).values({
    id,
    ownerKey,
    adapter: input.adapter?.trim() || "openrouter",
    endpoint: input.endpoint ?? null,
    primaryModel: input.primaryModel.trim(),
    fallbackModelsJson: safeJson(input.fallbackModels ?? [], []),
    requiredCapabilitiesJson: safeJson(input.requiredCapabilities ?? ["image", "structured_outputs"], []),
    privacyPolicyJson: safeJson(input.privacyPolicy ?? { zdr: true, data_collection: "deny" }, {}),
    maxInputPrice: input.maxInputPrice ?? null,
    maxOutputPrice: input.maxOutputPrice ?? null,
    promptVersion: input.promptVersion?.trim() || "v1",
    schemaVersion: input.schemaVersion?.trim() || "v1",
    enabled: input.enabled ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).prepare().run();
  const created = await getAiProfile(db, ownerKey, id);
  if (!created) throw new Error("ai_profile_create_failed");
  return created;
}

export async function updateAiProfile(
  db: AppDb,
  ownerKey: string,
  profileId: string,
  input: Partial<AiProfileInput>,
) {
  const existing = await getAiProfile(db, ownerKey, profileId);
  if (!existing) return null;
  const timestamp = nowMs();
  await db.update(aiProfiles).set({
    adapter: input.adapter === undefined ? existing.adapter : input.adapter.trim(),
    endpoint: input.endpoint === undefined ? existing.endpoint : input.endpoint,
    primaryModel: input.primaryModel === undefined ? existing.primaryModel : input.primaryModel.trim(),
    fallbackModelsJson: input.fallbackModels === undefined ? existing.fallbackModelsJson : safeJson(input.fallbackModels, []),
    requiredCapabilitiesJson: input.requiredCapabilities === undefined ? existing.requiredCapabilitiesJson : safeJson(input.requiredCapabilities, []),
    privacyPolicyJson: input.privacyPolicy === undefined ? existing.privacyPolicyJson : safeJson(input.privacyPolicy, {}),
    maxInputPrice: input.maxInputPrice === undefined ? existing.maxInputPrice : input.maxInputPrice,
    maxOutputPrice: input.maxOutputPrice === undefined ? existing.maxOutputPrice : input.maxOutputPrice,
    promptVersion: input.promptVersion === undefined ? existing.promptVersion : input.promptVersion.trim(),
    schemaVersion: input.schemaVersion === undefined ? existing.schemaVersion : input.schemaVersion.trim(),
    enabled: input.enabled === undefined ? existing.enabled : input.enabled,
    updatedAt: timestamp,
  }).where(and(eq(aiProfiles.ownerKey, ownerKey), eq(aiProfiles.id, profileId))).prepare().run();
  return getAiProfile(db, ownerKey, profileId);
}

export async function listPendingJobs(db: AppDb, ownerKey: string, now = nowMs(), limit = 50) {
  return db.select().from(analysisJobs).where(and(
    eq(analysisJobs.ownerKey, ownerKey),
    eq(analysisJobs.state, "pending"),
    lte(analysisJobs.availableAfter, now),
  )).orderBy(analysisJobs.availableAfter).limit(Math.min(limit, 100)).prepare().all();
}

export async function findMealByPhotoKey(db: AppDb, ownerKey: string, photoKey: string) {
  return db.select({ id: mealLogs.id }).from(mealLogs).where(and(
    eq(mealLogs.ownerKey, ownerKey),
    eq(mealLogs.photoKey, photoKey),
  )).limit(1).prepare().get();
}

export async function insertTelegramUpdate(
  db: AppDb,
  input: {
    ownerKey: string;
    updateId: number;
    chatId?: string | null;
    telegramUserId?: string | null;
    mealId?: string | null;
    payload: unknown;
  },
) {
  const id = createId("telegram");
  const result = await db.insert(telegramUpdates).values({
    id,
    ownerKey: input.ownerKey,
    updateId: input.updateId,
    chatId: input.chatId ?? null,
    telegramUserId: input.telegramUserId ?? null,
    mealId: input.mealId ?? null,
    payloadJson: safeJson(input.payload, {}),
    createdAt: nowMs(),
  }).onConflictDoNothing({ target: [telegramUpdates.ownerKey, telegramUpdates.updateId] }).returning().prepare().all();
  return result[0] ?? null;
}
