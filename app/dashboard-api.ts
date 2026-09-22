import { isProteinGoalMode, isValidProteinPerKg, type ProteinGoalDay, type ProteinGoalSummary } from "../domain/protein-goals";
import { hasNutrientProvenance, parseNutrientProvenance, type NutrientProvenanceMap } from "../domain/nutrient-provenance";
import type { NutritionItem } from "./nutrition/meal-nutrition-details";
import type { InsightEntry, InsightHistory, InsightItem } from "./insights/types";
import { nutrientKeys, parseNutrientGoalMap, parseNutrientAggregateMap, parseNutrientValue, type NutrientAggregateMap, type NutrientGoalMap, type NutrientValueMap } from "./nutrition/nutrient-meta";
import { NUTRIENT_UPPER_LIMIT_KEYS } from "../domain/nutrients";

export type SerializedMealItem = NutritionItem & {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients?: NutrientValueMap;
  nutrientProvenance?: NutrientProvenanceMap;
  confidence?: string | number | null;
  source?: string | null;
};

export type SerializedMeal = {
  id: string;
  consumedAt: number;
  caption: string;
  mealType: string | null;
  status: string;
  savedEntryId?: string | null;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  photoKey: string | null;
  photoMimeType: string | null;
  hasPhoto: boolean;
  items: SerializedMealItem[];
};

export type SavedEntry = {
  id: string;
  sourceEntryId: string;
  caption: string;
  entryType: string | null;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  items: SerializedMealItem[];
};

export type DailyWeight = {
  logicalDate: string;
  weightKg: number;
  recordedAt: number;
};

export type NutritionReferenceSettings = {
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
};

export type TrendDay = {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  nutrients: NutrientAggregateMap;
};

export type DashboardSummary = {
  date: string;
  targets: { calories: number | null; proteinG: number | null; nutrients: NutrientGoalMap };
  referenceSettings?: NutritionReferenceSettings;
  proteinGoal: ProteinGoalSummary;
  today: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    mealCount: number;
  };
  sevenDay: {
    calories: number;
    proteinG: number;
    averageCalories: number;
    averageProteinG: number;
    daysWithMeals: number;
  };
  recentMeals: SerializedMeal[];
  recentWeights: DailyWeight[];
  insights?: InsightHistory;
  trend?: { byDate: TrendDay[]; weights: DailyWeight[] };
  nutrition?: {
    today: NutrientAggregateMap;
    sevenDay: NutrientAggregateMap;
    byDate: Array<{ date: string; nutrients: NutrientAggregateMap }>;
  };
};
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteFields(record: Record<string, unknown> | null, fields: string[]): record is Record<string, unknown> {
  return record !== null && fields.every((field) => typeof record[field] === "number" && Number.isFinite(record[field]));
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const entries: T[] = [];
  for (const valueEntry of value) {
    const entry = parse(valueEntry);
    if (entry === null) return null;
    entries.push(entry);
  }
  return entries;
}

export function stringOr(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function parseMealItem(value: unknown): SerializedMealItem | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string"
    || !finiteFields(record, ["calories", "proteinG", "carbsG", "fatG"])) return null;
  const nestedNutrients = asRecord(record.nutrients);
  const nutrients: NutrientValueMap = {};
  for (const key of nutrientKeys) {
    const source = nestedNutrients && Object.prototype.hasOwnProperty.call(nestedNutrients, key)
      ? nestedNutrients[key]
      : record[key];
    nutrients[key] = parseNutrientValue(source);
  }
  for (const key of NUTRIENT_UPPER_LIMIT_KEYS) {
    const source = nestedNutrients && Object.prototype.hasOwnProperty.call(nestedNutrients, key)
      ? nestedNutrients[key]
      : Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
    if (source !== undefined) nutrients[key] = parseNutrientValue(source);
  }
  const nutrientProvenance = parseNutrientProvenance(record.nutrientProvenance, nutrients);
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    name: record.name,
    quantity: typeof record.quantity === "number" && Number.isFinite(record.quantity) ? record.quantity : 1,
    unit: typeof record.unit === "string" ? record.unit : "serving",
    calories: numberOr(record.calories),
    proteinG: numberOr(record.proteinG),
    carbsG: numberOr(record.carbsG),
    fatG: numberOr(record.fatG),
    confidence: typeof record.confidence === "number" || typeof record.confidence === "string" ? record.confidence : null,
    source: typeof record.source === "string" ? record.source : null,
    nutrients,
    ...(hasNutrientProvenance(nutrientProvenance) ? { nutrientProvenance } : {}),
  };
}

