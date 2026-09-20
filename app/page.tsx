"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { asRecord, stringOr, parseDashboardPayload, dashboardFailureMessage, parseWeightResponse, parseMealResponse, parseSettingsTargets, type DailyWeight, type TrendDay, type DashboardSummary, type SerializedMeal } from "./dashboard-api";
import { mergeTrendDays, mergeTrendWeights } from "./dashboard-trend";
import { settingsDraftForTargets, type SettingsDraft, type TargetState } from "./dashboard-settings";

import { resolveNutrientGoals } from "../domain/nutrient-goals";
import {
  calculateProteinTargetG,
  DEFAULT_PROTEIN_PER_KG,
  isValidProteinPerKg,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
  updateProteinGoalSettings,
  type ProteinGoalSummary,
} from "../domain/protein-goals";

import {
  calculateCalorieChartScale,
  calculateLoggingStreak,
  calculateMacroPercentages,
  calculateMacroTrend,
  calculateRollingAverage,
  calculateSevenDayAverage,
  calculateTargetPercent,
  calculateWeightChartScale,
  compareAverageToTarget,
  getAdjacentDayKey,
} from "./dashboard-calculations";
import {
  beginMealEdit,
  commitMealEdit,
  discardMealEdit,
  emptyMealEditState,
  mealDraftFor,
  updateMealDraft,
  updateMealDraftItem,
  type MealDraftChanges,
  type MealEditState,
} from "./dashboard-edit";
import { scheduleDashboardClock } from "./dashboard-clock";
import { photoUrlForKey, publicPhotoUrlForMealId } from "./photo-url";
import { readThemePreference, subscribeToTheme, writeThemePreference, type ThemePreference } from "./theme";
import {
  aggregateNutrientValues,
  type NutrientAggregateMap,
} from "./nutrition/nutrient-meta";
import { nutrientGoalOverridesFromDraft } from "./nutrition/nutrient-goal-draft";
import { MealNutritionDetails, type NutritionItem } from "./nutrition/meal-nutrition-details";
import { MealNutritionEditor, nutrientValuesFromForm } from "./nutrition/meal-nutrition-editor";
import { readNutritionCollapsed, writeNutritionCollapsed } from "./nutrition/nutrition-collapse";
import { NutrientTrendPanel } from "./nutrition/nutrient-trend-panel";
import { NutritionOverview } from "./nutrition/nutrition-overview";
import { TrendRangeSelect, type TrendRangeDays } from "./trend-range-select";
import { FoodContributionChart, NutrientConsistencyMatrix, ProteinTargetChart } from "./dashboard-insights";
import { DaysWorthRepeating } from "./insights/days-worth-repeating";
import { WeeklyChanges } from "./insights/weekly-changes";
import { FrequencyPortion } from "./insights/frequency-portion";
import { buildInsightData } from "./insights/insight-data";
import type { InsightHistory } from "./insights/types";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type Meal = {
  id: string;
  consumedAt: number;
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
  pending?: "creating" | "copying" | "duplicating";
  status?: string;
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


type DataMode = "loading" | "live" | "error";
type DashboardSection = "today" | "meals" | "trend" | "macros" | "nutrition";
type DateKeyMode = "local" | "utc";
type PendingActionKind =
  | "meal-create"
  | "meal-save"
  | "meal-delete"
  | "meal-copy"
  | "meal-duplicate"
  | "weight-save"
  | "settings-load"
  | "settings-save";
type PendingAction = {
  token: number;
  kind: PendingActionKind;
  id?: string;
};
const SettingsPanel = lazy(() => import("./settings-panel"));

const calorieTarget = 2400;
const proteinTarget = 160;
const defaultNutrientTargets = resolveNutrientGoals();

const defaultProteinGoal: ProteinGoalSummary = {
  mode: "grams",
  gramsPerKg: null,
  fixedTargetG: proteinTarget,
  targetG: proteinTarget,
  weightKg: null,
  weightDate: null,
  byDate: [],
};

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

function dateLabelForTrend(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function showTrendDateLabel(index: number, total: number) {
  return total <= 7 || index === 0 || index === total - 1 || (index % 7 === 0 && index < total - 2);
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
    case "meal-duplicate": return "Duplicating meal…";
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
    status: meal.status,
    consumedAt: meal.consumedAt,
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

export function Dashboard({ readOnly = false, publicView = false }: DashboardProps) {
  const initialTargets: TargetState = { calories: calorieTarget, proteinG: proteinTarget, nutrients: defaultNutrientTargets };
  const [days, setDays] = useState(initialDays);
  const [trendRange, setTrendRange] = useState<TrendRangeDays>(7);
  const [trendHistory, setTrendHistory] = useState<{ byDate: TrendDay[]; weights: DailyWeight[] }>({ byDate: [], weights: [] });
  const [insightHistory, setInsightHistory] = useState<InsightHistory | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<DayKey>("thu");
  const [mealEditState, setMealEditState] = useState<MealEditState<Meal>>(() => emptyMealEditState<Meal>());
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");
  const [showAllDays, setShowAllDays] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [activeSection, setActiveSection] = useState<DashboardSection>("today");
  const [nutritionCollapsed, setNutritionCollapsed] = useState(false);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const [proteinGoal, setProteinGoal] = useState<ProteinGoalSummary>(defaultProteinGoal);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => settingsDraftForTargets(initialTargets, defaultProteinGoal));
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
  const dashboardAbort = useRef<AbortController | null>(null);
  const dashboardRefreshDeferred = useRef(false);
  const loadedSummaryDate = useRef<string | null>(null);
  const [mealPhotoDrafts, setMealPhotoDrafts] = useState<Record<string, File | null>>({});
  const [previewMeal, setPreviewMeal] = useState<Meal | null>(null);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(() => new Set());
  const [clockNow, setClockNow] = useState(() => new Date());
  const dashboardDate = dateKeyFromTimestamp(clockNow.getTime(), { mode: publicView ? "utc" : "local" });
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const actionInProgress = pendingAction !== null;
  const pendingLabel = pendingAction ? pendingActionLabel(pendingAction) : null;
  const weightActionPending = pendingAction?.kind === "weight-save";
  const settingsLoadPending = pendingAction?.kind === "settings-load";
  const settingsSavePending = pendingAction?.kind === "settings-save";
  const weightSaving = weightActionPending;
  const settingsLoading = settingsLoadPending;
  const settingsSaving = settingsSavePending;
  const deletingMealId = pendingAction?.kind === "meal-delete" ? pendingAction.id : null;
  const copyingMealId = pendingAction?.kind === "meal-copy" ? pendingAction.id : null;
  const duplicatingMealId = pendingAction?.kind === "meal-duplicate" ? pendingAction.id : null;
  const editingMealId = mealEditState.editingMealId;

  const selectedDay = days.find((day) => day.key === selectedDayKey) ?? days[4];
  const selectedWeight = selectedDay.weight ?? null;
  const selectedProteinGoal = proteinGoal.byDate.find((day) => day.date === selectedDay.date) ?? {
    date: selectedDay.date,
    targetG: proteinGoal.targetG,
    weightKg: proteinGoal.weightKg,
    weightDate: proteinGoal.weightDate,
  };
  const totalCalories = selectedDay.calories;
  const totalProtein = selectedDay.protein;
  const activeCalorieTarget = targets.calories ?? calorieTarget;
  const activeProteinTarget = proteinGoal.mode === "gramsPerKg"
    ? calculateProteinTargetG({ weightKg: selectedProteinGoal.weightKg, gramsPerKg: proteinGoal.gramsPerKg })
    : proteinGoal.fixedTargetG ?? targets.proteinG ?? proteinTarget;
  const remainingCalories = activeCalorieTarget - totalCalories;
  const remainingProtein = activeProteinTarget === null ? null : activeProteinTarget - totalProtein;
  const remainingProteinLabel = remainingProtein === null ? null : remainingProtein >= 0
    ? `${formatNumber(remainingProtein)}g left to reach your target`
    : `${formatNumber(Math.abs(remainingProtein))}g above target`;
  const proteinWeightSource = proteinGoal.mode === "gramsPerKg" && selectedProteinGoal.weightDate && selectedProteinGoal.weightDate !== selectedDay.date
    ? `Using weight from ${fullDateLabel(selectedProteinGoal.weightDate)}`
    : null;

  const sevenDayChartValues = useMemo(
    () => days.map((day) => ({ date: day.date, label: `${day.weekday.slice(0, 3)} ${day.shortDate}`, value: day.calories })),
    [days],
  );

  const insightData = useMemo(
    () => buildInsightData(insightHistory, days, trendHistory.byDate),
    [insightHistory, days, trendHistory.byDate],
  );

  const visibleTrendDays = useMemo(
    () => mergeTrendDays({ history: trendHistory.byDate, days, range: trendRange }),
    [days, trendHistory.byDate, trendRange],
  );

  const chartValues = useMemo(
    () => visibleTrendDays.map((day) => ({ date: day.date, label: dateLabelForTrend(day.date), value: day.calories })),
    [visibleTrendDays],
  );

  const chartScale = useMemo(
    () => calculateCalorieChartScale(chartValues.map((day) => day.value), activeCalorieTarget),
    [activeCalorieTarget, chartValues],
  );

  const weightChartValues = useMemo(() => {
    const weights = mergeTrendWeights({ history: trendHistory.weights, days });
    return visibleTrendDays.map((day) => ({
      date: day.date,
      label: dateLabelForTrend(day.date),
      value: weights.get(day.date) ?? null,
    }));
  }, [days, trendHistory.weights, visibleTrendDays]);

  const weightChartScale = useMemo(
    () => {
      const smoothed = calculateRollingAverage(weightChartValues.map((day) => day.value));
      return calculateWeightChartScale(smoothed.flatMap((day) => [day.value, day.average]));
    },
    [weightChartValues],
  );

  const smoothedWeightValues = useMemo(
    () => calculateRollingAverage(weightChartValues.map((day) => day.value)),
    [weightChartValues],
  );

  const weightLineSegments = useMemo(() => {
    const segments: string[][] = [];
    weightChartValues.forEach((day, index) => {
      if (day.value === null) return;
      const x = weightChartValues.length === 1 ? 50 : (index / (weightChartValues.length - 1)) * 100;
      const scaleIndex = index * 2;
      const y = 100 - (weightChartScale.valueHeightPercents[scaleIndex] ?? 0);
      if (index === 0 || weightChartValues[index - 1]?.value === null) segments.push([]);
      segments.at(-1)?.push(`${x},${y}`);
    });
    return segments;
  }, [weightChartScale.valueHeightPercents, weightChartValues]);

  const weightAverageLine = useMemo(() => smoothedWeightValues.flatMap((day, index) => {
    if (day.average === null) return [];
    const x = smoothedWeightValues.length === 1 ? 50 : (index / (smoothedWeightValues.length - 1)) * 100;
    const y = 100 - (weightChartScale.valueHeightPercents[index * 2 + 1] ?? 0);
    return [`${x},${y}`];
  }), [smoothedWeightValues, weightChartScale.valueHeightPercents]);

  const weightWeeklyChange = useMemo(() => {
    const known = smoothedWeightValues.map((point) => point.average).filter((value): value is number => value !== null);
    if (known.length < 2) return null;
    const comparisonIndex = Math.max(0, known.length - 8);
    return known.at(-1)! - known[comparisonIndex]!;
  }, [smoothedWeightValues]);

  const hasWeightData = weightChartValues.some((day) => day.value !== null);

  const macroTrendValues = useMemo(
    () => calculateMacroTrend(visibleTrendDays.map((day) => ({
      date: day.date,
      carbsG: day.carbsG,
      proteinG: day.proteinG,
      fatG: day.fatG,
    }))).map((day, index) => ({
      ...day,
      label: dateLabelForTrend(visibleTrendDays[index]?.date ?? day.date),
    })),
    [visibleTrendDays],
  );

  const hasMacroTrendData = macroTrendValues.some((day) => day.hasData);

  const averageCalories = useMemo(
    () => calculateSevenDayAverage({
      days: sevenDayChartValues,
      currentDate: sevenDayChartValues[sevenDayChartValues.length - 1]?.date ?? "",
      now: clockNow,
      timeZone: publicView ? "UTC" : browserTimeZone(),
    }),
    [sevenDayChartValues, clockNow, publicView],
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
    const hasData = percentages.carbs + percentages.protein + percentages.fat > 0;
    return {
      ...percentages,
      gradient: hasData
        ? `conic-gradient(var(--chart-green) 0 ${percentages.protein}%, var(--chart-blue) ${percentages.protein}% ${percentages.protein + percentages.carbs}%, var(--chart-orange) ${percentages.protein + percentages.carbs}% 100%)`
        : "var(--chart-base)",
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
    dashboardRefreshDeferred.current ||= dashboardLoadInFlight.current;
    dashboardAbort.current?.abort();
    dashboardLoadVersion.current += 1;
    dashboardLoadInFlight.current = false;
    setDashboardLoading(false);
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
    if (action.kind !== "settings-load" || dashboardRefreshDeferred.current) {
      dashboardRefreshDeferred.current = false;
      setDashboardReloadKey((current) => current + 1);
    }
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
    if (pendingActionRef.current) {
      dashboardRefreshDeferred.current = true;
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    dashboardAbort.current = controller;
    const requestVersion = dashboardLoadVersion.current + 1;
    dashboardLoadVersion.current = requestVersion;
    dashboardLoadInFlight.current = true;
    async function loadDashboard() {
      try {
        const endpoint = publicView ? "/api/public/summary" : `/api/dashboard/summary?timezone=${encodeURIComponent(browserTimeZone())}`;
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
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
        setProteinGoal(parsed.proteinGoal);
        setTargets({
          calories: parsed.targets.calories ?? calorieTarget,
          proteinG: parsed.targets.proteinG ?? proteinTarget,
          nutrients: parsed.targets.nutrients,
        });
        setDays(liveDays);
        setInsightHistory(parsed.insights ?? null);
        setTrendHistory(parsed.trend ?? {
          byDate: liveDays.map((day) => ({
            date: day.date,
            calories: day.calories,
            proteinG: day.protein,
            carbsG: day.carbs ?? 0,
            fatG: day.fat ?? 0,
            mealCount: day.meals.length,
            nutrients: day.nutrients ?? {},
          })),
          weights: parsed.recentWeights,
        });
        const previousDate = loadedSummaryDate.current;
        loadedSummaryDate.current = parsed.date;
        setSelectedDayKey((current) => !previousDate || current === dayKeyForDate(previousDate)
          ? dayKeyForDate(parsed.date) : current);
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
      controller.abort();
    };
  }, [dashboardReloadKey, dashboardDate, publicView, readOnly]);

  useEffect(() => {
    const stopClock = scheduleDashboardClock({
      now: () => new Date(),
      onTick: setClockNow,
    });
    let refreshFrame: number | null = null;
    const refreshClock = () => {
      if (document.hidden || refreshFrame !== null) return;
      refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = null;
        setClockNow(new Date());
        setDashboardReloadKey((current) => current + 1);
      });
    };
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshClock);
    return () => {
      stopClock();
      if (refreshFrame !== null) window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", refreshClock);
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNutritionCollapsed(readNutritionCollapsed(() => window.localStorage));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setThemePreference(readThemePreference(() => window.localStorage));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    return subscribeToTheme(themePreference, document.documentElement, mediaQuery);
  }, [themePreference]);

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

  function toggleNutritionSection() {
    setNutritionCollapsed((current) => {
      const next = !current;
      writeNutritionCollapsed(() => window.localStorage, next);
      return next;
    });
  }

  function toggleInsightsSection() {
    setInsightsCollapsed((current) => !current);
  }

  function changeThemePreference(nextTheme: ThemePreference) {
    writeThemePreference(() => window.localStorage, nextTheme);
    setThemePreference(nextTheme);
  }

  function markPhotoUnavailable(photoUrl: string) {
    setFailedPhotoUrls((current) => {
      if (current.has(photoUrl)) return current;
      const next = new Set(current);
      next.add(photoUrl);
      return next;
    });
  }

  function updateMeal(mealId: string, changes: MealDraftChanges) {
    if (readOnly || pendingActionRef.current) return;
    setMealEditState((current) => updateMealDraft(current, mealId, changes));
  }

  function updateMealItem(mealId: string, itemId: string | undefined, itemIndex: number, key: string, value: number | null) {
    if (readOnly || pendingActionRef.current) return;
    setMealEditState((current) => updateMealDraftItem(current, { mealId, itemId, itemIndex, key, value }));
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
    if (readOnly || dataMode !== "live" || pendingActionRef.current) return;
    const canonicalMeal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    const meal = mealEditState.drafts[mealId];
    if (!canonicalMeal || !meal) return;
    const action = beginAction("meal-save", mealId);
    if (!action) return;
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
      setMealEditState((current) => commitMealEdit(current, mealId));
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
      finishAction(action);
    }
  }

  function openMealEditor(meal: Meal) {
    if (readOnly || pendingActionRef.current) return;
    setMealEditState(beginMealEdit(meal));
    setMealPhotoDrafts({});
    setActionError(null);
    setActionStatus(null);
  }

  function cancelMealEditor(mealId?: string) {
    if (pendingActionRef.current) return;
    setMealEditState((current) => discardMealEdit(current, mealId));
    setMealPhotoDrafts((current) => {
      if (!mealId) return {};
      if (!Object.prototype.hasOwnProperty.call(current, mealId)) return current;
      const next = { ...current };
      delete next[mealId];
      return next;
    });
    setActionError(null);
    setActionStatus(null);
  }

  async function deleteMeal(mealId: string) {
    if (readOnly || dataMode !== "live") return;
    if (pendingActionRef.current) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    if (!meal) return;
    if (!window.confirm(`Delete "${meal.name}"? This removes the meal and its analysis data. This cannot be undone.`)) return;

    const action = beginAction("meal-delete", mealId);
    if (!action) return;
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
      setMealEditState(emptyMealEditState<Meal>());
      setMealPhotoDrafts({});
      const result = asRecord(responseBody);
      setActionStatus(result?.photoDeleted === false
        ? "Meal deleted. Its photo could not be removed."
        : "Meal deleted.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setActionError(error instanceof Error ? error.message : "The meal could not be deleted.");
      setActionStatus(null);
    } finally {
      finishAction(action);
    }
  }

  async function copyMealToToday(mealId: string) {
    if (readOnly || dataMode !== "live" || pendingActionRef.current) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    const today = days.at(-1);
    if (!meal || !today || selectedDay.date === today.date) return;

    const action = beginAction("meal-copy", mealId);
    if (!action) return;
    setActionError(null);
    const consumedAt = mealDateTimestamp({ date: today.date, time: localTimeValue() }) ?? Date.now();
    const optimisticMeal: Meal = {
      ...meal,
      id: `optimistic-copy-${action.token}`,
      consumedAt,
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
      finishAction(action);
    }
  }

  async function duplicateMeal(mealId: string) {
    if (readOnly || dataMode !== "live" || pendingActionRef.current) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    if (!meal) return;

    const action = beginAction("meal-duplicate", mealId);
    if (!action) return;
    setActionError(null);
    const optimisticMeal: Meal = {
      ...meal,
      id: `optimistic-duplicate-${action.token}`,
      pending: "duplicating",
    };
    addMealToDate(selectedDay.date, optimisticMeal);
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumedAt: meal.consumedAt }),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be duplicated."));
      }
      const parsedMeal = parseMealResponse(responseBody);
      if (!parsedMeal) throw new Error("The duplicated meal response was invalid.");
      if (!isCurrentAction(action)) return;
      reconcileMeal(optimisticMeal.id, parsedMeal);
      setActionStatus(`Duplicated “${meal.name}”.`);
    } catch (error) {
      if (!isCurrentAction(action)) return;
      removeMealFromDays(optimisticMeal.id);
      setActionError(error instanceof Error ? error.message : "The meal could not be duplicated.");
      setActionStatus(null);
    } finally {
      finishAction(action);
    }
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || dataMode !== "live") return;
    if (pendingActionRef.current) return;
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
    const nextMeal: Meal = {
      id: `optimistic-meal-${action.token}`,
      consumedAt,
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
    event.preventDefault();
    if (readOnly || dataMode !== "live") return;
    if (pendingActionRef.current) return;
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
      finishAction(action);
    }
  }

  async function openSettings() {
    if (readOnly || dataMode !== "live" || pendingActionRef.current) return;
    const action = beginAction("settings-load");
    if (!action) return;
    setSettingsDraft(settingsDraftForTargets(targets, proteinGoal));
    setShowSettings(true);
    setActionError(null);
    setActionStatus(null);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401 || response.status === 503) return;
        throw new Error("The current targets could not be loaded.");
      }
      const parsed = parseSettingsTargets(await response.json());
      if (!parsed || !isCurrentAction(action)) return;
      const fixedProteinG = Number.isFinite(parsed.proteinG)
        ? parsed.proteinG
        : proteinGoal.fixedTargetG ?? targets.proteinG;
      const nextProteinGoal = updateProteinGoalSettings({
        current: proteinGoal,
        mode: parsed.proteinGoalMode,
        fixedTargetG: fixedProteinG,
        gramsPerKg: parsed.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
      });
      const nextTargets = {
        calories: Number.isFinite(parsed.calories) ? parsed.calories : activeCalorieTarget,
        proteinG: fixedProteinG,
        nutrients: parsed.nutrients,
      };
      setTargets(nextTargets);
      setProteinGoal(nextProteinGoal);
      setSettingsDraft(settingsDraftForTargets(nextTargets, nextProteinGoal));
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setActionError(error instanceof Error ? error.message : "The current targets could not be loaded.");
    } finally {
      finishAction(action);
    }
  }

  async function saveSettings() {
    if (readOnly || dataMode !== "live") return;
    if (pendingActionRef.current) return;
    const calories = Number(settingsDraft.calories);
    const proteinG = Number(settingsDraft.proteinG);
    const proteinPerKg = Number(settingsDraft.proteinPerKg);
    if (!Number.isFinite(calories) || calories < 1) {
      setActionError("Enter a calorie target greater than zero.");
      return;
    }
    if (settingsDraft.proteinGoalMode === "grams" && (!Number.isFinite(proteinG) || proteinG < 1)) {
      setActionError("Enter a fixed protein target greater than zero.");
      return;
    }
    if (settingsDraft.proteinGoalMode === "gramsPerKg" && !isValidProteinPerKg(proteinPerKg)) {
      setActionError(`Enter a protein target between ${PROTEIN_PER_KG_MIN} and ${PROTEIN_PER_KG_MAX} g/kg.`);
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
    setTargets({ calories, proteinG: Number.isFinite(proteinG) && proteinG > 0 ? proteinG : targets.proteinG, nutrients: nutrientTargets });
    try {
      let nextTargets = { calories, proteinG: Number.isFinite(proteinG) && proteinG > 0 ? proteinG : targets.proteinG, nutrients: nutrientTargets };
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dailyCalorieTarget: calories,
          dailyProteinTargetG: Number.isFinite(proteinG) && proteinG > 0 ? proteinG : null,
          proteinGoalMode: settingsDraft.proteinGoalMode,
          dailyProteinTargetPerKg: isValidProteinPerKg(proteinPerKg) ? proteinPerKg : null,
          nutrientTargets: nutrientTargetOverrides,
        }),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The targets could not be saved."));
      }
      const parsed = parseSettingsTargets(responseBody);
      if (parsed && Number.isFinite(parsed.calories)) {
        const savedProteinG = Number.isFinite(parsed.proteinG) ? parsed.proteinG : nextTargets.proteinG;
        nextTargets = { calories: parsed.calories, proteinG: savedProteinG, nutrients: parsed.nutrients };
      }
      if (!isCurrentAction(action)) return;
      setTargets(nextTargets);
      setShowSettings(false);
      setActionStatus("Targets saved.");
    } catch (error) {
      if (!isCurrentAction(action)) return;
      setTargets(previousTargets);
      setActionError(error instanceof Error ? error.message : "The targets could not be saved.");
      setActionStatus(null);
    } finally {
      finishAction(action);
    }
  }

  function selectDay(key: DayKey) {
    if (pendingActionRef.current) return;
    setSelectedDayKey(key);
    setMealEditState(emptyMealEditState<Meal>());
    setMealPhotoDrafts({});
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
          {readOnly ? <a className="secondary-button owner-link" href="/owner">Open owner view</a> : null}
          {!readOnly && dataMode === "live" ? <>
            <button className="icon-button" type="button" onClick={() => void openSettings()} disabled={actionInProgress || settingsLoading || settingsSaving} aria-label="Open settings" aria-expanded={showSettings} aria-controls="settings-panel" aria-busy={settingsLoadPending}><span aria-hidden="true">{settingsLoadPending ? "…" : "⚙"}</span></button>
          </> : null}
          <span className="avatar" aria-label={readOnly ? "Public read-only view" : "Account"}><span aria-hidden="true">{readOnly ? "↗" : "M"}</span></span>
        </div>
      </header>

      {!readOnly && dataMode === "live" && showSettings ? <Suspense fallback={<p role="status">Loading settings…</p>}>
        <SettingsPanel draft={settingsDraft} setDraft={setSettingsDraft} onSave={saveSettings} onClose={() => setShowSettings(false)} loading={settingsLoading} saving={settingsSaving} themePreference={themePreference} onThemeChange={changeThemePreference} />
      </Suspense> : null}

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
          {activeProteinTarget === null ? <div className="summary-copy protein-goal-unavailable">
            <div className="card-label-row"><span className="metric-dot protein-dot" aria-hidden="true" /><span className="card-label">Protein</span></div>
            <p className="metric-value">Goal unavailable</p>
            <p className="metric-subtitle">Record a weight to calculate your daily protein goal.</p>
            {readOnly ? <span className="protein-goal-hint">Record a weight in the owner dashboard.</span> : <a className="secondary-button protein-goal-link" href="#weight" onClick={() => openWeightEditor()}>Record weight</a>}
          </div> : <>
            <div className="summary-copy">
              <div className="card-label-row"><span className="metric-dot protein-dot" aria-hidden="true" /><span className="card-label">Protein</span></div>
              <p className="metric-value">{formatNumber(totalProtein)}g <span>/ {formatNumber(activeProteinTarget)}g</span></p>
              <p className="metric-subtitle">{remainingProteinLabel}</p>
              {proteinWeightSource ? <span className="protein-goal-hint">{proteinWeightSource}</span> : null}
            </div>
            <div className="metric-ring protein-ring" style={{ "--progress": `${calculateTargetPercent(totalProtein, activeProteinTarget)}%` } as CSSProperties} aria-label={`${calculateTargetPercent(totalProtein, activeProteinTarget)} percent of protein target`} role="img"><strong>{calculateTargetPercent(totalProtein, activeProteinTarget)}%</strong></div>
          </>}
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
          <div className="mini-bars" aria-hidden="true">{sevenDayChartValues.map((day) => <span key={day.label} style={{ height: `${Math.max(22, (day.value / 2600) * 100)}%` }} />)}</div>
        </article>
      </section>

      <div className="content-grid">
        <section className="primary-column">
          <section className="panel chart-panel" id="trend" aria-labelledby="trend-title">
            <div className="panel-heading">
              <div><p className="eyebrow">A quick view</p><h2 id="trend-title">Calorie trend</h2></div>
              <TrendRangeSelect value={trendRange} onChange={setTrendRange} label="Calorie trend" />
            </div>
            <div className="chart-legend"><span><i className="legend-swatch calorie-swatch" /> Calories</span><span><i className="legend-line" /> Target {formatNumber(activeCalorieTarget)}</span></div>
            <div className={`bar-chart${trendRange === 30 ? " is-month" : ""}`} role="group" aria-label={`Calorie intake for the past ${trendRange} days compared with a ${activeCalorieTarget} calorie target`}>
              <div className="chart-y-axis" aria-hidden="true">{chartScale.tickValues.map((value) => <span key={value}>{formatChartTick(value)}</span>)}</div>
              <div className="chart-plot">
                <div className="target-line" style={{ top: `${chartScale.targetLineTopPercent}%` }}><span>{formatNumber(activeCalorieTarget)}</span></div><div className="grid-line line-one" /><div className="grid-line line-two" /><div className="grid-line line-three" />
                <div className="bars">{chartValues.map((day, index) => <button className="bar-column" key={day.date} type="button" aria-label={`${day.label}: ${day.value.toLocaleString()} kilocalories`}><span className="bar-value">{day.value.toLocaleString()}</span><span className={`bar${day.value > 0 ? "" : " bar-empty"}`} style={{ height: day.value > 0 ? `${Math.max(12, chartScale.valueHeightPercents[index] ?? 0)}%` : "0" }} /><span>{showTrendDateLabel(index, chartValues.length) ? day.label : ""}</span></button>)}</div>
              </div>
            </div>
          </section>

          <ProteinTargetChart
            days={visibleTrendDays.map((day) => ({ ...day, label: dateLabelForTrend(day.date) }))}
            goalByDate={proteinGoal.byDate}
            fallbackTarget={proteinGoal.mode === "grams" ? activeProteinTarget : null}
            range={trendRange}
            onRangeChange={setTrendRange}
          />

          <section className="panel chart-panel weight-trend-panel" aria-labelledby="weight-trend-title">
            <div className="panel-heading">
              <div><p className="eyebrow">A quick view</p><h2 id="weight-trend-title">Weight trend</h2></div>
              <TrendRangeSelect value={trendRange} onChange={setTrendRange} label="Weight trend" />
            </div>
            {hasWeightData ? <>
              <div className="chart-legend weight-chart-legend"><span><i className="legend-swatch weight-swatch" /> Daily weight</span><span><i className="legend-line weight-average-line" /> 7-day average</span>{weightWeeklyChange === null ? null : <span className="weight-change">{weightWeeklyChange > 0 ? "+" : ""}{formatWeight(weightWeeklyChange)} kg vs 7 days earlier</span>}</div>
              <div className={`bar-chart weight-chart${trendRange === 30 ? " is-month" : ""}`} role="group" aria-label={`Recorded weight for the past ${trendRange} days in kilograms; missing days are shown as gaps`}>
                <div className="chart-y-axis" aria-hidden="true">{weightChartScale.tickValues.map((value) => <span key={value}>{formatWeight(value)}</span>)}</div>
                <div className="chart-plot">
                  <div className="grid-line line-one" /><div className="grid-line line-two" /><div className="grid-line line-three" />
                  <svg className="weight-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {weightLineSegments.map((points, index) => points.length > 1 ? <polyline className="weight-raw-line" key={index} points={points.join(" ")} /> : null)}
                    {weightAverageLine.length > 1 ? <polyline className="weight-average-path" points={weightAverageLine.join(" ")} /> : null}
                  </svg>
                  <div className="weight-points">{weightChartValues.map((day, index) => <button className={`weight-point-column${day.value === null ? " missing" : ""}`} key={day.date} type="button" aria-label={day.value === null ? `${day.label}: no weight recorded` : `${day.label}: ${formatWeight(day.value)} kilograms`}>
                    <span className="weight-tooltip">{day.value === null ? "No record" : `${formatWeight(day.value)} kg`}</span>
                    {day.value === null ? null : <span className="weight-point" style={{ bottom: `calc(21px + ${(weightChartScale.valueHeightPercents[index * 2] ?? 0) * 0.902}%)` }} aria-hidden="true" />}
                    <span>{showTrendDateLabel(index, weightChartValues.length) ? day.label : ""}</span>
                  </button>)}</div>
                </div>
              </div>
            </> : <div className="chart-empty" role="status"><strong>No weight records for the past {trendRange} days</strong><span>Record a daily weight to see your trend.</span></div>}
          </section>

          <section className="panel chart-panel macro-trend-panel" aria-labelledby="macro-trend-title">
            <div className="panel-heading">
              <div><p className="eyebrow">A quick view</p><h2 id="macro-trend-title">Macros trend</h2></div>
              <TrendRangeSelect value={trendRange} onChange={setTrendRange} label="Macros trend" />
            </div>
            {hasMacroTrendData ? <>
              <div className="chart-legend macro-trend-legend">
                <span><i className="legend-swatch macro-carbs-swatch" /> Carbs</span>
                <span><i className="legend-swatch macro-protein-swatch" /> Protein</span>
                <span><i className="legend-swatch macro-fat-swatch" /> Fat</span>
              </div>
              <div className={`macro-trend-chart${trendRange === 30 ? " is-month" : ""}`} role="group" aria-label={`Calorie-weighted carbohydrate, protein, and fat split for the past ${trendRange} days; days without macro data are shown as gaps`}>
                <div className="macro-trend-y-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
                <div className="macro-trend-plot">
                  <div className="macro-mid-line" aria-hidden="true" />
                  <div className="macro-trend-bars">{macroTrendValues.map((day, index) => <button
                    className={`macro-trend-column${day.hasData ? "" : " missing"}`}
                    key={day.date}
                    type="button"
                    aria-label={day.hasData
                      ? `${day.label}: ${day.percentages.carbs}% carbohydrates, ${day.percentages.protein}% protein, ${day.percentages.fat}% fat`
                      : `${day.label}: no macro data`}
                  >
                    <span className="macro-tooltip">{day.hasData ? `${day.percentages.carbs}% C · ${day.percentages.protein}% P · ${day.percentages.fat}% F` : "No data"}</span>
                    <div className="macro-stack" title={day.hasData ? `${day.percentages.carbs}% carbs · ${day.percentages.protein}% protein · ${day.percentages.fat}% fat` : "No macro data"}>
                      {day.hasData ? <>
                        <span className="macro-segment fat" style={{ height: `${day.percentages.fat}%` }} />
                        <span className="macro-segment protein" style={{ height: `${day.percentages.protein}%` }} />
                        <span className="macro-segment carbs" style={{ height: `${day.percentages.carbs}%` }} />
                      </> : <span className="macro-gap" aria-hidden="true">—</span>}
                    </div>
                    <span>{showTrendDateLabel(index, macroTrendValues.length) ? day.label : ""}</span>
                  </button>)}</div>
                </div>
              </div>
            </> : <div className="chart-empty" role="status"><strong>No macro records for the past {trendRange} days</strong><span>Add protein, carbs, or fat to a meal to see the daily split.</span></div>}
          </section>

          <FoodContributionChart days={days} visibleDates={visibleTrendDays.map((day) => day.date)} />

          <NutrientConsistencyMatrix
            days={visibleTrendDays.map((day) => ({ ...day, label: dateLabelForTrend(day.date) }))}
            goals={targets.nutrients}
          />

          <NutritionOverview
            values={selectedDay.nutrients}
            carbsG={selectedDay.carbs}
            fatG={selectedDay.fat}
            goals={targets.nutrients}
            collapsed={nutritionCollapsed}
            onToggle={toggleNutritionSection}
          >
            <NutrientTrendPanel byDate={visibleTrendDays.map((day) => ({ date: day.date, nutrients: day.nutrients }))} goals={targets.nutrients} range={trendRange} onRangeChange={setTrendRange} />
          </NutritionOverview>

          <section className="panel weight-panel" id="weight" aria-labelledby="weight-title">
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
              {selectedDay.meals.map((meal) => {
                const mealDraft = mealDraftFor(mealEditState, meal);
                return <div className="meal-group" key={meal.id}>
                <div className={`meal-row${meal.pending || pendingAction?.id === meal.id ? " is-pending" : ""}`} aria-busy={Boolean(meal.pending || pendingAction?.id === meal.id)}>
                  <div className="meal-row-content">
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
                    <div className="meal-info"><div className="meal-name-line"><strong>{meal.name}</strong><time>{meal.time}</time>{meal.pending === "creating" ? <span className="pending-indicator" role="status">Saving…</span> : null}{meal.pending === "copying" ? <span className="pending-indicator" role="status">Copying…</span> : null}{meal.pending === "duplicating" ? <span className="pending-indicator" role="status">Duplicating…</span> : null}{pendingAction?.kind === "meal-save" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Saving…</span> : null}{pendingAction?.kind === "meal-delete" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Deleting…</span> : null}{pendingAction?.kind === "meal-copy" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Copying…</span> : null}{pendingAction?.kind === "meal-duplicate" && pendingAction.id === meal.id ? <span className="pending-indicator" role="status">Duplicating…</span> : null}</div>{meal.description.trim().toLocaleLowerCase() !== meal.name.trim().toLocaleLowerCase() ? <span>{meal.description}</span> : null}</div>
                    <div className="meal-macros" aria-label="Meal macros">
                      <div className="meal-stat calories-stat"><span className="meal-stat-label">Energy</span><span>{formatNumber(meal.calories)} <small>kcal</small></span></div>
                      <div className="meal-stat protein-stat"><span className="meal-stat-label">Protein</span><span>{formatNumber(meal.protein)} <small>g</small></span></div>
                      <div className="meal-stat carbs-stat"><span className="meal-stat-label">Carbs</span><span>{formatNumber(meal.carbs ?? 0)} <small>g</small></span></div>
                      <div className="meal-stat fat-stat"><span className="meal-stat-label">Fat</span><span>{formatNumber(meal.fat ?? 0)} <small>g</small></span></div>
                    </div>
                  </div>
                  <div className="meal-row-footer">
                    <MealNutritionDetails meal={meal} readOnly={readOnly} />
                    {!readOnly ? <div className="meal-actions" id={`meal-actions-${meal.id}`}>
                      {selectedDay.date !== days.at(-1)?.date ? <button className="copy-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null} onClick={() => void copyMealToToday(meal.id)} aria-label={`Copy ${meal.name} to today`} aria-busy={copyingMealId === meal.id}>{copyingMealId === meal.id ? "Copying…" : "Copy to today"}</button> : null}
                      <button className="duplicate-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null || duplicatingMealId !== null} onClick={() => void duplicateMeal(meal.id)} aria-label={`Duplicate ${meal.name}`} aria-busy={duplicatingMealId === meal.id}>{duplicatingMealId === meal.id ? "Duplicating…" : "Duplicate"}</button>
                      <button className="edit-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null || duplicatingMealId !== null} onClick={() => {
                        const isClosing = editingMealId === meal.id;
                        if (isClosing) cancelMealEditor(meal.id);
                        else openMealEditor(meal);
                      }} aria-expanded={editingMealId === meal.id} aria-label={`Edit ${meal.name}`}>Edit</button>
                      <button className="delete-button" type="button" disabled={actionInProgress || deletingMealId !== null || copyingMealId !== null || duplicatingMealId !== null} onClick={() => void deleteMeal(meal.id)} aria-label={`Delete ${meal.name}`} aria-busy={deletingMealId === meal.id}>{deletingMealId === meal.id ? "Deleting…" : "Delete"}</button>
                    </div> : null}
                  </div>
                </div>
                {!readOnly && editingMealId === meal.id ? <div className="inline-editor">
                  <label>Name<input value={mealDraft.name} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { name: event.target.value })} /></label>
                  <label className="editor-description-field">Description<input value={mealDraft.description} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { description: event.target.value })} /></label>
                  <label>Calories<input type="number" min="0" step="any" value={mealDraft.calories} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { calories: Number(event.target.value) })} /></label>
                  <label>Protein<input type="number" min="0" step="any" value={mealDraft.protein} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { protein: Number(event.target.value) })} /></label>
                  <label>Carbs<input type="number" min="0" step="any" value={mealDraft.carbs ?? 0} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { carbs: Number(event.target.value) })} /></label>
                  <label>Fat<input type="number" min="0" step="any" value={mealDraft.fat ?? 0} disabled={actionInProgress} onChange={(event) => updateMeal(meal.id, { fat: Number(event.target.value) })} /></label>
                  <label className="editor-photo-field">{mealDraft.photoKey ? "Replace photo (optional)" : "Photo (optional)"}<input
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
                  /><small>{mealPhotoDrafts[meal.id]?.name ?? (mealDraft.photoKey ? "Current photo stays unless you select a replacement." : "JPEG, PNG, or WebP · up to 10 MB")}</small></label>
                  <div className="meal-item-editors">
                    <div className="meal-item-editors-heading"><strong>Food item nutrition</strong><span>Values stay with each item in an AI meal.</span></div>
                    {mealDraft.items.map((item, index) => <div className="meal-item-editor" key={item.id ?? `${meal.id}-item-${index}`}>
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
                    <button className="cancel-button" type="button" disabled={actionInProgress} onClick={() => cancelMealEditor(meal.id)}>Cancel</button>
                    <button className="done-button" type="button" disabled={actionInProgress} aria-busy={pendingAction?.kind === "meal-save" && pendingAction.id === meal.id} onClick={() => void saveMeal(meal.id)}>{pendingAction?.kind === "meal-save" && pendingAction.id === meal.id ? "Saving…" : "Save changes"}</button>
                  </div>
                </div> : null}
              </div>;
              })}
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

      <section className="insights-overview" aria-labelledby="insights-title">
        <div className="nutrition-overview-heading insights-overview-heading">
          <div><p className="eyebrow">Longer-term patterns</p><h2 id="insights-title">Insights</h2></div>
          <div className="nutrition-overview-actions">
            <span className="panel-meta">historical patterns</span>
            <button
              type="button"
              className="nutrition-section-toggle"
              aria-expanded={!insightsCollapsed}
              aria-controls="insights-overview-content"
              onClick={toggleInsightsSection}
            >
              {insightsCollapsed ? "Show insights" : "Hide insights"}
              <span aria-hidden="true">{insightsCollapsed ? "⌄" : "⌃"}</span>
            </button>
          </div>
        </div>
        <div className="insights-overview-content" id="insights-overview-content" hidden={insightsCollapsed}>
          <DaysWorthRepeating
            days={insightData.days}
            entries={insightData.entries}
            currentDate={dashboardDate}
            calorieTarget={targets.calories}
            proteinGoals={proteinGoal.byDate}
            fallbackProteinTarget={proteinGoal.mode === "grams" ? proteinGoal.fixedTargetG : null}
            nutrientGoals={targets.nutrients}
          />
          <WeeklyChanges days={insightData.days} entries={insightData.entries} currentDate={dashboardDate} />
          <FrequencyPortion days={insightData.days} entries={insightData.entries} currentDate={dashboardDate} />
        </div>
      </section>

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
