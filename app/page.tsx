"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";

import { resolveNutrientGoals } from "../domain/nutrient-goals";
import type { NutrientKey } from "../domain/nutrients";

import {
  calculateCalorieChartScale,
  calculateLoggingStreak,
  calculateMacroPercentages,
  calculateMacroTrend,
  calculateSevenDayAverage,
  calculateTargetPercent,
  calculateWeightChartScale,
  compareAverageToTarget,
  getAdjacentDayKey,
} from "./dashboard-calculations";
import { getMealSwipeAction } from "./meal-swipe";
import { photoUrlForKey, publicPhotoUrlForMealId } from "./photo-url";
import {
  aggregateNutrientValues,
  nutrientKeys,
  parseNutrientGoalMap,
  parseNutrientAggregateMap,
  parseNutrientValue,
  type NutrientAggregateMap,
  type NutrientGoalMap,
  type NutrientValueMap,
} from "./nutrition/nutrient-meta";
import {
  NutrientGoalSettings,
  nutrientGoalDraftFromMap,
  nutrientGoalOverridesFromDraft,
  type NutrientGoalDraft,
} from "./nutrition/nutrient-goal-settings";
import { MealNutritionDetails, type NutritionItem } from "./nutrition/meal-nutrition-details";
import { MealNutritionEditor, nutrientValuesFromForm } from "./nutrition/meal-nutrition-editor";
import { NutrientTrendPanel } from "./nutrition/nutrient-trend-panel";
import { NutritionOverview } from "./nutrition/nutrition-overview";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type Meal = {
  id: string;
  time: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  photoKey?: string | null;
  photoMimeType?: string | null;
  photoUrl?: string | null;
  items: NutritionItem[];
  pending?: "creating" | "copying";
  kind: "breakfast" | "lunch" | "snack" | "dinner";
};

type Day = {
  key: DayKey;
  date: string;
  shortDate: string;
  weekday: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  nutrients?: NutrientAggregateMap;
  meals: Meal[];
  weight?: DailyWeight | null;
};

type SerializedMealItem = NutritionItem & {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients?: NutrientValueMap;
  confidence?: string | number | null;
  source?: string | null;
};

type SerializedMeal = {
  id: string;
  consumedAt: number;
  caption: string;
  mealType: string | null;
  status: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  photoKey: string | null;
  photoMimeType: string | null;
  hasPhoto: boolean;
  items: SerializedMealItem[];
};

type DailyWeight = {
  logicalDate: string;
  weightKg: number;
  recordedAt: number;
};

type DashboardSummary = {
  date: string;
  targets: { calories: number | null; proteinG: number | null; nutrients: NutrientGoalMap };
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
  nutrition?: {
    today: NutrientAggregateMap;
    sevenDay: NutrientAggregateMap;
    byDate: Array<{ date: string; nutrients: NutrientAggregateMap }>;
  };
};

type DataMode = "loading" | "live" | "error";
type DashboardSection = "today" | "meals" | "trend" | "macros" | "nutrition";
type DateKeyMode = "local" | "utc";
type PendingActionKind =
  | "meal-create"
  | "meal-save"
  | "meal-delete"
  | "meal-copy"
  | "weight-save"
  | "settings-load"
  | "settings-save";
type PendingAction = {
  token: number;
  kind: PendingActionKind;
  id?: string;
};
type MealSwipeStart = {
  mealId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

const calorieTarget = 2400;
const proteinTarget = 160;
const defaultNutrientTargets = resolveNutrientGoals();

type TargetState = {
  calories: number;
  proteinG: number;
  nutrients: NutrientGoalMap;
};

type SettingsDraft = {
  calories: string;
  proteinG: string;
  nutrients: NutrientGoalDraft;
};

function settingsDraftForTargets(targets: TargetState): SettingsDraft {
  return {
    calories: String(targets.calories),
    proteinG: String(targets.proteinG),
    nutrients: nutrientGoalDraftFromMap(targets.nutrients),
  };
}

type DashboardProps = {
  readOnly?: boolean;
  publicView?: boolean;
};

// Neutral placeholders stay hidden until the live summary has loaded.
const initialDays: Day[] = [
  { key: "sun", date: "1970-01-04", shortDate: "4", weekday: "Sunday", calories: 0, protein: 0, meals: [] },
  { key: "mon", date: "1970-01-05", shortDate: "5", weekday: "Monday", calories: 0, protein: 0, meals: [] },
  { key: "tue", date: "1970-01-06", shortDate: "6", weekday: "Tuesday", calories: 0, protein: 0, meals: [] },
  { key: "wed", date: "1970-01-07", shortDate: "7", weekday: "Wednesday", calories: 0, protein: 0, meals: [] },
  { key: "thu", date: "1970-01-08", shortDate: "8", weekday: "Thursday", calories: 0, protein: 0, meals: [] },
  { key: "fri", date: "1970-01-09", shortDate: "9", weekday: "Friday", calories: 0, protein: 0, meals: [] },
  { key: "sat", date: "1970-01-10", shortDate: "10", weekday: "Saturday", calories: 0, protein: 0, meals: [] },
];

const dayLabels: Record<DayKey, string> = {
  sun: "S",
  mon: "M",
  tue: "T",
  wed: "W",
  thu: "T",
  fri: "F",
  sat: "S",
};

const mealPlaceholders: Record<Meal["kind"], string> = {
  breakfast: "B",
  lunch: "L",
  snack: "S",
  dinner: "D",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatChartTick(value: number) {
  return value === 0 ? "0" : `${(value / 1000).toFixed(1)}k`;
}

const orderedDayKeys: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function parseMealItem(value: unknown): SerializedMealItem | null {
  const record = asRecord(value);
  if (!record || typeof record.name !== "string") return null;
  const nestedNutrients = asRecord(record.nutrients);
  const nutrients: NutrientValueMap = {};
  for (const key of nutrientKeys) {
    const source = nestedNutrients && Object.prototype.hasOwnProperty.call(nestedNutrients, key)
      ? nestedNutrients[key]
      : record[key];
    nutrients[key] = parseNutrientValue(source);
  }
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
  };
}

function parseSerializedMeal(value: unknown): SerializedMeal | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string") return null;
  const consumedAt = numberOr(record.consumedAt, Number.NaN);
  if (!Number.isFinite(consumedAt)) return null;
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        const parsed = parseMealItem(item);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    id: record.id,
    consumedAt,
    caption: stringOr(record.caption),
    mealType: typeof record.mealType === "string" ? record.mealType : null,
    status: stringOr(record.status, "complete"),
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
  if (!record || typeof record.logicalDate !== "string") return null;
  const weightKg = numberOr(record.weightKg, Number.NaN);
  const recordedAt = numberOr(record.recordedAt, Number.NaN);
  if (!Number.isFinite(weightKg) || !Number.isFinite(recordedAt)) return null;
  return { logicalDate: record.logicalDate, weightKg, recordedAt };
}

function parseWeightResponse(value: unknown): DailyWeight | null {
  return parseDailyWeight(asRecord(value)?.weight);
}