function parseSerializedMeal(value: unknown): SerializedMeal | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || !record.id || !Array.isArray(record.items)
    || !finiteFields(record, ["consumedAt", "totalCalories", "totalProteinG", "totalCarbsG", "totalFatG"])) return null;
  const consumedAt = numberOr(record.consumedAt, Number.NaN);
  if (!Number.isFinite(new Date(consumedAt).getTime())) return null;
  const items = parseArray(record.items, parseMealItem);
  if (!items) return null;
  return {
    id: record.id,
    consumedAt,
    caption: stringOr(record.caption),
    mealType: typeof record.mealType === "string" ? record.mealType : null,
    status: stringOr(record.status, "complete"),
    savedEntryId: typeof record.savedEntryId === "string" && record.savedEntryId ? record.savedEntryId : null,
    totalCalories: numberOr(record.totalCalories),
    totalProteinG: numberOr(record.totalProteinG),
    totalCarbsG: numberOr(record.totalCarbsG),
    totalFatG: numberOr(record.totalFatG),
    photoKey: typeof record.photoKey === "string" && record.photoKey.length > 0 ? record.photoKey : null,
    photoMimeType: typeof record.photoMimeType === "string" && record.photoMimeType.length > 0 ? record.photoMimeType : null,
    hasPhoto: record.hasPhoto === true,
    items,
  };
}

function parseDailyWeight(value: unknown): DailyWeight | null {
  const record = asRecord(value);
  if (!record || !isDateKey(record.logicalDate)) return null;
  const weightKg = numberOr(record.weightKg, Number.NaN);
  const recordedAt = numberOr(record.recordedAt, Number.NaN);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(recordedAt)) return null;
  return { logicalDate: record.logicalDate, weightKg, recordedAt };
}

export function parseWeightResponse(value: unknown): DailyWeight | null {
  return parseDailyWeight(asRecord(value)?.weight);
}

function parseProteinGoalDay(value: unknown): ProteinGoalDay | null {
  const record = asRecord(value);
  if (!record || typeof record.date !== "string") return null;
  const targetG = numberOr(record.targetG, Number.NaN);
  const weightKg = numberOr(record.weightKg, Number.NaN);
  return {
    date: record.date,
    targetG: Number.isFinite(targetG) ? targetG : null,
    weightKg: Number.isFinite(weightKg) ? weightKg : null,
    weightDate: typeof record.weightDate === "string" ? record.weightDate : null,
  };
}

