import {
  and,
  desc,
  eq,
  gte,
  getTableColumns,
  inArray,
  lte,
  lt,
} from "drizzle-orm";
import { getDb } from "./index";
import {
  aggregateNutrients,
  NUTRIENT_KEYS,
  nullableNutrientValue,
  type NutrientAggregateMap,
  type NutrientValues,
  type PartialNutrientValues,
} from "../domain/nutrients";
import {
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
  type NutrientGoalOverrides,
} from "../domain/nutrient-goals";
import {
  buildProteinGoalSummary,
  normaliseProteinGoalMode,
  type ProteinGoalMode,
} from "../domain/protein-goals";
import {
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
} & PartialNutrientValues;

export type MealInput = {
  id?: string;
  consumedAt?: number;
  externalRequestId?: string | null;
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

export type ExternalMealResult = {
  created: boolean;
  meal: MealWithItems;
};

export type ExternalMealInput = Omit<MealInput, "externalRequestId" | "id" | "items"> & {
  requestId: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  nutrients?: PartialNutrientValues;
};

export type CurrentDayMealTotals = {
  date: string;
  calories: number;
  proteinG: number;
  mealCount: number;
};

export type { NutrientAggregateMap } from "../domain/nutrients";

export type DailyWeightInput = {
  logicalDate: string;
  weightKg: number;
};

export type SettingsPatch = Partial<{
  timezone: string;
  dailyCalorieTarget: number | null;
  dailyProteinTargetG: number | null;
  proteinGoalMode: ProteinGoalMode;
  dailyProteinTargetPerKg: number | null;
  nutrientTargets: NutrientGoalOverrides | null;
  photoRetentionDays: number;
}>;

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

const DAY_MS = 86_400_000;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type DashboardSummaryOptions = {
  now?: Date;
  timezone?: string;
};

function dateTimeFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
}

function datePartValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
}

function zonedDateParts(formatter: Intl.DateTimeFormat, timestamp: number): ZonedDateParts {
  const parts = formatter.formatToParts(new Date(timestamp));
  return {
    year: datePartValue(parts, "year"),
    month: datePartValue(parts, "month"),
    day: datePartValue(parts, "day"),
    hour: datePartValue(parts, "hour"),
    minute: datePartValue(parts, "minute"),
    second: datePartValue(parts, "second"),
  };
}

function utcTimestamp(parts: Pick<ZonedDateParts, "year" | "month" | "day"> & Partial<Pick<ZonedDateParts, "hour" | "minute" | "second">>): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, 0);
  return date.getTime();
}

