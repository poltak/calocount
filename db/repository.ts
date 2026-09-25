import {
  and,
  desc,
  eq,
  gte,
  getTableColumns,
  inArray,
  lte,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "./index";
import {
  aggregateNutrients,
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  nullableNutrientValue,
  type NutrientAggregateMap,
  type NutrientUpperLimitValues,
  type PartialNutrientUpperLimitValues,
  type PartialTrackedNutrientValues,
  type NutrientValues,
  type PartialNutrientValues,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "../domain/nutrients";
import { parseNutrientProvenance, type NutrientProvenanceMap } from "../domain/nutrient-provenance";
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
  savedEntries,
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
  nutrientProvenance?: NutrientProvenanceMap | null;
} & PartialTrackedNutrientValues;

export type MealInput = {
  id?: string;
  consumedAt?: number;
  externalRequestId?: string | null;
  savedEntryId?: string | null;
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
  meal: Omit<typeof mealLogs.$inferSelect, "savedEntryId"> & { savedEntryId?: string | null };
  items: Array<typeof mealItems.$inferSelect>;
};

export type SavedEntrySnapshot = {
  caption: string;
  mealType: string | null;
  confidence: number | null;
  assumptions: unknown[];
  notes: string | null;
  items: MealItemInput[];
};

export type SavedEntryWithSnapshot = {
  id: string;
  sourceMealId: string;
  createdAt: number;
  updatedAt: number;
  snapshot: SavedEntrySnapshot;
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
  nutrients?: PartialTrackedNutrientValues;
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
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
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

function normaliseNutrientUpperLimitFields(item: PartialNutrientUpperLimitValues): NutrientUpperLimitValues {
  const values = {} as NutrientUpperLimitValues;
  for (const key of NUTRIENT_UPPER_LIMIT_KEYS) values[key] = nullableNutrientValue(item[key]);
  return values;
}

function normaliseNutrientProvenance(item: MealItemInput, nutrientValues: NutrientValues): string | null {
  const provenance = parseNutrientProvenance(item.nutrientProvenance, nutrientValues);
  return Object.keys(provenance).length > 0 ? safeJson(provenance, {}) : null;
}

function parsedNutrientProvenance(value: string | null | undefined, nutrientValues: PartialNutrientValues): NutrientProvenanceMap {
  if (!value) return {};
  try {
    return parseNutrientProvenance(JSON.parse(value), nutrientValues);
  } catch {
    return {};
  }
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
  const upperLimitNutrients = normaliseNutrientUpperLimitFields(item);
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
    ...upperLimitNutrients,
    nutrientProvenanceJson: normaliseNutrientProvenance(item, nutrients),
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

export type NutritionReadItem = {
  name: string;
  quantity: number;
  unit: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients: Record<NutrientKey, number | null>;
  sourceFormAmounts: Record<NutrientUpperLimitKey, number | null>;
};

export type NutritionHistoryMeal = {
  /** Internal key for the encrypted continuation cursor. Never return this field to a client. */
  id: string;
  consumedAt: number;
  mealType: string | null;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: NutritionReadItem[];
};

export type NutritionHistoryPage = {
  meals: NutritionHistoryMeal[];
  hasMore: boolean;
};

export type NutritionDailyNutrient = {
  recordedAmount: number | null;
  knownItemCount: number;
  totalItemCount: number;
  complete: boolean;
};

export type NutritionDailySummary = {
  date: string;
  status: "logged" | "unlogged";
  mealCount: number;
  itemCount: number;
  totals: { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number };
  nutrients: Record<NutrientKey, NutritionDailyNutrient>;
  sourceFormAmounts: Record<NutrientUpperLimitKey, NutritionDailyNutrient>;
};

export type CurrentNutritionTargets = {
  scope: "current_settings_only";
  caloriesKcal: number | null;
  protein: { mode: ProteinGoalMode; grams: number | null; gramsPerKg: number | null };
  nutrients: ReturnType<typeof resolveNutrientGoals>;
};

export type NutritionSummaryReport = {
  startDate: string;
  endDate: string;
  days: NutritionDailySummary[];
  currentTargets: CurrentNutritionTargets;
};

/** Fetch one bounded, owner-scoped page of completed meals in stable UTC order. */
export async function listNutritionHistoryPage({ db, ownerKey, from, to, limit, cursor }: {
  db: AppDb;
  ownerKey: string;
  from: number;
  to: number;
  limit: number;
  cursor?: { consumedAt: number; id: string } | null;
}): Promise<NutritionHistoryPage> {
  const conditions = [
    eq(mealLogs.ownerKey, ownerKey),
    eq(mealLogs.status, "complete"),
    gte(mealLogs.consumedAt, from),
    lt(mealLogs.consumedAt, to),
  ];
  if (cursor) {
    conditions.push(or(
      lt(mealLogs.consumedAt, cursor.consumedAt),
      and(eq(mealLogs.consumedAt, cursor.consumedAt), lt(mealLogs.id, cursor.id)),
    )!);
  }

  const meals = await db.select({
    id: mealLogs.id,
    consumedAt: mealLogs.consumedAt,
    mealType: mealLogs.mealType,
    caloriesKcal: mealLogs.totalCalories,
    proteinG: mealLogs.totalProteinG,
    carbsG: mealLogs.totalCarbsG,
    fatG: mealLogs.totalFatG,
  }).from(mealLogs)
    .where(and(...conditions))
    .orderBy(desc(mealLogs.consumedAt), desc(mealLogs.id))
    .limit(limit + 1)
    .prepare()
    .all();

  const hasMore = meals.length > limit;
  const pageMeals = meals.slice(0, limit);
  if (pageMeals.length === 0) return { meals: [], hasMore: false };

  const items = await db.select().from(mealItems)
    .where(and(
      eq(mealItems.ownerKey, ownerKey),
      inArray(mealItems.mealId, pageMeals.map((meal) => meal.id)),
    ))
    .orderBy(desc(mealItems.createdAt))
    .prepare()
    .all();

  const itemsByMeal = new Map<string, typeof items>();
  for (const item of items) {
    const grouped = itemsByMeal.get(item.mealId) ?? [];
    grouped.push(item);
    itemsByMeal.set(item.mealId, grouped);
  }
  return {
    meals: pageMeals.map((meal) => ({
      ...meal,
      items: (itemsByMeal.get(meal.id) ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        caloriesKcal: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, item[key] ?? null])) as Record<NutrientKey, number | null>,
        sourceFormAmounts: Object.fromEntries(NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [key, item[key] ?? null])) as Record<NutrientUpperLimitKey, number | null>,
      })),
    })),
    hasMore,
  };
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Aggregate a bounded UTC range in SQLite and return one row for each date, including unlogged dates. */
export async function getNutritionSummary({ db, ownerKey, from, to, startDate, endDate, dayCount }: {
  db: AppDb;
  ownerKey: string;
  from: number;
  to: number;
  startDate: string;
  endDate: string;
  dayCount: number;
}): Promise<NutritionSummaryReport> {
  const mealDate = sql<string>`date(${mealLogs.consumedAt} / 1000, 'unixepoch')`;
  const [mealRows, nutrientRows, currentSettings] = await Promise.all([
    db.select({
      date: mealDate,
      mealCount: sql<number>`count(*)`,
      caloriesKcal: sql<number>`coalesce(sum(${mealLogs.totalCalories}), 0)`,
      proteinG: sql<number>`coalesce(sum(${mealLogs.totalProteinG}), 0)`,
      carbsG: sql<number>`coalesce(sum(${mealLogs.totalCarbsG}), 0)`,
      fatG: sql<number>`coalesce(sum(${mealLogs.totalFatG}), 0)`,
    }).from(mealLogs)
      .where(and(
        eq(mealLogs.ownerKey, ownerKey),
        eq(mealLogs.status, "complete"),
        gte(mealLogs.consumedAt, from),
        lt(mealLogs.consumedAt, to),
      ))
      .groupBy(mealDate)
      .prepare()
      .all(),
    (() => {
      const aggregateColumns: Record<string, SQL> = {};
      for (const key of [...NUTRIENT_KEYS, ...NUTRIENT_UPPER_LIMIT_KEYS]) {
        aggregateColumns[`${key}Amount`] = sql<number | null>`sum(${mealItems[key]})`;
        aggregateColumns[`${key}KnownItemCount`] = sql<number>`count(${mealItems[key]})`;
      }
      const itemDate = sql<string>`date(${mealLogs.consumedAt} / 1000, 'unixepoch')`;
      return db.select({
        date: itemDate,
        itemCount: sql<number>`count(*)`,
        ...aggregateColumns,
      }).from(mealItems)
        .innerJoin(mealLogs, eq(mealLogs.id, mealItems.mealId))
        .where(and(
          eq(mealItems.ownerKey, ownerKey),
          eq(mealLogs.ownerKey, ownerKey),
          eq(mealLogs.status, "complete"),
          gte(mealLogs.consumedAt, from),
          lt(mealLogs.consumedAt, to),
        ))
        .groupBy(itemDate)
        .prepare()
        .all();
    })(),
    getSettings(db, ownerKey),
  ]);

  const mealsByDate = new Map(mealRows.map((row) => [row.date, row]));
  const nutrientValuesByDate = new Map<string, Map<string, unknown>>();
  for (const row of nutrientRows) nutrientValuesByDate.set(row.date, new Map(Object.entries(row)));
  const days: NutritionDailySummary[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(from + offset * 86_400_000).toISOString().slice(0, 10);
    const mealRow = mealsByDate.get(date);
    const itemRow = nutrientValuesByDate.get(date);
    const itemCount = finiteCount(itemRow?.get("itemCount"));
    const makeNutrientSummary = (key: NutrientKey | NutrientUpperLimitKey): NutritionDailyNutrient => {
      const knownItemCount = finiteCount(itemRow?.get(`${key}KnownItemCount`));
      return {
        recordedAmount: nullableAmount(itemRow?.get(`${key}Amount`)),
        knownItemCount,
        totalItemCount: itemCount,
        complete: itemCount > 0 && knownItemCount === itemCount,
      };
    };
    days.push({
      date,
      status: mealRow ? "logged" : "unlogged",
      mealCount: finiteCount(mealRow?.mealCount),
      itemCount,
      totals: {
        caloriesKcal: finiteCount(mealRow?.caloriesKcal),
        proteinG: finiteCount(mealRow?.proteinG),
        carbsG: finiteCount(mealRow?.carbsG),
        fatG: finiteCount(mealRow?.fatG),
      },
      nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, makeNutrientSummary(key)])) as Record<NutrientKey, NutritionDailyNutrient>,
      sourceFormAmounts: Object.fromEntries(NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [key, makeNutrientSummary(key)])) as Record<NutrientUpperLimitKey, NutritionDailyNutrient>,
    });
  }

  const nutrientOverrides = parseNutrientGoalOverridesJson(currentSettings?.nutrientTargetsJson);
  return {
    startDate,
    endDate,
    days,
    currentTargets: {
      scope: "current_settings_only",
      caloriesKcal: currentSettings?.dailyCalorieTarget ?? null,
      protein: {
        mode: normaliseProteinGoalMode(currentSettings?.proteinGoalMode),
        grams: currentSettings?.dailyProteinTargetG ?? null,
        gramsPerKg: currentSettings?.dailyProteinTargetPerKg ?? null,
      },
      nutrients: resolveNutrientGoals(nutrientOverrides),
    },
  };
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