function parseProteinGoal(value: unknown, fallbackTargetG: number | null): ProteinGoalSummary {
  const record = asRecord(value);
  const mode = isProteinGoalMode(record?.mode) ? record.mode : "grams";
  const gramsPerKg = numberOr(record?.gramsPerKg, Number.NaN);
  const fixedTargetG = numberOr(record?.fixedTargetG, Number.NaN);
  const targetG = numberOr(record?.targetG, Number.NaN);
  const weightKg = numberOr(record?.weightKg, Number.NaN);
  const byDate = Array.isArray(record?.byDate)
    ? record.byDate.flatMap((day) => {
        const parsed = parseProteinGoalDay(day);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    mode,
    gramsPerKg: mode === "gramsPerKg" && isValidProteinPerKg(gramsPerKg) ? gramsPerKg : null,
    fixedTargetG: Number.isFinite(fixedTargetG)
      ? fixedTargetG
      : Number.isFinite(fallbackTargetG) ? fallbackTargetG : null,
    targetG: Number.isFinite(targetG)
      ? targetG
      : Number.isFinite(fallbackTargetG) ? fallbackTargetG : null,
    weightKg: Number.isFinite(weightKg) ? weightKg : null,
    weightDate: typeof record?.weightDate === "string" ? record.weightDate : null,
    byDate,
  };
}

function parseInsightHistory(value: unknown): InsightHistory | null {
  const record = asRecord(value);
  if (!record || !isDateKey(record.fromDate) || !isDateKey(record.toDate)
    || record.fromDate > record.toDate) return null;
  const fromDate = record.fromDate;
  const toDate = record.toDate;
  if ((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000 > 30) return null;
  const entries = parseArray(record.entries, (value): InsightEntry | null => {
    const entry = asRecord(value);
    if (!entry || typeof entry.id !== "string" || !entry.id || !isDateKey(entry.date)
      || entry.date < fromDate || entry.date > toDate
      || !finiteFields(entry, ["consumedAt", "calories", "proteinG"])
      || !Number.isFinite(new Date(entry.consumedAt as number).getTime())) return null;
    const items = parseArray(entry.items, (value): InsightItem | null => {
      const item = asRecord(value);
      if (!item || typeof item.name !== "string" || !finiteFields(item, ["calories", "proteinG"])) return null;
      const rawNutrients = asRecord(item.nutrients);
      const nutrients: NutrientValueMap = {};
      for (const key of nutrientKeys) nutrients[key] = parseNutrientValue(rawNutrients?.[key]);
      for (const key of NUTRIENT_UPPER_LIMIT_KEYS) {
        if (rawNutrients && Object.prototype.hasOwnProperty.call(rawNutrients, key)) {
          nutrients[key] = parseNutrientValue(rawNutrients[key]);
        }
      }
      const nutrientProvenance = parseNutrientProvenance(item.nutrientProvenance, nutrients);
      return {
        name: item.name,
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null,
        unit: typeof item.unit === "string" ? item.unit : null,
        calories: numberOr(item.calories),
        proteinG: numberOr(item.proteinG),
        nutrients,
        ...(hasNutrientProvenance(nutrientProvenance) ? { nutrientProvenance } : {}),
      };
    });
    if (!items) return null;
    return { id: entry.id, date: entry.date, consumedAt: numberOr(entry.consumedAt), calories: numberOr(entry.calories), proteinG: numberOr(entry.proteinG), items };
  });
  if (!entries || new Set(entries.map((entry) => entry.id)).size !== entries.length) return null;
  return { fromDate, toDate, entries };
}

export function parseDashboardPayload(value: unknown): DashboardSummary | null {
  const record = asRecord(value);
  const targets = asRecord(record?.targets);
  const today = asRecord(record?.today);
  const sevenDay = asRecord(record?.sevenDay);
  if (!record || !isDateKey(record.date) || !targets
    || ![targets.calories, targets.proteinG].every((target) => target === null || (typeof target === "number" && Number.isFinite(target)))
    || !finiteFields(today, ["calories", "proteinG", "carbsG", "fatG", "mealCount"])
    || !finiteFields(sevenDay, ["calories", "proteinG", "averageCalories", "averageProteinG", "daysWithMeals"])
    || !Array.isArray(record.recentMeals) || !Array.isArray(record.recentWeights)) return null;
  const nutritionRecord = asRecord(record.nutrition);
  const nutritionByDate = Array.isArray(nutritionRecord?.byDate)
    ? nutritionRecord.byDate.flatMap((entry) => {
        const dateEntry = asRecord(entry);
        if (!dateEntry || typeof dateEntry.date !== "string") return [];
        return [{ date: dateEntry.date, nutrients: parseNutrientAggregateMap(dateEntry.nutrients) }];
      })
    : [];
  const recentMeals = parseArray(record.recentMeals, parseSerializedMeal);
  const recentWeights = parseArray(record.recentWeights, parseDailyWeight);
  if (!recentMeals || !recentWeights) return null;
  const insights = record.insights === undefined ? undefined : parseInsightHistory(record.insights);
  if (insights === null || (insights && insights.toDate !== record.date)) return null;
  const trendRecord = asRecord(record.trend);
  if (record.trend !== undefined && !trendRecord) return null;
  const trendByDate = trendRecord
    ? parseArray(trendRecord.byDate, (entry): TrendDay | null => {
        const day = asRecord(entry);
        if (!day || !isDateKey(day.date)
          || !finiteFields(day, ["calories", "proteinG", "carbsG", "fatG", "mealCount"])) return null;
        return {
          date: day.date,
          calories: numberOr(day.calories),
          proteinG: numberOr(day.proteinG),
          carbsG: numberOr(day.carbsG),
          fatG: numberOr(day.fatG),
          mealCount: numberOr(day.mealCount),
          nutrients: parseNutrientAggregateMap(day.nutrients),
        };
      })
    : [];
  const trendWeights = trendRecord ? parseArray(trendRecord.weights, parseDailyWeight) : [];
  if (!trendByDate || !trendWeights) return null;
  const parsedTargets = {
    calories: targets && typeof targets.calories === "number" ? targets.calories : null,
    proteinG: targets && typeof targets.proteinG === "number" ? targets.proteinG : null,
    nutrients: parseNutrientGoalMap(targets?.nutrients),
  };
  const referenceSettingsRecord = asRecord(record.referenceSettings);
  const referenceSettings = referenceSettingsRecord ? {
    vitaminB6UsFnbAdultUlEnabled: referenceSettingsRecord.vitaminB6UsFnbAdultUlEnabled === true,
    usFnbAdultUlEnabled: referenceSettingsRecord.usFnbAdultUlEnabled === true,
  } : undefined;
  return {
    date: record.date,
    targets: parsedTargets,
    referenceSettings,
    proteinGoal: parseProteinGoal(record.proteinGoal, parsedTargets.proteinG),
    today: {
      calories: numberOr(today.calories),
      proteinG: numberOr(today.proteinG),
      carbsG: numberOr(today.carbsG),
      fatG: numberOr(today.fatG),
      mealCount: numberOr(today.mealCount),
    },
    sevenDay: {
      calories: numberOr(sevenDay.calories),
      proteinG: numberOr(sevenDay.proteinG),
      averageCalories: numberOr(sevenDay.averageCalories),
      averageProteinG: numberOr(sevenDay.averageProteinG),
      daysWithMeals: numberOr(sevenDay.daysWithMeals),
    },
    recentMeals,
    recentWeights,
    insights,
    trend: trendByDate.length ? { byDate: trendByDate, weights: trendWeights } : undefined,
    nutrition: nutritionRecord ? {
      today: parseNutrientAggregateMap(nutritionRecord.today),
      sevenDay: parseNutrientAggregateMap(nutritionRecord.sevenDay),
      byDate: nutritionByDate,
    } : undefined,
  };
}

export function dashboardFailureMessage(status: number, responseBody: unknown): string {
  const errorCode = asRecord(asRecord(responseBody)?.error)?.code;
  if (status === 401) return "Your saved log could not be loaded. Sign in again and try again.";
  if (errorCode === "database_unavailable") {
    return "Your saved log is unavailable because the database is not configured.";
  }
  if (errorCode === "auth_access_settings_missing") {
    return "Your saved log is unavailable because owner sign-in is not configured.";
  }
  if (errorCode === "auth_owner_allowlist_missing") {
    return "Your saved log is unavailable because owner access is not configured.";
  }
  if (errorCode === "auth_unavailable") {
    return "Your saved log is unavailable because owner authentication is temporarily unavailable.";
  }
  return "Your saved log is unavailable. Try again later.";
}

export function parseMealResponse(value: unknown) {
  const record = asRecord(value);
  return parseSerializedMeal(record?.meal);
}

function parseSavedEntry(value: unknown): SavedEntry | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || !record.id
    || typeof record.sourceEntryId !== "string" || !record.sourceEntryId
    || !Array.isArray(record.items)
    || !finiteFields(record, ["totalCalories", "totalProteinG", "totalCarbsG", "totalFatG"])) return null;
  const items = parseArray(record.items, parseMealItem);
  if (!items) return null;
  return {
    id: record.id,
    sourceEntryId: record.sourceEntryId,
    caption: stringOr(record.caption),
    entryType: typeof record.entryType === "string" ? record.entryType : null,
    totalCalories: numberOr(record.totalCalories),
    totalProteinG: numberOr(record.totalProteinG),
    totalCarbsG: numberOr(record.totalCarbsG),
    totalFatG: numberOr(record.totalFatG),
    items,
  };
}