function dateKeyFromParts(parts: Pick<ZonedDateParts, "year" | "month" | "day">): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftDateKey(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(utcTimestamp({ year, month, day }) + days * DAY_MS);
  return dateKeyFromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function firstInstantForLocalDate({ date, formatter }: { date: string; formatter: Intl.DateTimeFormat }): number {
  const [year, month, day] = date.split("-").map(Number);
  const target = utcTimestamp({ year, month, day });
  const dateAt = (timestamp: number) => dateKeyFromParts(zonedDateParts(formatter, timestamp));
  let low = target - 3 * DAY_MS;
  let high = target + 3 * DAY_MS;

  while (dateAt(low) >= date) low -= DAY_MS;
  while (dateAt(high) < date) high += DAY_MS;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dateAt(middle) < date) low = middle;
    else high = middle;
  }
  return high;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return false;
  try {
    dateTimeFormatter(value).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function resolvedDashboardTimezone(requested: string | undefined): string {
  if (isValidTimeZone(requested)) return requested;
  return "UTC";
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normaliseNutrientFields(item: PartialNutrientValues): NutrientValues {
  const values = {} as NutrientValues;
  for (const key of NUTRIENT_KEYS) values[key] = nullableNutrientValue(item[key]);
  return values;
}

export function calculateNutrientAggregates(
  items: readonly PartialNutrientValues[],
): NutrientAggregateMap {
  return aggregateNutrients(items.map(normaliseNutrientFields));
}

function safeJson(value: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function normaliseItem(item: MealItemInput, ownerKey: string, mealId: string) {
  const nutrients = normaliseNutrientFields(item);
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
    ...nutrients,
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
  const items: Array<typeof mealItems.$inferSelect> = [];
  // Leave one of D1's 100 bindings for the owner filter.
  for (let offset = 0; offset < ids.length; offset += 99) {
    items.push(...await db
      .select()
      .from(mealItems)
      .where(and(eq(mealItems.ownerKey, ownerKey), inArray(mealItems.mealId, ids.slice(offset, offset + 99))))
      .orderBy(desc(mealItems.createdAt))
      .prepare()
      .all());
  }

  const itemMap = new Map<string, Array<typeof mealItems.$inferSelect>>();
  for (const item of items) {
    const current = itemMap.get(item.mealId) ?? [];
    current.push(item);
    itemMap.set(item.mealId, current);
  }

  return meals.map((meal) => ({ meal, items: itemMap.get(meal.id) ?? [] }));
}

/** Read a complete date range in two queries, without the meal-list page limit. */
export async function listMealsInRange({ db, ownerKey, from, to }: {
  db: AppDb; ownerKey: string; from?: number; to?: number;
}): Promise<MealWithItems[]> {
  const conditions = [eq(mealLogs.ownerKey, ownerKey)];
  if (from !== undefined) conditions.push(gte(mealLogs.consumedAt, from));
  if (to !== undefined) conditions.push(lt(mealLogs.consumedAt, to));
  const [meals, items] = await Promise.all([
    db.select().from(mealLogs).where(and(...conditions))
      .orderBy(desc(mealLogs.consumedAt), desc(mealLogs.id)).prepare().all(),
    db.select(getTableColumns(mealItems)).from(mealItems)
      .innerJoin(mealLogs, eq(mealLogs.id, mealItems.mealId))
      .where(and(...conditions, eq(mealItems.ownerKey, ownerKey)))
      .orderBy(desc(mealItems.createdAt)).prepare().all(),
  ]);
  const itemsByMeal = new Map<string, typeof items>();
  for (const item of items) {
    const group = itemsByMeal.get(item.mealId) ?? [];
    group.push(item);
    itemsByMeal.set(item.mealId, group);
  }
  return meals.map((meal) => ({ meal, items: itemsByMeal.get(meal.id) ?? [] }));
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

export async function getLatestDailyWeightBefore({
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
      lt(dailyWeights.logicalDate, logicalDate),
    ))
    .orderBy(desc(dailyWeights.logicalDate))
    .limit(1)
    .prepare()
    .get();
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

export async function findMealByExternalRequestId(
  db: AppDb,
  ownerKey: string,
  externalRequestId: string,
): Promise<MealWithItems | null> {
  const meal = await db
    .select()
    .from(mealLogs)
    .where(and(
      eq(mealLogs.ownerKey, ownerKey),
      eq(mealLogs.externalRequestId, externalRequestId),
    ))
    .limit(1)
    .prepare()
    .get();
  if (!meal) return null;

  const items = await db
    .select()
    .from(mealItems)
    .where(and(eq(mealItems.ownerKey, ownerKey), eq(mealItems.mealId, meal.id)))
    .orderBy(desc(mealItems.createdAt))
    .prepare()
    .all();
  return { meal, items };
}

export type CopyMealOptions = {
  consumedAt?: number;
};

/**
 * Copy an owned meal into a new meal row and a new set of item rows.
 *
 * The photo key is intentionally reused. Photo objects are owned by their key,
 * not by one meal row, so the caller must use reference-aware photo cleanup
 * when either meal is later deleted.
 */
export async function copyMeal(
  db: AppDb,
  ownerKey: string,
  mealId: string,
  options: CopyMealOptions = {},
): Promise<MealWithItems | null> {
  const source = await findMeal(db, ownerKey, mealId);
  if (!source) return null;

  let assumptions: unknown[] = [];
  try {
    const parsed = JSON.parse(source.meal.assumptionsJson);
    if (Array.isArray(parsed)) assumptions = parsed;
  } catch {
    // Keep a malformed legacy assumptions value from blocking a meal copy.
  }

  return createMeal(db, ownerKey, {
    consumedAt: options.consumedAt ?? nowMs(),
    source: "dashboard",
    caption: source.meal.caption,
    mealType: source.meal.mealType,
    status: source.meal.status,
    photoKey: source.meal.photoKey,
    photoMimeType: source.meal.photoMimeType,
    photoSizeBytes: source.meal.photoSizeBytes,
    confidence: source.meal.confidence,
    assumptions,
    notes: source.meal.notes,
    // Do not pass source item IDs. createMeal generates fresh IDs for the copy.
    items: source.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      ...normaliseNutrientFields(item),
      confidence: item.confidence,
      source: item.source,
    })),
  });
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
    externalRequestId: input.externalRequestId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (items.length > 0) {
    // D1 limits bound variables per statement. Keep each item separate because
    // the 24 optional nutrient columns make a multi-row insert too large.
    await db.batch([
      mealInsert,
      ...items.map((item) => db.insert(mealItems).values({
        ...item,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    ]);
  } else {
    await db.batch([mealInsert]);
  }

  const created = await findMeal(db, ownerKey, mealId);
  if (!created) throw new Error("meal_create_failed");
  return created;
}

/**
 * Create one or more meals for the ChatGPT Action integration.
 *
 * Each meal and its serving item use deterministic IDs derived from the
 * request UUID. D1 batches are atomic, and both inserts ignore conflicts, so
 * concurrent retries cannot create duplicate meals or items. A retry can
 * also repair an item that was absent from an older partially-created row.
 */
export async function createMealsForExternalRequests(
  db: AppDb,
  ownerKey: string,
  inputs: readonly ExternalMealInput[],
): Promise<ExternalMealResult[]> {
  if (inputs.length === 0) return [];

  const timestamp = nowMs();
  const statements = inputs.flatMap((input) => {
    const mealId = `meal_external_${input.requestId}`;
    const itemId = `item_external_${input.requestId}`;
    const mealInsert = db.insert(mealLogs).values({
      id: mealId,
      ownerKey,
      consumedAt: input.consumedAt ?? timestamp,
      source: input.source?.trim() || "chatgpt",
      caption: input.caption?.trim() || input.name.trim(),
      mealType: input.mealType ?? null,
      status: input.status?.trim() || "complete",
      photoKey: input.photoKey ?? null,
      photoMimeType: input.photoMimeType ?? null,
      photoSizeBytes: input.photoSizeBytes ?? null,
      totalCalories: input.kcal,
      totalProteinG: input.protein,
      totalCarbsG: input.carbs,
      totalFatG: input.fat,
      confidence: input.confidence ?? null,
      assumptionsJson: safeJson(input.assumptions, []),
      notes: input.notes ?? null,
      externalRequestId: input.requestId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoNothing({ target: mealLogs.externalRequestId }).returning();
    const itemInsert = db.insert(mealItems).values({
      id: itemId,
      mealId,
      ownerKey,
      name: input.name.trim(),
      quantity: 1,
      unit: "serving",
      calories: input.kcal,
      proteinG: input.protein,
      carbsG: input.carbs,
      fatG: input.fat,
      ...normaliseNutrientFields(input.nutrients ?? {}),
      confidence: null,
      source: input.source?.trim() || "chatgpt",
      createdAt: timestamp,
      updatedAt: timestamp,
    }).onConflictDoNothing({ target: mealItems.id });
    return [mealInsert, itemInsert];
  });

  const results = await db.batch(statements as [
    (typeof statements)[number],
    ...(typeof statements)[number][],
  ]);
  return Promise.all(inputs.map(async (input, index) => {
    const meal = await findMealByExternalRequestId(db, ownerKey, input.requestId);
    if (!meal) throw new Error("external_meal_create_failed");
    const insertedMeals = results[index * 2];
    return { created: Array.isArray(insertedMeals) && insertedMeals.length > 0, meal };
  }));
}

export async function createMealForExternalRequest(
  db: AppDb,
  ownerKey: string,
  externalRequestId: string,
  input: Omit<ExternalMealInput, "requestId">,
): Promise<ExternalMealResult> {
  const [result] = await createMealsForExternalRequests(db, ownerKey, [{
    requestId: externalRequestId,
    ...input,
  }]);
  if (!result) throw new Error("external_meal_create_failed");
  return result;
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
        ...nextItems.map((item) => db.insert(mealItems).values({
          ...item,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
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

export async function getCurrentDayMealTotals(
  db: AppDb,
  ownerKey: string,
  options: { now?: Date } = {},
): Promise<CurrentDayMealTotals> {
  const settingsRow = await getSettings(db, ownerKey);
  const timezone = resolvedDashboardTimezone(settingsRow?.timezone);
  const now = options.now ?? new Date();
  const formatter = dateTimeFormatter(timezone);
  const logicalDate = dateKeyFromParts(zonedDateParts(formatter, now.getTime()));
  const startMs = firstInstantForLocalDate({ date: logicalDate, formatter });
  const endMs = firstInstantForLocalDate({ date: shiftDateKey(logicalDate, 1), formatter });
  const meals = await listMealsInRange({ db, ownerKey, from: startMs, to: endMs });
  return meals.reduce((totals, entry) => {
    if (entry.meal.status !== "complete") return totals;
    return {
      date: logicalDate,
      calories: totals.calories + entry.meal.totalCalories,
      proteinG: totals.proteinG + entry.meal.totalProteinG,
      mealCount: totals.mealCount + 1,
    };
  }, { date: logicalDate, calories: 0, proteinG: 0, mealCount: 0 });
}

export async function upsertSettings(db: AppDb, ownerKey: string, patch: SettingsPatch) {
  const existing = await getSettings(db, ownerKey);
  const timestamp = nowMs();
  const id = existing?.id ?? `settings_${ownerKey}`;
  if (existing) {
    await db.update(settings).set({
      timezone: patch.timezone ?? existing.timezone,
      dailyCalorieTarget: patch.dailyCalorieTarget === undefined ? existing.dailyCalorieTarget : patch.dailyCalorieTarget,
      dailyProteinTargetG: patch.dailyProteinTargetG === undefined ? existing.dailyProteinTargetG : patch.dailyProteinTargetG,
      proteinGoalMode: patch.proteinGoalMode ?? normaliseProteinGoalMode(existing.proteinGoalMode),
      dailyProteinTargetPerKg: patch.dailyProteinTargetPerKg === undefined
        ? existing.dailyProteinTargetPerKg
        : patch.dailyProteinTargetPerKg,
      nutrientTargetsJson: patch.nutrientTargets === undefined
        ? existing.nutrientTargetsJson
        : patch.nutrientTargets === null ? null : safeJson(patch.nutrientTargets, {}),
      photoRetentionDays: patch.photoRetentionDays ?? existing.photoRetentionDays,
      updatedAt: timestamp,
    }).where(and(eq(settings.id, id), eq(settings.ownerKey, ownerKey))).prepare().run();
  } else {
    await db.insert(settings).values({
      id,
      ownerKey,
      timezone: patch.timezone ?? "UTC",
      dailyCalorieTarget: patch.dailyCalorieTarget ?? null,
      dailyProteinTargetG: patch.dailyProteinTargetG ?? null,
      proteinGoalMode: patch.proteinGoalMode ?? "grams",
      dailyProteinTargetPerKg: patch.dailyProteinTargetPerKg ?? null,
      nutrientTargetsJson: patch.nutrientTargets === null ? null : safeJson(patch.nutrientTargets, {}),
      photoRetentionDays: patch.photoRetentionDays ?? 30,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).prepare().run();
  }
  const saved = await getSettings(db, ownerKey);
  if (!saved) throw new Error("settings_save_failed");
  return saved;
}

export async function getDashboardSummary(db: AppDb, ownerKey: string, options: DashboardSummaryOptions = {}) {
  const timezone = resolvedDashboardTimezone(options.timezone);
  const now = options.now ?? new Date();
  const formatter = dateTimeFormatter(timezone);
  const logicalDate = dateKeyFromParts(zonedDateParts(formatter, now.getTime()));
  const weekStartDate = shiftDateKey(logicalDate, -6);
  const monthStartDate = shiftDateKey(logicalDate, -29);
  const endMs = firstInstantForLocalDate({ date: shiftDateKey(logicalDate, 1), formatter });
  const weekStartMs = firstInstantForLocalDate({ date: weekStartDate, formatter });
  const monthStartMs = firstInstantForLocalDate({ date: monthStartDate, formatter });
  const [settingsRow, trendMeals, trendWeights, weightBeforeTrend] = await Promise.all([
    getSettings(db, ownerKey),
    listMealsInRange({ db, ownerKey, from: monthStartMs, to: endMs }),
    listDailyWeights({ db, ownerKey, from: monthStartDate, to: logicalDate }),
    getLatestDailyWeightBefore({ db, ownerKey, logicalDate: monthStartDate }),
  ]);
  const nutrientTargetOverrides = parseNutrientGoalOverridesJson(settingsRow?.nutrientTargetsJson);
  const recentMeals = trendMeals.filter((entry) => entry.meal.consumedAt >= weekStartMs);
  const recentWeights = trendWeights.filter((entry) => entry.logicalDate >= weekStartDate);
  const proteinGoal = buildProteinGoalSummary({
    dates: Array.from({ length: 7 }, (_, index) => shiftDateKey(weekStartDate, index)),
    mode: normaliseProteinGoalMode(settingsRow?.proteinGoalMode),
    fixedTargetG: settingsRow?.dailyProteinTargetG,
    gramsPerKg: settingsRow?.dailyProteinTargetPerKg,
    weights: [...trendWeights, ...(weightBeforeTrend ? [weightBeforeTrend] : [])],
  });

  const mealsByDate = new Map<string, MealWithItems[]>();
  for (const entry of trendMeals) {
    if (entry.meal.status !== "complete") continue;
    const date = dateKeyFromParts(zonedDateParts(formatter, entry.meal.consumedAt));
    const entries = mealsByDate.get(date) ?? [];
    entries.push(entry);
    mealsByDate.set(date, entries);
  }
  const trendByDate = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDateKey(monthStartDate, index);
    const entries = mealsByDate.get(date) ?? [];
    const totals = entries.reduce((total, { meal }) => ({
      calories: total.calories + meal.totalCalories,
      proteinG: total.proteinG + meal.totalProteinG,
      carbsG: total.carbsG + meal.totalCarbsG,
      fatG: total.fatG + meal.totalFatG,
    }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    return {
      date, ...totals, mealCount: entries.length,
      nutrients: calculateNutrientAggregates(entries.flatMap((entry) => entry.items)),
    };
  });
  const weekDays = trendByDate.slice(-7);
  const today = weekDays[6];
  const sevenDay = weekDays.reduce(
    (total, day) => ({ calories: total.calories + day.calories, proteinG: total.proteinG + day.proteinG }),
    { calories: 0, proteinG: 0 },
  );
  const includeToday = zonedDateParts(formatter, now.getTime()).hour >= 21;
  const averageDayCount = includeToday ? 7 : 6;
  const averageDays = includeToday ? weekDays : weekDays.slice(0, -1);
  const average = averageDays.reduce(
    (total, day) => ({ calories: total.calories + day.calories, proteinG: total.proteinG + day.proteinG }),
    { calories: 0, proteinG: 0 },
  );
  return {
    date: logicalDate,
    targets: {
      calories: settingsRow?.dailyCalorieTarget ?? null,
      proteinG: proteinGoal.targetG,
      nutrients: resolveNutrientGoals(nutrientTargetOverrides),
    },
    proteinGoal,
    today: {
      calories: today.calories, proteinG: today.proteinG, carbsG: today.carbsG,
      fatG: today.fatG, mealCount: today.mealCount,
    },
    sevenDay: {
      calories: sevenDay.calories,
      proteinG: sevenDay.proteinG,
      averageCalories: average.calories / averageDayCount,
      averageProteinG: average.proteinG / averageDayCount,
      daysWithMeals: weekDays.filter((day) => day.mealCount > 0).length,
    },
    nutrition: {
      today: today.nutrients,
      sevenDay: calculateNutrientAggregates(recentMeals.filter(({ meal }) => meal.status === "complete").flatMap(({ items }) => items)),
      byDate: weekDays.map(({ date, nutrients }) => ({ date, nutrients })),
    },
    trend: {
      byDate: trendByDate,
      weights: trendWeights.map(({ logicalDate, weightKg, recordedAt }) => ({ logicalDate, weightKg, recordedAt })),
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

export async function getExportData({ db, ownerKey }: { db: AppDb; ownerKey: string }) {
  const [meals, settingsRow, weights, runs] = await Promise.all([
    listMealsInRange({ db, ownerKey }),
    getSettings(db, ownerKey),
    db.select().from(dailyWeights).where(eq(dailyWeights.ownerKey, ownerKey))
      .orderBy(desc(dailyWeights.logicalDate)).prepare().all(),
    db.select().from(aiRuns).where(eq(aiRuns.ownerKey, ownerKey))
      .orderBy(desc(aiRuns.createdAt), desc(aiRuns.id)).prepare().all(),
  ]);
  return { meals, settings: settingsRow ?? null, weights, aiRuns: runs };
}

export async function findMealPhoto({ db, ownerKey, mealId }: { db: AppDb; ownerKey: string; mealId: string }) {
  return db.select({
    id: mealLogs.id,
    ownerKey: mealLogs.ownerKey,
    consumedAt: mealLogs.consumedAt,
    status: mealLogs.status,
    photoKey: mealLogs.photoKey,
    photoMimeType: mealLogs.photoMimeType,
  }).from(mealLogs).where(and(eq(mealLogs.ownerKey, ownerKey), eq(mealLogs.id, mealId))).limit(1).prepare().get();
}

export async function findMealByPhotoKey(db: AppDb, ownerKey: string, photoKey: string) {
  return db.select({ id: mealLogs.id }).from(mealLogs).where(and(
    eq(mealLogs.ownerKey, ownerKey),
    eq(mealLogs.photoKey, photoKey),
  )).limit(1).prepare().get();
}

export async function hasMealPhotoReference(db: AppDb, ownerKey: string, photoKey: string) {
  const reference = await db.select({ id: mealLogs.id }).from(mealLogs).where(and(
    eq(mealLogs.ownerKey, ownerKey),
    eq(mealLogs.photoKey, photoKey),
  )).limit(1).prepare().get();
  return Boolean(reference);
}