function parseDashboardSummary(value: unknown): DashboardSummary | null {
  const record = asRecord(value);
  const targets = asRecord(record?.targets);
  const today = asRecord(record?.today);
  const sevenDay = asRecord(record?.sevenDay);
  if (!record || typeof record.date !== "string" || !today || !sevenDay) return null;
  const nutritionRecord = asRecord(record.nutrition);
  const nutritionByDate = Array.isArray(nutritionRecord?.byDate)
    ? nutritionRecord.byDate.flatMap((entry) => {
        const dateEntry = asRecord(entry);
        if (!dateEntry || typeof dateEntry.date !== "string") return [];
        return [{ date: dateEntry.date, nutrients: parseNutrientAggregateMap(dateEntry.nutrients) }];
      })
    : [];
  const recentMeals = Array.isArray(record.recentMeals)
    ? record.recentMeals.flatMap((meal) => {
        const parsed = parseSerializedMeal(meal);
        return parsed ? [parsed] : [];
      })
    : [];
  const recentWeights = Array.isArray(record.recentWeights)
    ? record.recentWeights.flatMap((weight) => {
        const parsed = parseDailyWeight(weight);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    date: record.date,
    targets: {
      calories: targets && typeof targets.calories === "number" ? targets.calories : null,
      proteinG: targets && typeof targets.proteinG === "number" ? targets.proteinG : null,
      nutrients: parseNutrientGoalMap(targets?.nutrients),
    },
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
    nutrition: nutritionRecord ? {
      today: parseNutrientAggregateMap(nutritionRecord.today),
      sevenDay: parseNutrientAggregateMap(nutritionRecord.sevenDay),
      byDate: nutritionByDate,
    } : undefined,
  };
}

function parseDashboardPayload(value: unknown) {
  const record = asRecord(value);
  return parseDashboardSummary(record?.summary ?? record?.dashboard ?? value);
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

export function dateKeyFromTimestamp(timestamp: number, { mode }: { mode: DateKeyMode }) {
  const date = new Date(timestamp);
  if (mode === "utc") return date.toISOString().slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayKeyForDate(date: string): DayKey {
  const dayIndex = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return orderedDayKeys[dayIndex] ?? "sun";
}

function dayLabelForDate(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return {
    shortDate: String(parsed.getUTCDate()),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(parsed),
  };
}

function fullDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}

function formatWeight(weightKg: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(weightKg);
}

function formatRecordedTime(recordedAt: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(recordedAt));
}

function dayWithMeals(day: Day, meals: Meal[]): Day {
  return {
    ...day,
    meals,
    calories: meals.reduce((total, meal) => total + meal.calories, 0),
    protein: meals.reduce((total, meal) => total + meal.protein, 0),
    carbs: meals.reduce((total, meal) => total + (meal.carbs ?? 0), 0),
    fat: meals.reduce((total, meal) => total + (meal.fat ?? 0), 0),
    nutrients: aggregateNutrientValues(meals.flatMap((meal) => meal.items.map((item) => item.nutrients ?? {}))),
  };
}

function pendingActionLabel(action: PendingAction): string {
  switch (action.kind) {
    case "meal-create": return "Saving meal…";
    case "meal-save": return "Saving changes…";
    case "meal-delete": return "Deleting meal…";
    case "meal-copy": return "Copying meal to today…";
    case "weight-save": return "Saving weight…";
    case "settings-load": return "Loading saved targets…";
    case "settings-save": return "Saving targets…";
  }
}

function mealKind(value: string | null): Meal["kind"] {
  if (value === "breakfast" || value === "lunch" || value === "dinner") return value;
  return "snack";
}

function mapRemoteMeal(meal: SerializedMeal, { publicView = false }: { publicView?: boolean } = {}): Meal {
  const kind = mealKind(meal.mealType);
  const itemNames = meal.items.map((item) => item.name).filter(Boolean);
  const name = itemNames[0] ?? meal.caption.split(",")[0]?.trim() ?? `${kind[0].toUpperCase()}${kind.slice(1)} meal`;
  return {
    id: meal.id,
    time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(meal.consumedAt)),
    name,
    description: meal.caption || itemNames.join(", ") || "Logged from dashboard",
    calories: meal.totalCalories,
    protein: meal.totalProteinG,
    carbs: meal.totalCarbsG,
    fat: meal.totalFatG,
    photoKey: publicView ? null : meal.photoKey,
    photoMimeType: publicView ? null : meal.photoMimeType,
    photoUrl: publicView
      ? meal.hasPhoto ? publicPhotoUrlForMealId(meal.id) : null
      : photoUrlForKey(meal.photoKey),
    items: meal.items,
    kind,
  };
}

function buildLiveDays(summary: DashboardSummary, { mode, publicView }: { mode: DateKeyMode; publicView: boolean }): Day[] {
  const summaryDate = new Date(`${summary.date}T12:00:00.000Z`);
  const mealsByDate = new Map<string, Meal[]>();
  const weightsByDate = new Map(
    summary.recentWeights.map((weight) => [weight.logicalDate, weight]),
  );
  const nutritionByDate = new Map(
    (summary.nutrition?.byDate ?? []).map((entry) => [entry.date, entry.nutrients]),
  );
  for (const serializedMeal of summary.recentMeals) {
    const key = dateKeyFromTimestamp(serializedMeal.consumedAt, { mode });
    const meals = mealsByDate.get(key) ?? [];
    meals.push(mapRemoteMeal(serializedMeal, { publicView }));
    mealsByDate.set(key, meals);
  }
  return Array.from({ length: 7 }, (_, index) => {
    const parsedDate = new Date(summaryDate.getTime() - (6 - index) * 86_400_000);
    const date = parsedDate.toISOString().slice(0, 10);
    const labels = dayLabelForDate(date);
    const meals = mealsByDate.get(date) ?? [];
    const isToday = date === summary.date;
    const fallbackNutrients = aggregateNutrientValues(meals.flatMap((meal) => meal.items.map((item) => item.nutrients ?? {})));
    return {
      key: dayKeyForDate(date),
      date,
      ...labels,
      calories: isToday ? summary.today.calories : meals.reduce((total, meal) => total + meal.calories, 0),
      protein: isToday ? summary.today.proteinG : meals.reduce((total, meal) => total + meal.protein, 0),
      carbs: isToday ? summary.today.carbsG : meals.reduce((total, meal) => total + (meal.carbs ?? 0), 0),
      fat: isToday ? summary.today.fatG : meals.reduce((total, meal) => total + (meal.fat ?? 0), 0),
      nutrients: isToday
        ? summary.nutrition?.today ?? nutritionByDate.get(date) ?? fallbackNutrients
        : nutritionByDate.get(date) ?? fallbackNutrients,
      meals,
      weight: weightsByDate.get(date) ?? null,
    };
  });
}

function mealPayload(meal: Meal, consumedAt?: number) {
  return {
    ...(consumedAt ? { consumedAt } : {}),
    source: "dashboard",
    caption: meal.description,
    mealType: meal.kind,
    status: "complete",
    items: meal.items.length > 0 ? meal.items.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? "serving",
      calories: item.calories ?? 0,
      proteinG: item.proteinG ?? 0,
      carbsG: item.carbsG ?? 0,
      fatG: item.fatG ?? 0,
      ...item.nutrients,
      confidence: item.confidence ?? null,
      source: item.source ?? "dashboard",
    })) : [{
      name: meal.name,
      quantity: 1,
      unit: "serving",
      calories: meal.calories,
      proteinG: meal.protein,
      carbsG: meal.carbs ?? 0,
      fatG: meal.fat ?? 0,
      source: "dashboard",
    }],
  };
}

const mealPhotoAccept = "image/jpeg,image/png,image/webp";
const maxDashboardMealPhotoBytes = 10 * 1024 * 1024;

function mealRequestOptions(payload: ReturnType<typeof mealPayload>, photo?: File | null): Pick<RequestInit, "body" | "headers"> {
  if (!photo || photo.size === 0) {
    return {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    };
  }

  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.set("photo", photo, photo.name);
  return { body: form };
}

function mealPhotoError(photo: File): string | null {
  if (!mealPhotoAccept.split(",").includes(photo.type)) return "Select a JPEG, PNG, or WebP image.";
  if (photo.size > maxDashboardMealPhotoBytes) return "Select an image that is 10 MB or smaller.";
  return null;
}

export function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function mealDateTimestamp({ date, time }: { date: string; time: string }): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const parsed = new Date(0);
  parsed.setFullYear(year, month - 1, day);
  parsed.setHours(hours, minutes, 0, 0);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hours
    || parsed.getMinutes() !== minutes
  ) return null;
  return parsed.getTime();
}

function parseMealResponse(value: unknown) {
  const record = asRecord(value);
  return parseSerializedMeal(record?.meal);
}

function parseSettingsTargets(value: unknown) {
  const record = asRecord(value);
  const settings = asRecord(record?.settings);
  if (!settings) return null;
  return {
    calories: numberOr(settings.dailyCalorieTarget, Number.NaN),
    proteinG: numberOr(settings.dailyProteinTargetG, Number.NaN),
    nutrients: parseNutrientGoalMap(settings.nutrientTargets),
  };
}