export function parseSavedEntriesResponse(value: unknown): SavedEntry[] | null {
  const entries = asRecord(value)?.entries;
  return parseArray(entries, parseSavedEntry);
}

export function parseTrackedEntryResponse(value: unknown) {
  return parseSerializedMeal(asRecord(value)?.entry);
}

export function parseSettingsTargets(value: unknown) {
  const record = asRecord(value);
  const settings = asRecord(record?.settings);
  if (!settings) return null;
  const proteinGoalMode = isProteinGoalMode(settings.proteinGoalMode) ? settings.proteinGoalMode : "grams";
  const proteinPerKg = numberOr(settings.dailyProteinTargetPerKg, Number.NaN);
  const proteinG = numberOr(settings.dailyProteinTargetG, Number.NaN);
  return {
    calories: numberOr(settings.dailyCalorieTarget, Number.NaN),
    proteinG,
    proteinGoalMode,
    proteinPerKg: isValidProteinPerKg(proteinPerKg) ? proteinPerKg : null,
    nutrients: parseNutrientGoalMap(settings.nutrientTargets),
    vitaminB6UsFnbAdultUlEnabled: settings.vitaminB6UsFnbAdultUlEnabled === true,
    usFnbAdultUlEnabled: settings.usFnbAdultUlEnabled === true,
  };
}