function snapshotForMeal(source: MealWithItems): SavedEntrySnapshot {
  let assumptions: unknown[] = [];
  try {
    const parsed = JSON.parse(source.meal.assumptionsJson);
    if (Array.isArray(parsed)) assumptions = parsed;
  } catch {
    // Ignore malformed legacy assumptions when building a reusable snapshot.
  }
  return {
    caption: source.meal.caption,
    mealType: source.meal.mealType,
    confidence: source.meal.confidence,
    assumptions,
    notes: source.meal.notes,
    items: source.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      ...normaliseNutrientFields(item),
      ...normaliseNutrientUpperLimitFields(item),
      nutrientProvenance: parsedNutrientProvenance(item.nutrientProvenanceJson, item),
      confidence: item.confidence,
      source: item.source,
    })),
  };
}

function parseSavedEntry(row: typeof savedEntries.$inferSelect): SavedEntryWithSnapshot | null {
  try {
    const value = JSON.parse(row.snapshotJson) as SavedEntrySnapshot;
    if (!value || typeof value !== "object" || !Array.isArray(value.items)) return null;
    return {
      id: row.id,
      sourceMealId: row.sourceMealId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      snapshot: value,
    };
  } catch {
    return null;
  }
}

export async function listSavedEntries(db: AppDb, ownerKey: string): Promise<SavedEntryWithSnapshot[]> {
  const rows = await db.select().from(savedEntries)
    .where(eq(savedEntries.ownerKey, ownerKey))
    .orderBy(desc(savedEntries.createdAt)).prepare().all();
  return rows.flatMap((row) => {
    const parsed = parseSavedEntry(row);
    return parsed ? [parsed] : [];
  });
}