export function Dashboard({ readOnly = false, publicView = false }: DashboardProps) {
  const initialTargets: TargetState = { calories: calorieTarget, proteinG: proteinTarget, nutrients: defaultNutrientTargets };
  const [days, setDays] = useState(initialDays);
  const [selectedDayKey, setSelectedDayKey] = useState<DayKey>("thu");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>("today");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => settingsDraftForTargets(initialTargets));
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const settingsSaveInFlight = useRef(false);
  const settingsReadVersion = useRef(0);
  const [dataMode, setDataMode] = useState<DataMode>("loading");
  const [targets, setTargets] = useState<TargetState>(initialTargets);
  const [dataMessage, setDataMessage] = useState<string | null>(readOnly ? "Loading the public dashboard…" : "Loading your saved log…");
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const actionToken = useRef(0);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const dashboardLoadInFlight = useRef(false);
  const dashboardLoadVersion = useRef(0);
  const [deletingMealId, setDeletingMealId] = useState<string | null>(null);
  const [copyingMealId, setCopyingMealId] = useState<string | null>(null);
  const [mealPhotoDrafts, setMealPhotoDrafts] = useState<Record<string, File | null>>({});
  const [previewMeal, setPreviewMeal] = useState<Meal | null>(null);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(() => new Set());
  const mealCreateInFlight = useRef(false);
  const mealSaveInFlight = useRef<Set<string>>(new Set());
  const mealDeleteInFlight = useRef<string | null>(null);
  const mealCopyInFlight = useRef<string | null>(null);
  const settingsLoadInFlight = useRef(false);
  const weightSaveInFlight = useRef(false);
  const mealSwipeRef = useRef<MealSwipeStart | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const actionInProgress = pendingAction !== null;
  const pendingLabel = pendingAction ? pendingActionLabel(pendingAction) : null;
  const weightActionPending = pendingAction?.kind === "weight-save";
  const settingsLoadPending = pendingAction?.kind === "settings-load";
  const settingsSavePending = pendingAction?.kind === "settings-save";

  const selectedDay = days.find((day) => day.key === selectedDayKey) ?? days[4];
  const selectedWeight = selectedDay.weight ?? null;
  const totalCalories = selectedDay.calories;
  const totalProtein = selectedDay.protein;
  const activeCalorieTarget = targets.calories ?? calorieTarget;
  const activeProteinTarget = targets.proteinG ?? proteinTarget;
  const remainingCalories = activeCalorieTarget - totalCalories;
  const remainingProtein = activeProteinTarget - totalProtein;

  const chartValues = useMemo(
    () => days.map((day) => ({ date: day.date, label: `${day.weekday.slice(0, 3)} ${day.shortDate}`, value: day.calories })),
    [days],
  );

  const chartScale = useMemo(
    () => calculateCalorieChartScale(chartValues.map((day) => day.value), activeCalorieTarget),
    [activeCalorieTarget, chartValues],
  );

  const weightChartValues = useMemo(
    () => days.map((day) => ({
      label: `${day.weekday.slice(0, 3)} ${day.shortDate}`,
      value: day.weight?.weightKg ?? null,
    })),
    [days],
  );

  const weightChartScale = useMemo(
    () => calculateWeightChartScale(weightChartValues.map((day) => day.value)),
    [weightChartValues],
  );

  const hasWeightData = weightChartValues.some((day) => day.value !== null);

  const macroTrendValues = useMemo(
    () => calculateMacroTrend(days.map((day) => ({
      date: day.date,
      carbsG: day.carbs ?? 0,
      proteinG: day.protein,
      fatG: day.fat ?? 0,
    }))).map((day, index) => ({
      ...day,
      label: `${days[index]?.weekday.slice(0, 3) ?? ""} ${days[index]?.shortDate ?? ""}`.trim(),
    })),
    [days],
  );

  const hasMacroTrendData = macroTrendValues.some((day) => day.hasData);

  const averageCalories = useMemo(
    () => calculateSevenDayAverage({
      days: chartValues,
      currentDate: chartValues[chartValues.length - 1]?.date ?? "",
      timeZone: publicView ? "UTC" : browserTimeZone(),
    }),
    [chartValues, publicView],
  );

  const averageComparison = useMemo(
    () => compareAverageToTarget(averageCalories, activeCalorieTarget),
    [activeCalorieTarget, averageCalories],
  );

  const macroValues = useMemo(() => {
    const percentages = calculateMacroPercentages({
      carbsG: selectedDay.carbs ?? 0,
      proteinG: selectedDay.protein,
      fatG: selectedDay.fat ?? 0,
    });
    return {
      ...percentages,
      gradient: `conic-gradient(var(--green) 0 ${percentages.protein}%, var(--blue) ${percentages.protein}% ${percentages.protein + percentages.carbs}%, var(--orange) ${percentages.protein + percentages.carbs}% 100%)`,
    };
  }, [selectedDay.carbs, selectedDay.fat, selectedDay.protein]);

  const loggingStreak = useMemo(
    () => calculateLoggingStreak(days, selectedDay.date),
    [days, selectedDay.date],
  );

  const previousDayKey = getAdjacentDayKey(days, selectedDayKey, "previous");
  const nextDayKey = getAdjacentDayKey(days, selectedDayKey, "next");

  function beginAction(kind: PendingActionKind, id?: string): PendingAction | null {
    if (pendingActionRef.current) return null;
    const action = { token: actionToken.current + 1, kind, id };
    actionToken.current = action.token;
    pendingActionRef.current = action;
    setPendingAction(action);
    return action;
  }

  function isCurrentAction(action: PendingAction) {
    return pendingActionRef.current?.token === action.token;
  }

  function finishAction(action: PendingAction) {
    if (!isCurrentAction(action)) return;
    pendingActionRef.current = null;
    setPendingAction(null);
  }

  function retryDashboard() {
    if (dashboardLoadInFlight.current) return;
    dashboardLoadInFlight.current = true;
    setDashboardLoading(true);
    setDataMode("loading");
    setDataMessage(readOnly ? "Loading the public dashboard…" : "Loading your saved log…");
    setActionError(null);
    setActionStatus(null);
    setDashboardReloadKey((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    const requestVersion = dashboardLoadVersion.current + 1;
    dashboardLoadVersion.current = requestVersion;
    dashboardLoadInFlight.current = true;
    async function loadDashboard() {
      try {
        const endpoint = publicView ? "/api/public/summary" : `/api/dashboard/summary?timezone=${encodeURIComponent(browserTimeZone())}`;
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled && dashboardLoadVersion.current === requestVersion) {
            if (readOnly) {
              setDataMode("error");
              setDataMessage(publicView
                ? "The public dashboard could not be loaded. Try again later."
                : "The read-only dashboard could not be loaded. Try again later.");
            } else {
              const responseBody = await response.json().catch(() => null);
              if (cancelled || dashboardLoadVersion.current !== requestVersion) return;
              setDataMode("error");
              setDataMessage(dashboardFailureMessage(response.status, responseBody));
            }
          }
          return;
        }
        const parsed = parseDashboardPayload(await response.json());
        if (!parsed) throw new Error("invalid_dashboard_summary");
        if (cancelled || dashboardLoadVersion.current !== requestVersion) return;
        const liveDays = buildLiveDays(parsed, { mode: publicView ? "utc" : "local", publicView });
        setTargets({
          calories: parsed.targets.calories ?? calorieTarget,
          proteinG: parsed.targets.proteinG ?? proteinTarget,
          nutrients: parsed.targets.nutrients,
        });
        setDays(liveDays);
        setSelectedDayKey(dayKeyForDate(parsed.date));
        setDataMode("live");
        setDataMessage(null);
      } catch {
        if (!cancelled && dashboardLoadVersion.current === requestVersion) {
          setDataMode("error");
          setDataMessage(readOnly
            ? publicView ? "The public dashboard could not be loaded. Try again later." : "The read-only dashboard could not be loaded. Try again later."
            : "Your saved log is unavailable. Try again later.");
        }
      } finally {
        if (dashboardLoadVersion.current === requestVersion) {
          dashboardLoadInFlight.current = false;
          setDashboardLoading(false);
        }
      }
    }
    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [dashboardReloadKey, publicView, readOnly]);

  useEffect(() => {
    function syncSectionFromHash() {
      const section = window.location.hash.slice(1);
      if (
        section === "today"
        || section === "meals"
        || section === "trend"
        || section === "macros"
        || section === "nutrition"
      ) {
        setActiveSection(section);
      } else {
        setActiveSection("today");
      }
    }

    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  useEffect(() => {
    if (!previewMeal) return;
    const previousFocus = document.activeElement;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewMeal(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    previewCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [previewMeal]);

  function handleMealPointerDown(mealId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    mealSwipeRef.current = {
      mealId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finishMealPointer(mealId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    const swipe = mealSwipeRef.current;
    if (!swipe || swipe.mealId !== mealId || swipe.pointerId !== event.pointerId) return;
    mealSwipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const action = getMealSwipeAction({
      deltaX: event.clientX - swipe.startX,
      deltaY: event.clientY - swipe.startY,
    });
    if (action === "open") setOpenMealId(mealId);
    if (action === "close") setOpenMealId(null);
  }

  function cancelMealPointer(mealId: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    const swipe = mealSwipeRef.current;
    if (!swipe || swipe.mealId !== mealId || swipe.pointerId !== event.pointerId) return;
    mealSwipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function markPhotoUnavailable(photoUrl: string) {
    setFailedPhotoUrls((current) => {
      if (current.has(photoUrl)) return current;
      const next = new Set(current);
      next.add(photoUrl);
      return next;
    });
  }

  function updateMeal(mealId: string, changes: Partial<Meal>) {
    if (readOnly || pendingActionRef.current) return;
    setDays((currentDays) =>
      currentDays.map((day) => {
        if (day.key !== selectedDayKey) return day;
        const nextMeals = day.meals.map((meal) => {
          if (meal.id !== mealId) return meal;
          const nextMeal = { ...meal, ...changes };
          if (meal.items.length === 0) return nextMeal;

          const totalFields: Array<[keyof Meal, keyof NutritionItem]> = [
            ["calories", "calories"],
            ["protein", "proteinG"],
            ["carbs", "carbsG"],
            ["fat", "fatG"],
          ];
          const nextItems = meal.items.map((item, index) => {
            if (index !== 0) return item;
            const nextItem = { ...item };
            for (const [mealKey, itemKey] of totalFields) {
              const changedValue = changes[mealKey];
              if (typeof changedValue !== "number") continue;
              const otherItemsTotal = meal.items.slice(1).reduce((total, other) => total + (typeof other[itemKey] === "number" ? other[itemKey] as number : 0), 0);
            (nextItem as Record<string, unknown>)[itemKey] = Math.max(0, changedValue - otherItemsTotal);
            }
            if (typeof changes.name === "string") nextItem.name = changes.name;
            return nextItem;
          });
          return { ...nextMeal, items: nextItems };
        });
        return dayWithMeals(day, nextMeals);
      }),
    );
  }

  function updateMealItem(mealId: string, itemId: string | undefined, itemIndex: number, key: string, value: number | null) {
    if (readOnly || pendingActionRef.current) return;
    setDays((currentDays) => currentDays.map((day) => {
      if (day.key !== selectedDayKey) return day;
      const meals = day.meals.map((meal) => {
        if (meal.id !== mealId) return meal;
        const items = meal.items.map((item, index) => {
          if ((itemId && item.id !== itemId) || (!itemId && index !== itemIndex)) return item;
          const nutrients = { ...(item.nutrients ?? {}), [key]: value };
          return { ...item, nutrients };
        });
        return { ...meal, items };
      });
      return dayWithMeals(day, meals);
    }));
  }

  function replaceRemoteMeal(remoteMeal: SerializedMeal) {
    const nextMeal = mapRemoteMeal(remoteMeal, { publicView });
    const date = dateKeyFromTimestamp(remoteMeal.consumedAt, { mode: publicView ? "utc" : "local" });
    setDays((currentDays) => currentDays.map((day) => {
      if (day.date !== date) return day;
      const meals = day.meals.some((meal) => meal.id === nextMeal.id)
        ? day.meals.map((meal) => meal.id === nextMeal.id ? nextMeal : meal)
        : [...day.meals, nextMeal];
      return dayWithMeals(day, meals);
    }));
  }

  function addMealToDate(logicalDate: string, meal: Meal) {
    setDays((currentDays) => currentDays.map((day) => (
      day.date === logicalDate ? dayWithMeals(day, [...day.meals, meal]) : day
    )));
  }

  function reconcileMeal(optimisticId: string, remoteMeal: SerializedMeal) {
    const nextMeal = mapRemoteMeal(remoteMeal, { publicView });
    const date = dateKeyFromTimestamp(remoteMeal.consumedAt, { mode: publicView ? "utc" : "local" });
    setDays((currentDays) => currentDays.map((day) => {
      const withoutOptimistic = day.meals.filter((meal) => meal.id !== optimisticId && meal.id !== nextMeal.id);
      if (day.date !== date) {
        return withoutOptimistic.length === day.meals.length ? day : dayWithMeals(day, withoutOptimistic);
      }
      return dayWithMeals(day, [...withoutOptimistic, nextMeal]);
    }));
  }

  function removeMealFromDays(mealId: string) {
    setDays((currentDays) => currentDays.map((day) => {
      const meals = day.meals.filter((meal) => meal.id !== mealId);
      if (meals.length === day.meals.length) return day;
      return dayWithMeals(day, meals);
    }));
  }

  async function saveMeal(mealId: string) {
    if (readOnly || dataMode !== "live" || mealSaveInFlight.current.has(mealId)) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    if (!meal) return;
    const action = beginAction("meal-save", mealId);
    if (!action) return;
    mealSaveInFlight.current.add(mealId);
    setActionError(null);
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(meal.id)}`, {
        method: "PATCH",
        ...mealRequestOptions(mealPayload(meal), mealPhotoDrafts[mealId]),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be saved."));
      }
      const parsedMeal = parseMealResponse(responseBody);
      if (!parsedMeal) throw new Error("The saved meal response was invalid.");
      if (!isCurrentAction(action)) return;
      replaceRemoteMeal(parsedMeal);
      setEditingMealId(null);
      setMealPhotoDrafts((current) => {
        const next = { ...current };
        delete next[mealId];
        return next;
      });
      setActionStatus("Meal saved.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setActionError(error instanceof Error ? error.message : "The meal could not be saved.");
      setActionStatus(null);
    } finally {
      mealSaveInFlight.current.delete(mealId);
      finishAction(action);
    }
  }

  async function deleteMeal(mealId: string) {
    if (readOnly || dataMode !== "live") return;
    if (mealDeleteInFlight.current) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    if (!meal) return;
    if (!window.confirm(`Delete "${meal.name}"? This removes the meal and its analysis data. This cannot be undone.`)) return;

    const action = beginAction("meal-delete", mealId);
    if (!action) return;
    mealDeleteInFlight.current = mealId;
    setOpenMealId(null);
    setDeletingMealId(mealId);
    setActionError(null);
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "DELETE" });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be deleted."));
      }
      if (!isCurrentAction(action)) return;
      removeMealFromDays(mealId);
      setEditingMealId(null);
      const result = asRecord(responseBody);
      setActionStatus(result?.photoDeleted === false
        ? "Meal deleted. Its photo could not be removed."
        : "Meal deleted.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setActionError(error instanceof Error ? error.message : "The meal could not be deleted.");
      setActionStatus(null);
    } finally {
      mealDeleteInFlight.current = null;
      setDeletingMealId(null);
      finishAction(action);
    }
  }

  async function copyMealToToday(mealId: string) {
    if (readOnly || dataMode !== "live" || mealCopyInFlight.current) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    const today = days.at(-1);
    if (!meal || !today || selectedDay.date === today.date) return;

    const action = beginAction("meal-copy", mealId);
    if (!action) return;
    mealCopyInFlight.current = mealId;
    setCopyingMealId(mealId);
    setOpenMealId(null);
    setActionError(null);
    const consumedAt = mealDateTimestamp({ date: today.date, time: localTimeValue() }) ?? Date.now();
    const optimisticMeal: Meal = {
      ...meal,
      id: `optimistic-copy-${action.token}`,
      time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(consumedAt)),
      pending: "copying",
    };
    addMealToDate(today.date, optimisticMeal);
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumedAt }),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be copied."));
      }
      const parsedMeal = parseMealResponse(responseBody);
      if (!parsedMeal) throw new Error("The copied meal response was invalid.");
      if (!isCurrentAction(action)) return;
      reconcileMeal(optimisticMeal.id, parsedMeal);
      setActionStatus(`Copied “${meal.name}” to today.`);
    } catch (error) {
      if (!isCurrentAction(action)) return;
      removeMealFromDays(optimisticMeal.id);
      setActionError(error instanceof Error ? error.message : "The meal could not be copied.");
      setActionStatus(null);
    } finally {
      mealCopyInFlight.current = null;
      setCopyingMealId(null);
      finishAction(action);
    }
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    if (readOnly || dataMode !== "live") return;
    event.preventDefault();
    if (mealCreateInFlight.current) return;
    setActionError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const photoEntry = form.get("photo");
    const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
    if (photo) {
      const photoError = mealPhotoError(photo);
      if (photoError) {
        setActionError(photoError);
        return;
      }
    }
    const name = String(form.get("name") || "New meal").trim();
    const description = String(form.get("description") || "Added from dashboard").trim();
    const calories = Number(form.get("calories") || 0);
    const protein = Number(form.get("protein") || 0);
    const carbs = Number(form.get("carbs") || 0);
    const fat = Number(form.get("fat") || 0);
    const nutrients = nutrientValuesFromForm(form);
    const time = String(form.get("time") || "");
    const consumedAt = mealDateTimestamp({ date: selectedDay.date, time });
    if (consumedAt === null) {
      setActionError("Enter a valid meal time.");
      setActionStatus(null);
      return;
    }
    const action = beginAction("meal-create");
    if (!action) return;
    mealCreateInFlight.current = true;
    const nextMeal: Meal = {
      id: `optimistic-meal-${action.token}`,
      time,
      name,
      description,
      calories,
      protein,
      carbs,
      fat,
      items: [{
        name,
        quantity: 1,
        unit: "serving",
        calories,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
        nutrients,
        source: "dashboard",
      }],
      pending: "creating",
      kind: "snack",
    };

    setActionError(null);
    addMealToDate(selectedDay.date, nextMeal);
    try {
      const response = await fetch("/api/meals", {
        method: "POST",
        ...mealRequestOptions(mealPayload(nextMeal, consumedAt), photo),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be added."));
      }
      const parsedMeal = parseMealResponse(responseBody);
      if (!parsedMeal) throw new Error("The added meal response was invalid.");
      if (!isCurrentAction(action)) return;
      reconcileMeal(nextMeal.id, parsedMeal);
      setActionStatus("Meal added.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      removeMealFromDays(nextMeal.id);
      setActionError(error instanceof Error ? error.message : "The meal could not be added.");
      setActionStatus(null);
      return;
    } finally {
      mealCreateInFlight.current = false;
      finishAction(action);
    }

    setShowAddMeal(false);
    formElement.reset();
  }

  function setWeightForDate(logicalDate: string, weight: DailyWeight | null) {
    setDays((currentDays) => currentDays.map((day) => (
      day.date === logicalDate ? { ...day, weight } : day
    )));
  }

  function openWeightEditor() {
    if (readOnly || dataMode !== "live" || pendingActionRef.current) return;
    setWeightDraft(selectedWeight ? String(selectedWeight.weightKg) : "");
    setShowWeightForm(true);
    setActionError(null);
  }

  async function saveWeight(event: FormEvent<HTMLFormElement>) {
    if (readOnly || dataMode !== "live") return;
    event.preventDefault();
    if (weightSaveInFlight.current) return;
    const weightKg = Number(weightDraft);
    if (!Number.isFinite(weightKg) || weightKg < 1 || weightKg > 1_000) {
      setActionError("Enter a weight between 1 and 1,000 kg.");
      return;
    }

    const logicalDate = selectedDay.date;
    const previousWeight = selectedWeight;
    const optimisticWeight = { logicalDate, weightKg, recordedAt: Date.now() };
    const action = beginAction("weight-save", logicalDate);
    if (!action) return;
    weightSaveInFlight.current = true;
    setWeightSaving(true);
    setActionError(null);
    setWeightForDate(logicalDate, optimisticWeight);

    try {
      const response = await fetch("/api/weights", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logicalDate, weightKg }),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The weight could not be saved."));
      }
      const savedWeight = parseWeightResponse(responseBody);
      if (!savedWeight) throw new Error("The saved weight response was invalid.");
      if (!isCurrentAction(action)) return;

      setWeightForDate(logicalDate, savedWeight);
      setWeightDraft(String(savedWeight.weightKg));
      setShowWeightForm(false);
      setActionStatus("Weight saved.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setWeightForDate(logicalDate, previousWeight);
      setActionError(error instanceof Error ? error.message : "The weight could not be saved.");
      setActionStatus(null);
    } finally {
      weightSaveInFlight.current = false;
      setWeightSaving(false);
      finishAction(action);
    }
  }

  async function openSettings() {
    if (readOnly || dataMode !== "live" || settingsLoadInFlight.current) return;
    const action = beginAction("settings-load");
    if (!action) return;
    const readVersion = settingsReadVersion.current + 1;
    settingsReadVersion.current = readVersion;
    settingsLoadInFlight.current = true;
    setSettingsDraft(settingsDraftForTargets(targets));
    setShowSettings(true);
    setActionError(null);
    setActionStatus(null);
    setSettingsLoading(true);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401 || response.status === 503) return;
        throw new Error("The current targets could not be loaded.");
      }
      const parsed = parseSettingsTargets(await response.json());
      if (!parsed || settingsReadVersion.current !== readVersion || settingsSaveInFlight.current || !isCurrentAction(action)) return;
      const nextTargets = {
        calories: Number.isFinite(parsed.calories) ? parsed.calories : activeCalorieTarget,
        proteinG: Number.isFinite(parsed.proteinG) ? parsed.proteinG : activeProteinTarget,
        nutrients: parsed.nutrients,
      };
      setTargets(nextTargets);
      setSettingsDraft(settingsDraftForTargets(nextTargets));
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setActionError(error instanceof Error ? error.message : "The current targets could not be loaded.");
    } finally {
      settingsLoadInFlight.current = false;
      setSettingsLoading(false);
      finishAction(action);
    }
  }

  async function saveSettings() {
    if (readOnly || dataMode !== "live") return;
    if (settingsSaveInFlight.current) return;
    const calories = Number(settingsDraft.calories);
    const proteinG = Number(settingsDraft.proteinG);
    if (!Number.isFinite(calories) || calories < 1 || !Number.isFinite(proteinG) || proteinG < 1) {
      setActionError("Enter calorie and protein targets greater than zero.");
      return;
    }
    const invalidNutrientGoal = Object.entries(settingsDraft.nutrients).find(([, value]) => {
      if (!value.trim()) return false;
      const parsed = Number(value);
      return !Number.isFinite(parsed) || parsed <= 0;
    });
    if (invalidNutrientGoal) {
      setActionError("Nutrition goals must be greater than zero or left blank.");
      return;
    }
    const nutrientTargetOverrides = nutrientGoalOverridesFromDraft(settingsDraft.nutrients);
    const nutrientTargets = resolveNutrientGoals(nutrientTargetOverrides);

    const action = beginAction("settings-save");
    if (!action) return;
    const previousTargets = targets;
    setActionError(null);
    settingsReadVersion.current += 1;
    settingsSaveInFlight.current = true;
    setSettingsSaving(true);
    setTargets({ calories, proteinG, nutrients: nutrientTargets });
    try {
      let nextTargets = { calories, proteinG, nutrients: nutrientTargets };
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailyCalorieTarget: calories, dailyProteinTargetG: proteinG, nutrientTargets: nutrientTargetOverrides }),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The targets could not be saved."));
      }
      const parsed = parseSettingsTargets(responseBody);
      if (parsed && Number.isFinite(parsed.calories) && Number.isFinite(parsed.proteinG)) {
        nextTargets = { calories: parsed.calories, proteinG: parsed.proteinG, nutrients: parsed.nutrients };
      }
      if (!isCurrentAction(action)) return;
      setTargets(nextTargets);
      setSettingsDraft(settingsDraftForTargets(nextTargets));
      setShowSettings(false);
      setActionStatus("Targets saved.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setTargets(previousTargets);
      setActionError(error instanceof Error ? error.message : "The targets could not be saved.");
      setActionStatus(null);
    } finally {
      settingsSaveInFlight.current = false;
      setSettingsSaving(false);
      finishAction(action);
    }
  }

  function selectDay(key: DayKey) {
    if (pendingActionRef.current) return;
    setSelectedDayKey(key);
    setEditingMealId(null);
    setShowAddMeal(false);
    setShowWeightForm(false);
  }

  function moveSelectedDay(direction: "previous" | "next") {
    const nextKey = getAdjacentDayKey(days, selectedDayKey, direction);
    if (nextKey) selectDay(nextKey as DayKey);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#today" aria-label={readOnly ? "Calocount public view" : "Calocount home"}>
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>calocount</span>
        </a>
        <div className="topbar-actions">
          <span className="sync-status"><span className="status-dot" aria-hidden="true" /> {readOnly ? "Public read-only" : dataMode === "live" ? "Live data" : dataMode === "loading" ? "Loading" : "Unavailable"}</span>
          {!readOnly && dataMode === "live" ? <>
            <button className="icon-button" type="button" onClick={() => void openSettings()} disabled={actionInProgress || settingsLoading || settingsSaving} aria-label="Open settings" aria-expanded={showSettings} aria-controls="settings-panel" aria-busy={settingsLoadPending}><span aria-hidden="true">{settingsLoadPending ? "…" : "⚙"}</span></button>
          </> : null}
          <span className="avatar" aria-label={readOnly ? "Public read-only view" : "Account"}><span aria-hidden="true">{readOnly ? "↗" : "M"}</span></span>
        </div>
      </header>

      {!readOnly && dataMode === "live" && showSettings ? <section className={`settings-panel${settingsLoadPending || settingsSavePending ? " is-pending" : ""}`} id="settings-panel" role="dialog" aria-labelledby="settings-title" aria-busy={settingsLoadPending || settingsSavePending}>
        <div className="settings-heading"><div><p className="eyebrow">Personal targets</p><h2 id="settings-title">Daily targets</h2></div><button className="close-button" type="button" disabled={settingsLoading || settingsSaving} onClick={() => setShowSettings(false)} aria-label="Close settings">×</button></div>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <section className="settings-section primary-goal-settings" aria-labelledby="primary-goals-title">
            <div className="settings-section-heading"><div><strong id="primary-goals-title">Primary goals</strong><span>Your main energy and protein targets</span></div></div>
            <div className="primary-goal-grid">
              <label>Calories<input name="daily-calorie-target" type="number" min="10" max="100000" step="10" value={settingsDraft.calories} onChange={(event) => setSettingsDraft((current) => ({ ...current, calories: event.target.value }))} disabled={settingsLoading || settingsSaving} required /></label>
              <label>Protein (g)<input name="daily-protein-target" type="number" min="1" max="10000" step="1" value={settingsDraft.proteinG} onChange={(event) => setSettingsDraft((current) => ({ ...current, proteinG: event.target.value }))} disabled={settingsLoading || settingsSaving} required /></label>
            </div>
          </section>
          <NutrientGoalSettings
            values={settingsDraft.nutrients}
            disabled={settingsLoading || settingsSaving}
            onChange={(key: NutrientKey, value: string) => setSettingsDraft((current) => ({
              ...current,
              nutrients: { ...current.nutrients, [key]: value },
            }))}
            onReset={() => setSettingsDraft((current) => ({ ...current, nutrients: nutrientGoalDraftFromMap(defaultNutrientTargets) }))}
          />
          <button className="save-button settings-save-button" type="submit" disabled={settingsLoading || settingsSaving} aria-busy={settingsSavePending}>{settingsSavePending ? "Saving…" : settingsLoading ? "Loading…" : "Save targets"}</button>
        </form>
        <p className="settings-help" role="status" aria-live="polite">{settingsLoading ? "Loading saved targets…" : settingsSaving ? "Saving targets…" : "Targets guide the rings, nutrient progress, trend lines, and daily nudge."}</p>
      </section> : null}

      {dataMessage ? <div className={`data-banner ${dataMode}`} role="status"><span aria-hidden="true">{dataMode === "live" ? "✓" : dataMode === "loading" ? "…" : "i"}</span>{dataMessage}</div> : null}
      {readOnly && dataMode === "live" ? <div className="data-banner public" role="status"><span aria-hidden="true">✓</span>Public read-only view — changes are disabled.</div> : null}
      {pendingLabel || actionStatus || actionError ? <div className={`action-feedback ${actionError ? "error" : ""}`} role={actionError ? "alert" : "status"} aria-live="polite" aria-busy={actionInProgress}>{actionError ?? pendingLabel ?? actionStatus}</div> : null}

      {dataMode !== "live" ? <section className="dashboard-state" aria-live="polite">
        <span className="dashboard-state-mark" aria-hidden="true">{dataMode === "loading" ? "…" : "!"}</span>
        <h1>{dataMode === "loading"
          ? publicView ? "Loading public dashboard" : "Loading your saved log"
          : publicView ? "Public dashboard unavailable" : "Your dashboard is unavailable"}</h1>
        <p>{dataMessage ?? (publicView
          ? "The public dashboard could not be loaded."
          : "Your saved log is unavailable. Try again later.")}</p>
        {dataMode === "error" ? <button className="primary-button" type="button" onClick={retryDashboard} disabled={dashboardLoading} aria-busy={dashboardLoading}>{dashboardLoading ? "Loading…" : "Try again"}</button> : null}
      </section> : <>
      <section className="date-strip" aria-label="Choose a day">
        <div className="date-heading">
          <p className="eyebrow">Your log</p>
          <h1 id="today">{selectedDay.weekday}, {fullDateLabel(selectedDay.date)}</h1>
        </div>
        <div className="date-controls">
          <button className="date-arrow" type="button" onClick={() => moveSelectedDay("previous")} aria-label="Previous day" disabled={actionInProgress || !previousDayKey}>‹</button>
          <div className="date-pills">
            {days.map((day) => (
              <button
                className={`date-pill ${selectedDayKey === day.key ? "active" : ""}`}
                key={day.key}
                type="button"
                onClick={() => selectDay(day.key)}
                disabled={actionInProgress}
                aria-label={`${day.weekday}, ${fullDateLabel(day.date)}`}
                aria-pressed={selectedDayKey === day.key}
              >
                <span>{dayLabels[day.key]}</span><strong>{day.shortDate}</strong>
              </button>
            ))}
          </div>
          <button className="date-arrow" type="button" onClick={() => moveSelectedDay("next")} aria-label="Next day" disabled={actionInProgress || !nextDayKey}>›</button>
        </div>
      </section>

      <nav className="jump-nav" aria-label="Dashboard sections">
        <a className={activeSection === "today" ? "active" : ""} href="#today" aria-current={activeSection === "today" ? "page" : undefined}>Today</a>
        <a className={activeSection === "meals" ? "active" : ""} href="#meals" aria-current={activeSection === "meals" ? "page" : undefined}>Meals</a>
        <a className={activeSection === "trend" ? "active" : ""} href="#trend" aria-current={activeSection === "trend" ? "page" : undefined}>Trend</a>
        <a className={activeSection === "macros" ? "active" : ""} href="#macros" aria-current={activeSection === "macros" ? "page" : undefined}>Macros</a>
        <a className={activeSection === "nutrition" ? "active" : ""} href="#nutrition" aria-current={activeSection === "nutrition" ? "page" : undefined}>Nutrition</a>
      </nav>

      <section className="summary-grid" aria-label="Daily calorie and protein summary">
        <article className="summary-card calories-card">
          <div className="summary-copy">
            <div className="card-label-row"><span className="metric-dot calorie-dot" aria-hidden="true" /><span className="card-label">Calories</span></div>
            <p className="metric-value">{formatNumber(totalCalories)} <span>/ {formatNumber(activeCalorieTarget)}</span></p>
            <p className={`metric-subtitle ${remainingCalories < 0 ? "over" : ""}`}>
              {remainingCalories >= 0 ? `${formatNumber(remainingCalories)} kcal left today` : `${formatNumber(Math.abs(remainingCalories))} kcal over target`}
            </p>
          </div>
          <div className="metric-ring calorie-ring" style={{ "--progress": `${calculateTargetPercent(totalCalories, activeCalorieTarget)}%` } as CSSProperties} aria-label={`${calculateTargetPercent(totalCalories, activeCalorieTarget)} percent of calorie target`} role="img"><strong>{calculateTargetPercent(totalCalories, activeCalorieTarget)}%</strong></div>
        </article>

        <article className="summary-card protein-card">
          <div className="summary-copy">
            <div className="card-label-row"><span className="metric-dot protein-dot" aria-hidden="true" /><span className="card-label">Protein</span></div>
            <p className="metric-value">{formatNumber(totalProtein)}g <span>/ {activeProteinTarget}g</span></p>
            <p className="metric-subtitle">{remainingProtein >= 0 ? `${formatNumber(remainingProtein)}g left to reach your target` : `${formatNumber(Math.abs(remainingProtein))}g above target`}</p>
          </div>
          <div className="metric-ring protein-ring" style={{ "--progress": `${calculateTargetPercent(totalProtein, activeProteinTarget)}%` } as CSSProperties} aria-label={`${calculateTargetPercent(totalProtein, activeProteinTarget)} percent of protein target`} role="img"><strong>{calculateTargetPercent(totalProtein, activeProteinTarget)}%</strong></div>
        </article>

        <article className="summary-card average-card">
          <div>
            <div className="card-label-row"><span className="metric-dot average-dot" aria-hidden="true" /><span className="card-label">7 day average</span></div>
            <p className="metric-value">{formatNumber(averageCalories)} <span>kcal</span></p>
            <p className={`metric-subtitle ${averageComparison.direction === "above" ? "over" : "positive"}`}>
              {averageComparison.direction === "at"
                ? "At your target average"
                : <><span aria-hidden="true">{averageComparison.direction === "below" ? "↘" : "↗"}</span> {averageComparison.percentage}% {averageComparison.direction} your target</>}
            </p>
          </div>
          <div className="mini-bars" aria-hidden="true">{chartValues.map((day) => <span key={day.label} style={{ height: `${Math.max(22, (day.value / 2600) * 100)}%` }} />)}</div>
        </article>
      </section>

      <div className="content-grid">
        <section className="primary-column">
          <section className="panel chart-panel" id="trend" aria-labelledby="trend-title">
            <div className="panel-heading">
              <div><p className="eyebrow">A quick view</p><h2 id="trend-title">Calorie trend</h2></div>
              <span className="chart-range">Past 7 days</span>
            </div>
            <div className="chart-legend"><span><i className="legend-swatch calorie-swatch" /> Calories</span><span><i className="legend-line" /> Target {formatNumber(activeCalorieTarget)}</span></div>
            <div className="bar-chart" role="img" aria-label={`Calorie intake for the past seven days compared with a ${activeCalorieTarget} calorie target`}>
              <div className="chart-y-axis" aria-hidden="true">{chartScale.tickValues.map((value) => <span key={value}>{formatChartTick(value)}</span>)}</div>
              <div className="chart-plot">
                <div className="target-line" style={{ top: `${chartScale.targetLineTopPercent}%` }}><span>{formatNumber(activeCalorieTarget)}</span></div><div className="grid-line line-one" /><div className="grid-line line-two" /><div className="grid-line line-three" />
                <div className="bars">{chartValues.map((day, index) => <div className="bar-column" key={day.label}><div className="bar-value">{day.value.toLocaleString()}</div><div className="bar" style={{ height: `${Math.max(12, chartScale.valueHeightPercents[index] ?? 0)}%` }} /><span>{day.label}</span></div>)}</div>
              </div>
            </div>
          </section>

          <section className="panel chart-panel weight-trend-panel" aria-labelledby="weight-trend-title">
            <div className="panel-heading">
              <div><p className="eyebrow">A quick view</p><h2 id="weight-trend-title">Weight trend</h2></div>
              <span className="chart-range">Past 7 days</span>
            </div>
            {hasWeightData ? <>
              <div className="chart-legend"><span><i className="legend-swatch weight-swatch" /> Weight (kg)</span></div>
              <div className="bar-chart weight-chart" role="img" aria-label="Recorded weight for the past seven days in kilograms; missing days are shown as gaps">
                <div className="chart-y-axis" aria-hidden="true">{weightChartScale.tickValues.map((value) => <span key={value}>{formatWeight(value)}</span>)}</div>
                <div className="chart-plot">
                  <div className="grid-line line-one" /><div className="grid-line line-two" /><div className="grid-line line-three" />
                  <div className="bars weight-bars">{weightChartValues.map((day, index) => <div className={`bar-column weight-column${day.value === null ? " missing" : ""}`} key={day.label}>
                    {day.value === null ? <span className="weight-gap" aria-hidden="true">—</span> : <>
                      <div className="bar-value">{formatWeight(day.value)} kg</div>
                      <div className="bar weight-bar" style={{ height: `${Math.max(8, weightChartScale.valueHeightPercents[index] ?? 0)}%` }} />
                    </>}
                    <span>{day.label}</span>
                  </div>)}</div>
                </div>
              </div>
            </> : <div className="chart-empty" role="status"><strong>No weight records for the past seven days</strong><span>Record a daily weight to see your trend.</span></div>}
          </section>

          <section className="panel chart-panel macro-trend-panel" aria-labelledby="macro-trend-title">
            <div className="panel-heading">
              <div><p className="eyebrow">A quick view</p><h2 id="macro-trend-title">Macros trend</h2></div>
              <span className="chart-range">Past 7 days</span>
            </div>
            {hasMacroTrendData ? <>
              <div className="chart-legend macro-trend-legend">
                <span><i className="legend-swatch macro-carbs-swatch" /> Carbs</span>
                <span><i className="legend-swatch macro-protein-swatch" /> Protein</span>
                <span><i className="legend-swatch macro-fat-swatch" /> Fat</span>
              </div>
              <div className="macro-trend-chart" role="group" aria-label="Calorie-weighted carbohydrate, protein, and fat split for the past seven days; days without macro data are shown as gaps">
                <div className="macro-trend-y-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
                <div className="macro-trend-plot">
                  <div className="macro-mid-line" aria-hidden="true" />
                  <div className="macro-trend-bars">{macroTrendValues.map((day) => <div
                    className={`macro-trend-column${day.hasData ? "" : " missing"}`}
                    key={day.date}
                    role="img"
                    aria-label={day.hasData
                      ? `${day.label}: ${day.percentages.carbs}% carbohydrates, ${day.percentages.protein}% protein, ${day.percentages.fat}% fat`
                      : `${day.label}: no macro data`}
                  >
                    <div className="macro-stack" title={day.hasData ? `${day.percentages.carbs}% carbs · ${day.percentages.protein}% protein · ${day.percentages.fat}% fat` : "No macro data"}>
                      {day.hasData ? <>
                        <span className="macro-segment fat" style={{ height: `${day.percentages.fat}%` }} />
                        <span className="macro-segment protein" style={{ height: `${day.percentages.protein}%` }} />
                        <span className="macro-segment carbs" style={{ height: `${day.percentages.carbs}%` }} />
                      </> : <span className="macro-gap" aria-hidden="true">—</span>}
                    </div>
                    <span>{day.label}</span>
                  </div>)}</div>
                </div>
              </div>
            </> : <div className="chart-empty" role="status"><strong>No macro records for the past seven days</strong><span>Add protein, carbs, or fat to a meal to see the daily split.</span></div>}
          </section>

          <NutritionOverview values={selectedDay.nutrients} carbsG={selectedDay.carbs} fatG={selectedDay.fat} goals={targets.nutrients} />
          <NutrientTrendPanel byDate={days.map((day) => ({ date: day.date, nutrients: day.nutrients ?? {} }))} goals={targets.nutrients} />

          <section className="panel weight-panel" aria-labelledby="weight-title">
            <div className="panel-heading weight-heading">
              <div><p className="eyebrow">Daily check-in</p><h2 id="weight-title">Weight</h2></div>
              {!readOnly ? <button
                className="primary-button"
                type="button"
                disabled={actionInProgress || weightSaving}
                aria-busy={weightActionPending}
                onClick={openWeightEditor}
              >
                {weightActionPending ? "Saving…" : selectedWeight ? "Edit weight" : "Add weight"}
              </button> : <span className="panel-meta">read only</span>}
            </div>
            <div className={`weight-reading${selectedWeight ? "" : " empty"}${weightActionPending ? " is-pending" : ""}`} aria-busy={weightActionPending}>
              {selectedWeight ? <>
                <strong>{formatWeight(selectedWeight.weightKg)} <small>kg</small></strong>
                <time dateTime={new Date(selectedWeight.recordedAt).toISOString()}>
                  Saved at {formatRecordedTime(selectedWeight.recordedAt)}
                </time>
                {weightActionPending ? <span className="pending-indicator" role="status">Saving…</span> : null}
              </> : <>
                <strong>No weight recorded</strong>
                <span>Add one value for {selectedDay.weekday}.</span>
                {weightActionPending ? <span className="pending-indicator" role="status">Saving…</span> : null}
              </>}
            </div>
            {!readOnly && showWeightForm ? <form className="weight-form" onSubmit={saveWeight} aria-busy={weightActionPending}>
              <label>
                Weight (kg)
                <input
                  name="weightKg"
                  type="number"
                  min="1"
                  max="1000"
                  step="0.1"
                  inputMode="decimal"
                  value={weightDraft}
                  onChange={(event) => setWeightDraft(event.target.value)}
                  disabled={weightSaving || actionInProgress}
                  required
                />
              </label>
              <button className="save-button" type="submit" disabled={weightSaving || actionInProgress} aria-busy={weightActionPending}>
                {weightSaving ? "Saving…" : selectedWeight ? "Save changes" : "Save weight"}
              </button>
              <button
                className="cancel-button"
                type="button"
                disabled={weightSaving || actionInProgress}
                onClick={() => setShowWeightForm(false)}
              >
                Cancel
              </button>
            </form> : null}
          </section>

          <section className="panel meals-panel" id="meals" aria-labelledby="meals-title">
            <div className="panel-heading meal-heading"><div><p className="eyebrow">What you ate</p><h2 id="meals-title">Meals <span>{selectedDay.meals.length}</span></h2></div>{!readOnly ? <button className="primary-button" type="button" disabled={actionInProgress} aria-busy={pendingAction?.kind === "meal-create"} onClick={() => setShowAddMeal((current) => !current)}><span aria-hidden="true">＋</span> {pendingAction?.kind === "meal-create" ? "Saving…" : "Add meal"}</button> : <span className="panel-meta">read only</span>}</div>

            {!readOnly && showAddMeal ? <form className={`add-meal-form${pendingAction?.kind === "meal-create" ? " is-pending" : ""}`} onSubmit={addMeal} aria-busy={pendingAction?.kind === "meal-create"}>
              <div className="form-heading"><div><strong>Log a meal</strong><span>Use a quick estimate now. You can edit it later.</span></div><label>Time<input name="time" type="time" defaultValue={localTimeValue()} required aria-label="Meal time" disabled={actionInProgress} /></label><button className="close-button" type="button" disabled={actionInProgress} onClick={() => setShowAddMeal(false)} aria-label="Close add meal form">×</button></div>
              <label>Meal name<input name="name" placeholder="e.g. Turkey sandwich" required disabled={actionInProgress} /></label>
              <label className="wide-field">Description<input name="description" placeholder="Ingredients or a short note" disabled={actionInProgress} /></label>
              <label>Calories<input name="calories" type="number" min="0" step="any" placeholder="450" required disabled={actionInProgress} /></label>
              <label>Protein (g)<input name="protein" type="number" min="0" step="any" placeholder="30" disabled={actionInProgress} /></label>
              <label>Carbs (g)<input name="carbs" type="number" min="0" step="any" placeholder="45" disabled={actionInProgress} /></label>
              <label>Fat (g)<input name="fat" type="number" min="0" step="any" placeholder="15" disabled={actionInProgress} /></label>
              <MealNutritionEditor namePrefix="nutrient-" disabled={actionInProgress} />
              <label className="meal-photo-field">Photo (optional)<input name="photo" type="file" accept={mealPhotoAccept} disabled={actionInProgress} /><small>JPEG, PNG, or WebP · up to 10 MB</small></label>
              <button className="save-button" type="submit" disabled={actionInProgress} aria-busy={pendingAction?.kind === "meal-create"}>{pendingAction?.kind === "meal-create" ? "Saving…" : "Save meal"}</button>
            </form> : null}

            {selectedDay.meals.length > 0 ? <div className="meal-list">
              <div className="meal-list-head" aria-hidden="true"><span /><span>Meal</span><span>Energy</span><span>Protein</span><span>Carbs</span><span>Fat</span><span /></div>
              {selectedDay.meals.map((meal) => <div className="meal-group" key={meal.id}>
                <div className={`meal-row${openMealId === meal.id ? " is-actions-open" : ""}${selectedDay.date !== days.at(-1)?.date ? " has-copy-action" : ""}${meal.pending || pendingAction?.id === meal.id ? " is-pending" : ""}`} aria-busy={Boolean(meal.pending || pendingAction?.id === meal.id)}>
                  <div
                    className="meal-row-content"
                    onPointerDown={(event) => handleMealPointerDown(meal.id, event)}
                    onPointerUp={(event) => finishMealPointer(meal.id, event)}
                    onPointerCancel={(event) => cancelMealPointer(meal.id, event)}
                  >
                    {meal.photoUrl && !failedPhotoUrls.has(meal.photoUrl) ? <button
                      className="meal-photo-button"
                      type="button"
                      aria-label={`View photo of ${meal.name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewMeal(meal);
                      }}
                    >
                      {/* Native images let the browser lazy-load private and public R2-backed routes. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="meal-photo"
                        src={meal.photoUrl}
                        alt={meal.name}
                        loading="lazy"
                        decoding="async"
                        onError={() => markPhotoUnavailable(meal.photoUrl as string)}
                      />
                    </button> : <div className={`meal-avatar ${meal.kind}`} aria-hidden="true">{mealPlaceholders[meal.kind]}</div>}
                    <div className="meal-info"><div className="meal-name-line"><strong>{meal.name}</strong><time>{meal.time}</time>{meal.pending === "creating" ? <span className="pending-indicator" role="status">Saving…</span> : null}{meal.pending === "copying" ? <span className="pending-indicator" role="status">Copying…</span> : null}{pendingAction?.kind === "meal-save" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Saving…</span> : null}{pendingAction?.kind === "meal-delete" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Deleting…</span> : null}{pendingAction?.kind === "meal-copy" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Copying…</span> : null}</div><span>{meal.description}</span></div>
                    <div className="meal-stat calories-stat" data-label="Energy">{formatNumber(meal.calories)} <small>kcal</small></div>
                    <div className="meal-stat protein-stat" data-label="Protein">{formatNumber(meal.protein)}<small>g</small></div>
                    <div className="meal-stat carbs-stat" data-label="Carbs">{formatNumber(meal.carbs ?? 0)}<small>g</small></div>
                    <div className="meal-stat fat-stat" data-label="Fat">{formatNumber(meal.fat ?? 0)}<small>g</small></div>
                  </div>
                  {!readOnly ? <button
                    className="meal-actions-toggle"
                    type="button"
                    aria-expanded={openMealId === meal.id}
                    aria-controls={`meal-actions-${meal.id}`}
                    aria-label={`${openMealId === meal.id ? "Close" : "Open"} actions for ${meal.name}`}
                    disabled={actionInProgress}
                    onClick={() => setOpenMealId((current) => current === meal.id ? null : meal.id)}
                  >
                    {openMealId === meal.id ? "×" : "⋯"}
                  </button> : null}
                  {!readOnly ? <div className="meal-actions" id={`meal-actions-${meal.id}`}>
                    {selectedDay.date !== days.at(-1)?.date ? <button className="copy-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null} onClick={() => void copyMealToToday(meal.id)} aria-label={`Copy ${meal.name} to today`} aria-busy={copyingMealId === meal.id}>{copyingMealId === meal.id ? "Copying…" : "Copy to today"}</button> : null}
                    <button className="edit-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null} onClick={() => {
                      const isClosing = editingMealId === meal.id;
                      setEditingMealId(isClosing ? null : meal.id);
                      if (isClosing) setMealPhotoDrafts((current) => {
                        const next = { ...current };
                        delete next[meal.id];
                        return next;
                      });
                    }} aria-expanded={editingMealId === meal.id} aria-label={`Edit ${meal.name}`}>Edit</button>
                    <button className="delete-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null} onClick={() => void deleteMeal(meal.id)} aria-label={`Delete ${meal.name}`} aria-busy={deletingMealId === meal.id}>{deletingMealId === meal.id ? "Deleting…" : "Delete"}</button>
                  </div> : null}
                </div>
                <MealNutritionDetails meal={meal} readOnly={readOnly} />
                {!readOnly && editingMealId === meal.id ? <div className="inline-editor">
                  <label>Name<input value={meal.name} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { name: event.target.value })} /></label>
                  <label className="editor-description-field">Description<input value={meal.description} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { description: event.target.value })} /></label>
                  <label>Calories<input type="number" min="0" step="any" value={meal.calories} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { calories: Number(event.target.value) })} /></label>
                  <label>Protein<input type="number" min="0" step="any" value={meal.protein} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { protein: Number(event.target.value) })} /></label>
                  <label>Carbs<input type="number" min="0" step="any" value={meal.carbs ?? 0} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { carbs: Number(event.target.value) })} /></label>
                  <label>Fat<input type="number" min="0" step="any" value={meal.fat ?? 0} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { fat: Number(event.target.value) })} /></label>
                  <label className="editor-photo-field">{meal.photoKey ? "Replace photo (optional)" : "Photo (optional)"}<input
                    type="file"
                    accept={mealPhotoAccept}
                    disabled={actionInProgress}
                    onChange={(event) => {
                      const photo = event.target.files?.[0] ?? null;
                      if (photo) {
                        const photoError = mealPhotoError(photo);
                        if (photoError) {
                          event.target.value = "";
                          setActionError(photoError);
                          return;
                        }
                      }
                      setActionError(null);
                      setMealPhotoDrafts((current) => ({ ...current, [meal.id]: photo }));
                    }}
                  /><small>{mealPhotoDrafts[meal.id]?.name ?? (meal.photoKey ? "Current photo stays unless you select a replacement." : "JPEG, PNG, or WebP · up to 10 MB")}</small></label>
                  <div className="meal-item-editors">
                    <div className="meal-item-editors-heading"><strong>Food item nutrition</strong><span>Values stay with each item in an AI meal.</span></div>
                    {meal.items.map((item, index) => <div className="meal-item-editor" key={item.id ?? `${meal.id}-item-${index}`}>
                      <div className="meal-item-editor-heading"><strong>{item.name}</strong><span>{item.quantity ?? 1}{item.unit ? ` ${item.unit}` : " serving"}</span></div>
                      <MealNutritionEditor
                        values={item.nutrients ?? {}}
                        onChange={(key, value) => updateMealItem(meal.id, item.id, index, key, value)}
                        idPrefix={`edit-${meal.id}-${item.id ?? index}-`}
                        namePrefix={`edit-${meal.id}-${item.id ?? index}-`}
                        disabled={actionInProgress}
                      />
                    </div>)}
                  </div>
                  <div className="editor-actions">
                    <button className="done-button" type="button" disabled={actionInProgress} aria-busy={pendingAction?.kind === "meal-save" && pendingAction.id === meal.id} onClick={() => void saveMeal(meal.id)}>{pendingAction?.kind === "meal-save" && pendingAction.id === meal.id ? "Saving…" : "Save changes"}</button>
                  </div>
                </div> : null}
              </div>)}
            </div> : <div className="empty-meals"><span className="empty-icon" aria-hidden="true">{readOnly ? "·" : "＋"}</span><strong>No meals logged for {selectedDay.weekday}</strong><span>{readOnly ? "No meals were logged for this day." : "Tap “Add meal” to record what you ate."}</span></div>}
            <div className="meal-total"><span>Total for {selectedDay.weekday}</span><strong>{formatNumber(totalCalories)} <small>kcal</small> <i /> {formatNumber(totalProtein)}g <small>protein</small></strong></div>
          </section>
        </section>

        <aside className="side-column">
          <section className="panel macro-panel" aria-labelledby="macros">
            <div className="panel-heading compact-heading"><div><p className="eyebrow">Daily split</p><h2 id="macros">Macros</h2></div><span className="panel-meta">per day</span></div>
            <div className="macro-donut" style={{ background: macroValues.gradient }} role="img" aria-label={`Estimated daily macro split: ${macroValues.carbs} percent carbohydrates, ${macroValues.protein} percent protein, ${macroValues.fat} percent fat`}><div><strong>{formatNumber(totalCalories)}</strong><span>kcal</span></div></div>
            <div className="macro-legend"><div><span className="macro-key carbs" /><span>Carbs</span><strong>{macroValues.carbs}%</strong></div><div><span className="macro-key protein" /><span>Protein</span><strong>{macroValues.protein}%</strong></div><div><span className="macro-key fat" /><span>Fat</span><strong>{macroValues.fat}%</strong></div></div>
          </section>

          <section className="panel history-panel" aria-labelledby="history-title">
            <div className="panel-heading compact-heading"><div><p className="eyebrow">Keep the thread</p><h2 id="history-title">Recent days</h2></div><button className="more-button" type="button" onClick={() => setShowAllDays((current) => !current)}>{showAllDays ? "Less" : "View all"}</button></div>
            <div className="history-list">{days.slice(showAllDays ? 0 : 3).reverse().map((day) => <button className={`history-row ${selectedDayKey === day.key ? "selected" : ""}`} type="button" key={day.key} onClick={() => selectDay(day.key)} disabled={actionInProgress}><span className="history-date"><strong>{day.shortDate}</strong><small>{day.weekday.slice(0, 3)}</small></span><span className="history-bar"><i style={{ width: `${calculateTargetPercent(day.calories, activeCalorieTarget)}%` }} /></span><span className="history-calories">{formatNumber(day.calories)}<small> kcal</small></span><span className="history-chevron" aria-hidden="true">›</span></button>)}</div>
            <div className="streak-line"><span className="streak-flame" aria-hidden="true">✦</span><span><strong>{loggingStreak} day{loggingStreak === 1 ? "" : "s"}</strong> logging streak</span></div>
          </section>

          <section className="quick-tip" aria-label="Calocount tip"><span className="tip-icon" aria-hidden="true">i</span><p><strong>Estimates are a starting point.</strong> Add a description to your photo for a more useful result.</p></section>
        </aside>
      </div>

      {previewMeal ? <div
        className="photo-preview-backdrop"
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) setPreviewMeal(null);
        }}
      >
        <div className="photo-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-preview-title">
          <button ref={previewCloseRef} className="close-button photo-preview-close" type="button" onClick={() => setPreviewMeal(null)} aria-label="Close photo preview">×</button>
          <div className="photo-preview-media">
            {previewMeal.photoUrl && !failedPhotoUrls.has(previewMeal.photoUrl) ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
              className="photo-preview-image"
              src={previewMeal.photoUrl}
              alt={previewMeal.name}
              decoding="async"
              onError={() => markPhotoUnavailable(previewMeal.photoUrl as string)}
              />
            </> : <p className="photo-preview-fallback" role="status">Photo unavailable</p>}
          </div>
          <p className="photo-preview-title" id="photo-preview-title">{previewMeal.name}</p>
        </div>
      </div> : null}

      </>}

      <footer className="app-footer"><span>{readOnly ? "Public read-only view" : "Private by default"}</span><span className="footer-separator" aria-hidden="true">·</span><span>Calocount dashboard</span></footer>
    </main>
  );
}

export default function Home() {
  return <Dashboard readOnly publicView />;
}