export async function saveEntry(db: AppDb, ownerKey: string, sourceMealId: string): Promise<SavedEntryWithSnapshot | null> {
  const source = await findMeal(db, ownerKey, sourceMealId);
  if (!source) return null;
  const timestamp = nowMs();
  await db.insert(savedEntries).values({
    id: createId("saved"),
    ownerKey,
    sourceMealId,
    snapshotJson: safeJson(snapshotForMeal(source), {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: [savedEntries.ownerKey, savedEntries.sourceMealId],
    set: { snapshotJson: safeJson(snapshotForMeal(source), {}), updatedAt: timestamp },
  }).prepare().run();
  const row = await db.select().from(savedEntries).where(and(
    eq(savedEntries.ownerKey, ownerKey),
    eq(savedEntries.sourceMealId, sourceMealId),
  )).limit(1).prepare().get();
  return row ? parseSavedEntry(row) : null;
}

export async function removeSavedEntry(db: AppDb, ownerKey: string, id: string): Promise<boolean> {
  const existing = await db.select({ id: savedEntries.id }).from(savedEntries).where(and(
    eq(savedEntries.ownerKey, ownerKey), eq(savedEntries.id, id),
  )).limit(1).prepare().get();
  if (!existing) return false;
  await db.delete(savedEntries).where(and(
    eq(savedEntries.ownerKey, ownerKey), eq(savedEntries.id, id),
  )).prepare().run();
  return true;
}

export async function trackSavedEntry(
  db: AppDb,
  ownerKey: string,
  id: string,
  consumedAt = nowMs(),
): Promise<MealWithItems | null> {
  const row = await db.select().from(savedEntries).where(and(
    eq(savedEntries.ownerKey, ownerKey), eq(savedEntries.id, id),
  )).limit(1).prepare().get();
  const saved = row ? parseSavedEntry(row) : null;
  if (!saved) return null;
  return createMeal(db, ownerKey, {
    ...saved.snapshot,
    consumedAt,
    source: "saved-entry",
    savedEntryId: id,
  });
}

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

  const snapshot = snapshotForMeal(source);
  return createMeal(db, ownerKey, {
    consumedAt: options.consumedAt ?? nowMs(),
    source: "dashboard",
    ...snapshot,
    savedEntryId: source.meal.savedEntryId,
    status: source.meal.status,
    photoKey: source.meal.photoKey,
    photoMimeType: source.meal.photoMimeType,
    photoSizeBytes: source.meal.photoSizeBytes,
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
    savedEntryId: input.savedEntryId ?? null,
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
      ...normaliseNutrientUpperLimitFields(input.nutrients ?? {}),
      nutrientProvenanceJson: null,
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
  const vitaminB6UsFnbAdultUlEnabled = patch.vitaminB6UsFnbAdultUlEnabled === undefined
    ? existing?.vitaminB6UsFnbAdultUlEnabled === true
    : patch.vitaminB6UsFnbAdultUlEnabled;
  const vitaminB6UsFnbAdultUlConfirmedAt = patch.vitaminB6UsFnbAdultUlEnabled === undefined
    ? existing?.vitaminB6UsFnbAdultUlConfirmedAt ?? null
    : vitaminB6UsFnbAdultUlEnabled ? existing?.vitaminB6UsFnbAdultUlConfirmedAt ?? timestamp : null;
  const usFnbAdultUlEnabled = patch.usFnbAdultUlEnabled === undefined
    ? existing?.usFnbAdultUlEnabled === true
    : patch.usFnbAdultUlEnabled;
  const usFnbAdultUlConfirmedAt = patch.usFnbAdultUlEnabled === undefined
    ? existing?.usFnbAdultUlConfirmedAt ?? null
    : usFnbAdultUlEnabled ? existing?.usFnbAdultUlConfirmedAt ?? timestamp : null;
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
      vitaminB6UsFnbAdultUlEnabled,
      vitaminB6UsFnbAdultUlConfirmedAt,
      usFnbAdultUlEnabled,
      usFnbAdultUlConfirmedAt,
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
      vitaminB6UsFnbAdultUlEnabled,
      vitaminB6UsFnbAdultUlConfirmedAt,
      usFnbAdultUlEnabled,
      usFnbAdultUlConfirmedAt,
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
  // Keep 30 finished days for insights in addition to the in-progress day.
  const insightStartDate = shiftDateKey(logicalDate, -30);
  const endMs = firstInstantForLocalDate({ date: shiftDateKey(logicalDate, 1), formatter });
  const weekStartMs = firstInstantForLocalDate({ date: weekStartDate, formatter });
  const insightStartMs = firstInstantForLocalDate({ date: insightStartDate, formatter });
  const [settingsRow, trendMeals, trendWeights, weightBeforeTrend] = await Promise.all([
    getSettings(db, ownerKey),
    listMealsInRange({ db, ownerKey, from: insightStartMs, to: endMs }),
    listDailyWeights({ db, ownerKey, from: insightStartDate, to: logicalDate }),
    getLatestDailyWeightBefore({ db, ownerKey, logicalDate: insightStartDate }),
  ]);
  const nutrientTargetOverrides = parseNutrientGoalOverridesJson(settingsRow?.nutrientTargetsJson);
  const recentMeals = trendMeals.filter((entry) => entry.meal.consumedAt >= weekStartMs);
  const recentWeights = trendWeights.filter((entry) => entry.logicalDate >= weekStartDate);
  const proteinGoal = buildProteinGoalSummary({
    dates: Array.from({ length: 31 }, (_, index) => shiftDateKey(insightStartDate, index)),
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
    referenceSettings: {
      vitaminB6UsFnbAdultUlEnabled: settingsRow?.vitaminB6UsFnbAdultUlEnabled === true,
      usFnbAdultUlEnabled: settingsRow?.usFnbAdultUlEnabled === true,
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
      weights: trendWeights.filter((weight) => weight.logicalDate >= monthStartDate)
        .map(({ logicalDate, weightKg, recordedAt }) => ({ logicalDate, weightKg, recordedAt })),
    },
    insights: {
      fromDate: insightStartDate,
      toDate: logicalDate,
      entries: [...mealsByDate].flatMap(([date, entries]) => entries.map(({ meal, items }) => ({
        id: meal.id,
        date,
        consumedAt: meal.consumedAt,
        calories: meal.totalCalories,
        proteinG: meal.totalProteinG,
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          proteinG: item.proteinG,
          nutrients: {
            ...Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nullableNutrientValue(item[key])])),
            ...Object.fromEntries(NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [key, nullableNutrientValue(item[key])])),
          } as NutrientValues & NutrientUpperLimitValues,
          ...(Object.keys(parsedNutrientProvenance(item.nutrientProvenanceJson, item)).length > 0
            ? { nutrientProvenance: parsedNutrientProvenance(item.nutrientProvenanceJson, item) }
            : {}),
        })),
      }))),
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
