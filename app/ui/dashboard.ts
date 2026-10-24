import { asRecord, stringOr, parseDashboardPayload, dashboardFailureMessage, parseWeightResponse, parseMealResponse, parseSavedEntriesResponse, parseTrackedEntryResponse, parseSettingsTargets, parseDayLog, type DailyWeight, type TrendDay, type DashboardSummary, type SavedEntry, type SerializedMeal } from "../dashboard-api";
import { mergeTrendDays, mergeTrendWeights } from "../dashboard-trend";
import { settingsDraftForTargets, type SettingsDraft, type TargetState } from "../dashboard-settings";

import { shiftDateKey } from "../../domain/logical-date";
import { resolveNutrientGoals } from "../../domain/nutrient-goals";
import type { NutrientKey } from "../../domain/nutrients";
import {
  calculateProteinTargetG,
  DEFAULT_PROTEIN_PER_KG,
  isValidProteinPerKg,
  PROTEIN_PER_KG_MAX,
  PROTEIN_PER_KG_MIN,
  updateProteinGoalSettings,
  type ProteinGoalDay,
  type ProteinGoalSummary,
} from "../../domain/protein-goals";

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
} from "../dashboard-calculations";
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
} from "../dashboard-edit";
import { scheduleDashboardClock } from "../dashboard-clock";
import { mealKind, mealKindForTime, mealKindLabels, type MealKind } from "../meal-kind";
import { browserTimeZone, dateKeyInTimeZone, localTimeValue, mealDateTimestamp } from "../meal-time";
import { photoUrlForKey, publicPhotoUrlForMealId } from "../photo-url";
import { readThemePreference, subscribeToTheme, writeThemePreference, type ThemePreference } from "../theme";
import {
  aggregateNutrientValues,
  type NutrientAggregateMap,
} from "../nutrition/nutrient-meta";
import { nutrientGoalOverridesFromDraft } from "../nutrition/nutrient-goal-draft";
import { nutrientProvenanceFromForm, nutrientValuesFromForm } from "../nutrition/nutrient-form";
import type { NutritionItem } from "../nutrition/nutrition-item";
import type { NutrientValueOrigin } from "../../domain/nutrient-provenance";
import { readNutritionCollapsed, writeNutritionCollapsed } from "../nutrition/nutrition-collapse";
import { buildInsightData } from "../insights/insight-data";
import type { InsightHistory } from "../insights/types";

import { cx, h, keep, memo, patch, slot, svg, type Child } from "./dom";
import { createMealEditor, mealKindOptions, mealPhotoAccept, mealPhotoError, type MealEditor } from "./meal-editor";
import { mealNutritionDetails } from "./meal-nutrition-details";
import { mealNutritionEditor } from "./meal-nutrition-editor";
import { createNutrientTrendPanel } from "./nutrient-trend-panel";
import { nutritionOverview } from "./nutrition-overview";
import { trendRangeSelect, type TrendRangeDays } from "./trend-range-select";
import { createHistoryCalendar } from "./history-calendar";
import { createFoodContributionChart, nutrientConsistencyMatrix, proteinTargetChart } from "./dashboard-insights";
import { createDaysWorthRepeating } from "./days-worth-repeating";
import { createWeeklyChanges } from "./weekly-changes";
import { createFrequencyPortion } from "./frequency-portion";
import { createNutritionAttention } from "./nutrition-attention";
import { createNutrientFoodScenarios } from "./nutrient-food-scenarios";
import type { SettingsPanel } from "./settings-panel";

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
  savedEntryId?: string | null;
  kind: MealKind | null;
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


/** A day before the seven recent days, opened from the calendar or with the day arrows. */
type OlderDay = {
  day: Day;
  proteinGoal: ProteinGoalDay | null;
};

type DataMode = "loading" | "live" | "error";
type DashboardSection = "today" | "meals" | "trend" | "macros" | "nutrition";
type PendingActionKind =
  | "meal-create"
  | "meal-save"
  | "meal-delete"
  | "meal-copy"
  | "meal-duplicate"
  | "saved-entry-add"
  | "saved-entry-remove"
  | "saved-entry-track"
  | "weight-save"
  | "settings-load"
  | "settings-save";
type PendingAction = {
  token: number;
  kind: PendingActionKind;
  id?: string;
};

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

export type DashboardOptions = {
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

const numberFormatter = new Intl.NumberFormat("en-US");
const weightFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const trendDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatChartTick(value: number) {
  return value === 0 ? "0" : `${(value / 1000).toFixed(1)}k`;
}

const orderedDayKeys: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}:${JSON.stringify(options)}`;
  let formatter = clockFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    clockFormatters.set(key, formatter);
  }
  return formatter;
}

/** A 24-hour HH:MM time in a timezone, as shown on entry rows. */
function formatMealTime(timestamp: number, timeZone: string) {
  return clockFormatter(timeZone, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
}

function dayKeyForDate(date: string): DayKey {
  const dayIndex = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return orderedDayKeys[dayIndex] ?? "sun";
}

function dayLabelForDate(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return {
    shortDate: String(parsed.getUTCDate()),
    weekday: weekdayFormatter.format(parsed),
  };
}

function dateLabelForTrend(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return trendDateFormatter.format(parsed);
}

function showTrendDateLabel(index: number, total: number) {
  return total <= 7 || index === 0 || index === total - 1 || (index % 7 === 0 && index < total - 2);
}

function fullDateLabel(date: string) {
  return fullDateFormatter.format(new Date(`${date}T12:00:00.000Z`));
}

/** A progress ring with the percentage in its centre. */
function metricRing({ percent, label, className }: { percent: number; label: string; className: string }) {
  return h("div", { class: `metric-ring ${className}`, "aria-label": label, role: "img" },
    svg("svg", { viewBox: "0 0 36 36", "aria-hidden": "true" },
      svg("circle", { class: "metric-ring-track", cx: "18", cy: "18", r: "15.5" }),
      percent > 0 ? svg("circle", { class: "metric-ring-value", cx: "18", cy: "18", r: "15.5", pathLength: 100, "stroke-dasharray": `${percent} 100` }) : null,
    ),
    h("strong", null, `${percent}%`),
  );
}

function formatWeight(weightKg: number) {
  return weightFormatter.format(weightKg);
}

function formatRecordedTime(recordedAt: number, timeZone: string) {
  return clockFormatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(new Date(recordedAt));
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
    case "meal-create": return "Saving entry…";
    case "meal-save": return "Saving changes…";
    case "meal-delete": return "Deleting entry…";
    case "meal-copy": return "Copying entry to today…";
    case "meal-duplicate": return "Duplicating entry…";
    case "saved-entry-add": return "Adding to saved entries…";
    case "saved-entry-remove": return "Removing saved entry…";
    case "saved-entry-track": return "Tracking saved entry…";
    case "weight-save": return "Saving weight…";
    case "settings-load": return "Loading saved targets…";
    case "settings-save": return "Saving targets…";
  }
}

/** The error message from an API response body, or the fallback when it has none. */
function apiErrorMessage(body: unknown, fallback: string): string {
  return stringOr(asRecord(asRecord(body)?.error)?.message, fallback);
}

function mapRemoteMeal(meal: SerializedMeal, { publicView, timeZone }: { publicView: boolean; timeZone: string }): Meal {
  const kind = mealKind(meal.mealType);
  const itemNames = meal.items.map((item) => item.name).filter(Boolean);
  const name = itemNames[0] || meal.caption.split(",")[0]?.trim() || (kind ? `${mealKindLabels[kind]} entry` : "Entry");
  return {
    id: meal.id,
    status: meal.status,
    savedEntryId: meal.savedEntryId,
    consumedAt: meal.consumedAt,
    time: formatMealTime(meal.consumedAt, timeZone),
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

function buildLiveDays(summary: DashboardSummary, { timeZone, publicView }: { timeZone: string; publicView: boolean }): Day[] {
  const summaryDate = new Date(`${summary.date}T12:00:00.000Z`);
  const mealsByDate = new Map<string, Meal[]>();
  const weightsByDate = new Map(
    summary.recentWeights.map((weight) => [weight.logicalDate, weight]),
  );
  const nutritionByDate = new Map(
    (summary.nutrition?.byDate ?? []).map((entry) => [entry.date, entry.nutrients]),
  );
  for (const serializedMeal of summary.recentMeals) {
    const key = dateKeyInTimeZone(serializedMeal.consumedAt, timeZone);
    const meals = mealsByDate.get(key) ?? [];
    meals.push(mapRemoteMeal(serializedMeal, { publicView, timeZone }));
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
      ...(item.nutrientProvenance ? { nutrientProvenance: item.nutrientProvenance } : {}),
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

/**
 * Build the body for an edit. It carries the items, and the caption and type
 * only when they changed, so the stored source and status survive.
 */
function mealPatchPayload(meal: Meal, saved: Meal) {
  return {
    ...(meal.description !== saved.description ? { caption: meal.description } : {}),
    ...(meal.kind !== saved.kind ? { mealType: meal.kind } : {}),
    items: mealPayload(meal).items,
  };
}

function mealRequestOptions(payload: ReturnType<typeof mealPayload> | ReturnType<typeof mealPatchPayload>, photo?: File | null): Pick<RequestInit, "body" | "headers"> {
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

type State = {
  days: Day[];
  savedEntries: SavedEntry[];
  trendRange: TrendRangeDays;
  trendHistory: { byDate: TrendDay[]; weights: DailyWeight[] };
  insightHistory: InsightHistory | null;
  selectedDayKey: DayKey;
  olderDay: OlderDay | null;
  olderDayLoadingDate: string | null;
  showCalendar: boolean;
  mealEditState: MealEditState<Meal>;
  showAddMeal: boolean;
  showWeightForm: boolean;
  weightDraft: string;
  showAllDays: boolean;
  showSettings: boolean;
  themePreference: ThemePreference;
  activeSection: DashboardSection;
  nutritionCollapsed: boolean;
  insightsCollapsed: boolean;
  focusedInsightNutrient: NutrientKey | null;
  proteinGoal: ProteinGoalSummary;
  settingsDraft: SettingsDraft;
  dataMode: DataMode;
  targets: TargetState;
  vitaminB6UsFnbAdultUlEnabled: boolean;
  usFnbAdultUlEnabled: boolean;
  dataMessage: string | null;
  actionStatus: string | null;
  actionError: string | null;
  pendingAction: PendingAction | null;
  dashboardReloadKey: number;
  dashboardLoading: boolean;
  mealPhotoDrafts: Record<string, File | null>;
  previewMeal: Meal | null;
  historicalMeal: Meal | null;
  historicalMealLoadingId: string | null;
  historicalMealError: string | null;
  failedPhotoUrls: Set<string>;
  clockNow: Date;
  summaryTimeZone: string | null;
};

const sections: readonly DashboardSection[] = ["today", "meals", "trend", "macros", "nutrition"];
const sectionLabels: Record<DashboardSection, string> = { today: "Today", meals: "Entries", trend: "Trend", macros: "Macros", nutrition: "Nutrition" };

function panelHeading({ eyebrow, title, titleId, className = "panel-heading" }: { eyebrow: string; title: Child; titleId: string; className?: string }, ...rest: Child[]) {
  return h("div", { class: className }, h("div", null, h("p", { class: "eyebrow" }, eyebrow), h("h2", { id: titleId }, title)), rest);
}

function gridLines() {
  return [h("div", { class: "grid-line line-one" }), h("div", { class: "grid-line line-two" }), h("div", { class: "grid-line line-three" })];
}

/**
 * Show the dashboard in `root` and keep it current. The state is one object.
 * A change to it asks for a render, and a render swaps only the parts of the
 * page whose inputs changed. Returns a function that stops the dashboard.
 */
export function mountDashboard(root: HTMLElement, { readOnly = false, publicView = false }: DashboardOptions = {}): () => void {
  const initialTargets: TargetState = { calories: calorieTarget, proteinG: proteinTarget, nutrients: defaultNutrientTargets };
  const browserZone = browserTimeZone();
  const state: State = {
    days: initialDays,
    savedEntries: [],
    trendRange: 7,
    trendHistory: { byDate: [], weights: [] },
    insightHistory: null,
    selectedDayKey: "thu",
    olderDay: null,
    olderDayLoadingDate: null,
    showCalendar: false,
    mealEditState: emptyMealEditState<Meal>(),
    showAddMeal: false,
    showWeightForm: false,
    weightDraft: "",
    showAllDays: false,
    showSettings: false,
    themePreference: readThemePreference(() => window.localStorage),
    activeSection: "today",
    nutritionCollapsed: readNutritionCollapsed(() => window.localStorage),
    insightsCollapsed: false,
    focusedInsightNutrient: null,
    proteinGoal: defaultProteinGoal,
    settingsDraft: settingsDraftForTargets({ targets: initialTargets, proteinGoal: defaultProteinGoal, timezone: "UTC" }),
    dataMode: "loading",
    targets: initialTargets,
    vitaminB6UsFnbAdultUlEnabled: false,
    usFnbAdultUlEnabled: false,
    dataMessage: readOnly ? "Loading the public dashboard…" : "Loading your saved log…",
    actionStatus: null,
    actionError: null,
    pendingAction: null,
    dashboardReloadKey: 0,
    dashboardLoading: true,
    mealPhotoDrafts: {},
    previewMeal: null,
    historicalMeal: null,
    historicalMealLoadingId: null,
    historicalMealError: null,
    failedPhotoUrls: new Set(),
    clockNow: new Date(),
    summaryTimeZone: null,
  };

  let actionToken = 0;
  let olderDayRequest = 0;
  let historicalMealRequest = 0;
  let dashboardLoadInFlight = false;
  let dashboardLoadVersion = 0;
  let dashboardAbort: AbortController | null = null;
  let dashboardRefreshDeferred = false;
  let loadedSummaryDate: string | null = null;
  let renderQueued = false;
  let stopped = false;

  /** Change the state and ask for a render. Changes in one task share one render. */
  function update(changes: Partial<State> = {}) {
    Object.assign(state, changes);
    if (renderQueued || stopped) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      if (!stopped) render();
    });
  }

  // The owner sees days in this device's timezone. The public view uses the owner's saved timezone,
  // which arrives with the summary, so every viewer sees the same days and times.
  const displayTimeZone = () => publicView ? state.summaryTimeZone ?? "UTC" : browserZone;
  const selectedDay = () => state.olderDay?.day ?? state.days.find((day) => day.key === state.selectedDayKey) ?? state.days[4];
  const todayDate = () => state.days.at(-1)?.date ?? selectedDay().date;
  const activeCalorieTarget = () => state.targets.calories ?? calorieTarget;

  // Values worked out from the state. Each keeps its last result while its inputs are the same.
  const sevenDayValuesFor = memo((days: Day[]) => days.map((day) => ({ date: day.date, label: `${day.weekday.slice(0, 3)} ${day.shortDate}`, value: day.calories })));
  const insightDataFor = memo((history: InsightHistory | null, days: Day[], fallbackDays: TrendDay[]) => buildInsightData(history, days, fallbackDays));
  const visibleTrendDaysFor = memo((history: TrendDay[], days: Day[], range: TrendRangeDays) => mergeTrendDays({ history, days, range }));
  const labelledTrendDaysFor = memo((visible: TrendDay[]) => visible.map((day) => ({ ...day, label: dateLabelForTrend(day.date) })));
  const trendDatesFor = memo((visible: TrendDay[]) => visible.map((day) => day.date));
  const nutrientTrendFor = memo((visible: TrendDay[]) => visible.map((day) => ({ date: day.date, nutrients: day.nutrients })));
  // Item history covers the whole trend range; the seven live days alone would under-count a 30-day view.
  const foodContributionDaysFor = memo((entries: InsightHistory["entries"]) => {
    const itemsByDate = new Map<string, InsightHistory["entries"][number]["items"]>();
    for (const entry of entries) {
      const items = itemsByDate.get(entry.date);
      if (items) items.push(...entry.items);
      else itemsByDate.set(entry.date, [...entry.items]);
    }
    return [...itemsByDate].map(([date, items]) => ({ date, meals: [{ items }] }));
  });
  const referenceSettingsFor = memo((vitaminB6UsFnbAdultUlEnabled: boolean, usFnbAdultUlEnabled: boolean) => ({ vitaminB6UsFnbAdultUlEnabled, usFnbAdultUlEnabled }));
  const calorieChartFor = memo((visible: TrendDay[], target: number) => {
    const values = visible.map((day) => ({ date: day.date, label: dateLabelForTrend(day.date), value: day.calories }));
    return { values, scale: calculateCalorieChartScale(values.map((day) => day.value), target) };
  });
  const weightChartFor = memo((history: DailyWeight[], days: Day[], visible: TrendDay[]) => {
    const weights = mergeTrendWeights({ history, days });
    const values = visible.map((day) => ({ date: day.date, label: dateLabelForTrend(day.date), value: weights.get(day.date) ?? null }));
    const smoothed = calculateRollingAverage(values.map((day) => day.value));
    const scale = calculateWeightChartScale(smoothed.flatMap((day) => [day.value, day.average]));
    const lineSegments: string[][] = [];
    values.forEach((day, index) => {
      if (day.value === null) return;
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 100 - (scale.valueHeightPercents[index * 2] ?? 0);
      if (index === 0 || values[index - 1]?.value === null) lineSegments.push([]);
      lineSegments.at(-1)?.push(`${x},${y}`);
    });
    const averageLine = smoothed.flatMap((day, index) => {
      if (day.average === null) return [];
      const x = smoothed.length === 1 ? 50 : (index / (smoothed.length - 1)) * 100;
      const y = 100 - (scale.valueHeightPercents[index * 2 + 1] ?? 0);
      return [`${x},${y}`];
    });
    const known = smoothed.map((point) => point.average).filter((value): value is number => value !== null);
    const weeklyChange = known.length < 2 ? null : known.at(-1)! - known[Math.max(0, known.length - 8)]!;
    return {
      values,
      scale,
      lineSegments,
      averageLine,
      weeklyChange,
      hasData: values.some((day) => day.value !== null),
      latestAverage: smoothed.at(-1)?.average ?? null,
    };
  });
  const macroTrendFor = memo((visible: TrendDay[]) => calculateMacroTrend(visible.map((day) => ({
    date: day.date,
    carbsG: day.carbsG,
    proteinG: day.proteinG,
    fatG: day.fatG,
  }))).map((day, index) => ({
    ...day,
    label: dateLabelForTrend(visible[index]?.date ?? day.date),
  })));

  function derive() {
    const timeZone = displayTimeZone();
    const pending = state.pendingAction;
    const selected = selectedDay();
    const proteinGoal = state.proteinGoal;
    const selectedProteinGoal = proteinGoal.byDate.find((day) => day.date === selected.date) ?? state.olderDay?.proteinGoal ?? {
      date: selected.date,
      targetG: proteinGoal.targetG,
      weightKg: proteinGoal.weightKg,
      weightDate: proteinGoal.weightDate,
    };
    const calorieGoal = activeCalorieTarget();
    const activeProteinTarget = proteinGoal.mode === "gramsPerKg"
      ? calculateProteinTargetG({ weightKg: selectedProteinGoal.weightKg, gramsPerKg: proteinGoal.gramsPerKg })
      : proteinGoal.fixedTargetG ?? state.targets.proteinG ?? proteinTarget;
    const remainingProtein = activeProteinTarget === null ? null : activeProteinTarget - selected.protein;
    const sevenDayValues = sevenDayValuesFor(state.days);
    const visibleTrendDays = visibleTrendDaysFor(state.trendHistory.byDate, state.days, state.trendRange);
    const insightData = insightDataFor(state.insightHistory, state.days, state.trendHistory.byDate);
    const averageCalories = calculateSevenDayAverage({
      days: sevenDayValues,
      currentDate: sevenDayValues[sevenDayValues.length - 1]?.date ?? "",
      now: state.clockNow,
      timeZone,
    });
    const today = todayDate();
    return {
      timeZone,
      dashboardDate: dateKeyInTimeZone(state.clockNow.getTime(), timeZone),
      pending,
      actionInProgress: pending !== null,
      pendingLabel: pending ? pendingActionLabel(pending) : null,
      olderDayLabel: state.olderDayLoadingDate ? `Loading ${fullDateLabel(state.olderDayLoadingDate)}…` : null,
      weightActionPending: pending?.kind === "weight-save",
      settingsLoadPending: pending?.kind === "settings-load",
      settingsSavePending: pending?.kind === "settings-save",
      selected,
      selectedWeight: selected.weight ?? null,
      calorieGoal,
      activeProteinTarget,
      remainingCalories: calorieGoal - selected.calories,
      remainingProteinLabel: remainingProtein === null ? null : remainingProtein >= 0
        ? `${formatNumber(Math.round(remainingProtein))}g left to reach your target`
        : `${formatNumber(Math.round(Math.abs(remainingProtein)))}g above target`,
      proteinWeightSource: proteinGoal.mode === "gramsPerKg" && selectedProteinGoal.weightDate && selectedProteinGoal.weightDate !== selected.date
        ? `Using weight from ${fullDateLabel(selectedProteinGoal.weightDate)}`
        : null,
      sevenDayValues,
      insightData,
      labelledTrendDays: labelledTrendDaysFor(visibleTrendDays),
      visibleTrendDates: trendDatesFor(visibleTrendDays),
      nutrientTrendByDate: nutrientTrendFor(visibleTrendDays),
      foodContributionDays: foodContributionDaysFor(insightData.entries),
      referenceSettings: referenceSettingsFor(state.vitaminB6UsFnbAdultUlEnabled, state.usFnbAdultUlEnabled),
      calorieChart: calorieChartFor(visibleTrendDays, calorieGoal),
      weightChart: weightChartFor(state.trendHistory.weights, state.days, visibleTrendDays),
      macroTrend: macroTrendFor(visibleTrendDays),
      averageCalories,
      averageComparison: compareAverageToTarget(averageCalories, calorieGoal),
      loggingStreak: calculateLoggingStreak(state.days, selected.date),
      today,
      hasNextDay: selected.date < today,
    };
  }

  type View = ReturnType<typeof derive>;

  function beginAction(kind: PendingActionKind, id?: string): PendingAction | null {
    if (state.pendingAction) return null;
    dashboardRefreshDeferred ||= dashboardLoadInFlight;
    dashboardAbort?.abort();
    dashboardLoadVersion += 1;
    dashboardLoadInFlight = false;
    const action = { token: actionToken + 1, kind, id };
    actionToken = action.token;
    update({ dashboardLoading: false, pendingAction: action });
    return action;
  }

  function isCurrentAction(action: PendingAction) {
    return state.pendingAction?.token === action.token;
  }

  function finishAction(action: PendingAction) {
    if (!isCurrentAction(action)) return;
    const changesSummary = action.kind !== "settings-load"
      && action.kind !== "saved-entry-add"
      && action.kind !== "saved-entry-remove";
    const reload = changesSummary || dashboardRefreshDeferred;
    if (reload) dashboardRefreshDeferred = false;
    update({ pendingAction: null, dashboardReloadKey: state.dashboardReloadKey + (reload ? 1 : 0) });
  }

  /**
   * Run one owner action: take the single action slot, send the request, and
   * apply or roll back the result. Returns true when the action succeeded.
   * A result is ignored when a newer action has replaced this one.
   */
  async function runAction<T>({ kind, id, begin, request, parse, failure, invalid, success }: {
    kind: PendingActionKind;
    id?: string;
    /** Apply an optimistic change. Return a function that undoes it. */
    begin?: (action: PendingAction) => (() => void) | void;
    request: () => Promise<Response>;
    /** Read the response body. Null means the response was not usable. */
    parse: (body: unknown) => T | null;
    /** The message shown when the server gives none. */
    failure: string;
    /** The message for a successful response that could not be read. */
    invalid?: string;
    success: (result: T, action: PendingAction) => void;
  }): Promise<boolean> {
    const action = beginAction(kind, id);
    if (!action) return false;
    update({ actionError: null });
    const rollback = begin?.(action);
    try {
      const response = await request();
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(body, failure));
      const result = parse(body);
      if (result === null) throw new Error(invalid ?? failure);
      if (!isCurrentAction(action)) return false;
      success(result, action);
      return true;
    } catch (error) {
      if (!isCurrentAction(action)) return false;
      rollback?.();
      update({ actionError: error instanceof Error ? error.message : failure, actionStatus: null });
      return false;
    } finally {
      finishAction(action);
    }
  }

  function findLoadedMeal(mealId: string): Meal | undefined {
    return [...state.days, ...(state.olderDay ? [state.olderDay.day] : [])].flatMap((day) => day.meals).find((entry) => entry.id === mealId);
  }

  /** Apply a change to each loaded day: the seven recent days and the open older day. */
  function updateLoadedDays(change: (day: Day) => Day) {
    update({
      days: state.days.map(change),
      olderDay: state.olderDay ? { ...state.olderDay, day: change(state.olderDay.day) } : state.olderDay,
    });
  }

  function retryDashboard() {
    if (dashboardLoadInFlight) return;
    dashboardLoadInFlight = true;
    update({
      dashboardLoading: true,
      dataMode: "loading",
      dataMessage: readOnly ? "Loading the public dashboard…" : "Loading your saved log…",
      actionError: null,
      actionStatus: null,
      dashboardReloadKey: state.dashboardReloadKey + 1,
    });
  }

  let loadedFor: string | null = null;
  let cancelDashboardLoad: (() => void) | null = null;

  /** Load the summary again when a reload was asked for or the day changed. A newer load replaces an older one. */
  function loadDashboardWhenStale(dashboardDate: string) {
    const key = `${state.dashboardReloadKey}|${dashboardDate}`;
    if (key === loadedFor) return;
    loadedFor = key;
    cancelDashboardLoad?.();
    cancelDashboardLoad = null;
    if (state.pendingAction) {
      dashboardRefreshDeferred = true;
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    dashboardAbort = controller;
    const requestVersion = dashboardLoadVersion + 1;
    dashboardLoadVersion = requestVersion;
    dashboardLoadInFlight = true;
    cancelDashboardLoad = () => {
      cancelled = true;
      controller.abort();
    };
    const stale = () => cancelled || dashboardLoadVersion !== requestVersion;
    const unavailableMessage = publicView
      ? "The public dashboard could not be loaded. Try again later."
      : "The read-only dashboard could not be loaded. Try again later.";
    async function loadDashboard() {
      try {
        const endpoint = publicView ? "/api/public/summary" : `/api/dashboard/summary?timezone=${encodeURIComponent(browserTimeZone())}`;
        // Saved entries load beside the summary. Their failure must not hide a loaded summary.
        const savedEntriesRequest = readOnly
          ? null
          : fetch("/api/saved-entries", { cache: "no-store", signal: controller.signal })
            .then(async (savedResponse) => savedResponse.ok ? parseSavedEntriesResponse(await savedResponse.json()) : null)
            .catch(() => null);
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (stale()) return;
          if (readOnly) {
            // The owner turned the public view off while this page was open.
            update({ dataMode: "error", dataMessage: response.status === 404 ? "The owner made this dashboard private." : unavailableMessage });
          } else {
            const responseBody = await response.json().catch(() => null);
            if (stale()) return;
            // The passkey session ended. The server shows the sign-in page for this address.
            if (response.status === 401 && asRecord(asRecord(responseBody)?.error)?.code === "sign_in_required") {
              window.location.reload();
              return;
            }
            update({ dataMode: "error", dataMessage: dashboardFailureMessage(response.status, responseBody) });
          }
          return;
        }
        const parsed = parseDashboardPayload(await response.json());
        if (!parsed) throw new Error("invalid_dashboard_summary");
        if (stale()) return;
        const liveDays = buildLiveDays(parsed, { timeZone: publicView ? parsed.timezone ?? "UTC" : browserTimeZone(), publicView });
        const parsedSavedEntries = await savedEntriesRequest;
        if (stale()) return;
        const previousDate = loadedSummaryDate;
        loadedSummaryDate = parsed.date;
        update({
          ...(parsedSavedEntries ? { savedEntries: parsedSavedEntries } : {}),
          summaryTimeZone: parsed.timezone,
          proteinGoal: parsed.proteinGoal,
          vitaminB6UsFnbAdultUlEnabled: parsed.referenceSettings?.vitaminB6UsFnbAdultUlEnabled === true,
          usFnbAdultUlEnabled: parsed.referenceSettings?.usFnbAdultUlEnabled === true,
          targets: {
            calories: parsed.targets.calories ?? calorieTarget,
            proteinG: parsed.targets.proteinG ?? proteinTarget,
            nutrients: parsed.targets.nutrients,
          },
          days: liveDays,
          insightHistory: parsed.insights ?? null,
          trendHistory: parsed.trend ?? {
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
          },
          selectedDayKey: !previousDate || state.selectedDayKey === dayKeyForDate(previousDate)
            ? dayKeyForDate(parsed.date) : state.selectedDayKey,
          dataMode: "live",
          dataMessage: null,
        });
      } catch {
        if (stale()) return;
        update({
          dataMode: "error",
          dataMessage: readOnly ? unavailableMessage : "Your saved log is unavailable. Try again later.",
        });
      } finally {
        if (dashboardLoadVersion === requestVersion) {
          dashboardLoadInFlight = false;
          update({ dashboardLoading: false });
        }
      }
    }
    void loadDashboard();
  }

  function toggleNutritionSection() {
    const nutritionCollapsed = !state.nutritionCollapsed;
    writeNutritionCollapsed(() => window.localStorage, nutritionCollapsed);
    update({ nutritionCollapsed });
  }

  function changeThemePreference(themePreference: ThemePreference) {
    writeThemePreference(() => window.localStorage, themePreference);
    update({ themePreference });
  }

  function markPhotoUnavailable(photoUrl: string) {
    if (state.failedPhotoUrls.has(photoUrl)) return;
    update({ failedPhotoUrls: new Set(state.failedPhotoUrls).add(photoUrl) });
  }

  // The open edit forms, by field prefix and entry. A form lives as long as its edit.
  const editors = new Map<string, { mealId: string; editor: MealEditor }>();
  let editorsVersion = 0;

  /** Store a new edit state. Changing which entry is edited closes the open forms. */
  function setEditState(mealEditState: MealEditState<Meal>, changes: Partial<State> = {}) {
    editors.clear();
    editorsVersion += 1;
    update({ mealEditState, ...changes });
  }

  /** Store a change to a draft. The form that made the change already shows it. */
  function setDraft(mealEditState: MealEditState<Meal>, { mealId, from }: { mealId: string; from: string }) {
    state.mealEditState = mealEditState;
    const draft = mealEditState.drafts[mealId];
    if (!draft) return;
    for (const [key, entry] of editors) if (key !== from && entry.mealId === mealId) entry.editor.refresh(draft);
  }

  function updateMealItemProvenance({ mealId, itemId, itemIndex, key, origin }: { mealId: string; itemId: string | undefined; itemIndex: number; key: NutrientKey; origin: NutrientValueOrigin | null }): MealEditState<Meal> {
    const current = state.mealEditState;
    const draft = current.drafts[mealId];
    if (!draft) return current;
    const items = draft.items.map((item, index) => {
      if ((itemId && item.id !== itemId) || (!itemId && index !== itemIndex)) return item;
      const value = item.nutrients?.[key];
      const nextOrigin = origin !== null && typeof value === "number" && Number.isFinite(value) ? origin : null;
      const nutrientProvenance = { ...(item.nutrientProvenance ?? {}) };
      if (nextOrigin === null) delete nutrientProvenance[key];
      else nutrientProvenance[key] = nextOrigin;
      return {
        ...item,
        nutrientProvenance: Object.keys(nutrientProvenance).length > 0 ? nutrientProvenance : undefined,
      };
    });
    return { ...current, drafts: { ...current.drafts, [mealId]: { ...draft, items } } };
  }

  /** The edit form of an entry. It is made when the edit starts and kept until the edit ends. */
  function editorFor({ meal, idPrefix, itemsHint, className }: { meal: Meal; idPrefix: string; itemsHint: string; className?: string }): MealEditor {
    const from = `${idPrefix}${meal.id}`;
    const existing = editors.get(from);
    if (existing) return existing.editor;
    const mealId = meal.id;
    const canEdit = () => !readOnly && !state.pendingAction;
    const editor = createMealEditor({
      meal: mealDraftFor(state.mealEditState, meal),
      className,
      idPrefix,
      itemsHint,
      onChange: (changes: MealDraftChanges) => {
        if (canEdit()) setDraft(updateMealDraft(state.mealEditState, mealId, changes), { mealId, from });
      },
      onItemChange: (itemId, itemIndex, key, value) => {
        if (canEdit()) setDraft(updateMealDraftItem(state.mealEditState, { mealId, itemId, itemIndex, key, value }), { mealId, from });
      },
      onItemProvenanceChange: (itemId, itemIndex, key, origin) => {
        if (canEdit()) setDraft(updateMealItemProvenance({ mealId, itemId, itemIndex, key, origin }), { mealId, from });
        const items = state.mealEditState.drafts[mealId]?.items ?? [];
        const item = itemId ? items.find((candidate) => candidate.id === itemId) : items[itemIndex];
        return item?.nutrientProvenance?.[key] ?? null;
      },
      onPhotoChange: (photo) => update({ mealPhotoDrafts: { ...state.mealPhotoDrafts, [mealId]: photo } }),
      onPhotoError: (actionError) => update({ actionError }),
      onCancel: () => cancelMealEditor(mealId),
      onSave: () => void saveMeal(mealId),
    });
    editors.set(from, { mealId, editor });
    return editor;
  }

  function replaceRemoteMeal(remoteMeal: SerializedMeal) {
    const nextMeal = mapRemoteMeal(remoteMeal, { publicView, timeZone: displayTimeZone() });
    const date = dateKeyInTimeZone(remoteMeal.consumedAt, displayTimeZone());
    if (state.historicalMeal?.id === nextMeal.id) update({ historicalMeal: nextMeal });
    updateLoadedDays((day) => {
      if (day.date !== date) return day;
      const meals = day.meals.some((meal) => meal.id === nextMeal.id)
        ? day.meals.map((meal) => meal.id === nextMeal.id ? nextMeal : meal)
        : [...day.meals, nextMeal];
      return dayWithMeals(day, meals);
    });
  }

  function addMealToDate(logicalDate: string, meal: Meal) {
    updateLoadedDays((day) => (
      day.date === logicalDate ? dayWithMeals(day, [...day.meals, meal]) : day
    ));
  }

  function reconcileMeal(optimisticId: string, remoteMeal: SerializedMeal) {
    const nextMeal = mapRemoteMeal(remoteMeal, { publicView, timeZone: displayTimeZone() });
    const date = dateKeyInTimeZone(remoteMeal.consumedAt, displayTimeZone());
    updateLoadedDays((day) => {
      const withoutOptimistic = day.meals.filter((meal) => meal.id !== optimisticId && meal.id !== nextMeal.id);
      if (day.date !== date) {
        return withoutOptimistic.length === day.meals.length ? day : dayWithMeals(day, withoutOptimistic);
      }
      return dayWithMeals(day, [...withoutOptimistic, nextMeal]);
    });
  }

  function removeMealFromDays(mealId: string) {
    updateLoadedDays((day) => {
      const meals = day.meals.filter((meal) => meal.id !== mealId);
      if (meals.length === day.meals.length) return day;
      return dayWithMeals(day, meals);
    });
  }

  function withoutPhotoDraft(mealId: string) {
    if (!Object.prototype.hasOwnProperty.call(state.mealPhotoDrafts, mealId)) return state.mealPhotoDrafts;
    const next = { ...state.mealPhotoDrafts };
    delete next[mealId];
    return next;
  }

  async function saveMeal(mealId: string) {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const canonicalMeal = findLoadedMeal(mealId) ?? (state.historicalMeal?.id === mealId ? state.historicalMeal : undefined);
    const meal = state.mealEditState.drafts[mealId];
    if (!canonicalMeal || !meal) return;
    await runAction({
      kind: "meal-save",
      id: mealId,
      request: () => fetch(`/api/meals/${encodeURIComponent(meal.id)}`, {
        method: "PATCH",
        ...mealRequestOptions(mealPatchPayload(meal, canonicalMeal), state.mealPhotoDrafts[mealId]),
      }),
      parse: parseMealResponse,
      failure: "The entry could not be saved.",
      invalid: "The saved entry response was invalid.",
      success: (parsedMeal) => {
        replaceRemoteMeal(parsedMeal);
        setEditState(commitMealEdit(state.mealEditState, mealId), {
          ...(state.historicalMeal?.id === mealId ? { historicalMeal: null } : {}),
          mealPhotoDrafts: withoutPhotoDraft(mealId),
          actionStatus: "Entry saved.",
        });
      },
    });
  }

  function openMealEditor(meal: Meal) {
    if (readOnly || state.pendingAction) return;
    setEditState(beginMealEdit(meal), { mealPhotoDrafts: {}, actionError: null, actionStatus: null });
  }

  function cancelMealEditor(mealId?: string) {
    if (state.pendingAction) return;
    setEditState(discardMealEdit(state.mealEditState, mealId), {
      ...(!mealId || state.historicalMeal?.id === mealId ? { historicalMeal: null, historicalMealError: null } : {}),
      mealPhotoDrafts: mealId ? withoutPhotoDraft(mealId) : {},
      actionError: null,
      actionStatus: null,
    });
  }

  async function deleteMeal(mealId: string) {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const meal = findLoadedMeal(mealId);
    if (!meal) return;
    if (!window.confirm(`Delete "${meal.name}"? This removes the entry and its analysis data. This cannot be undone.`)) return;
    await runAction({
      kind: "meal-delete",
      id: mealId,
      request: () => fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "DELETE" }),
      parse: (body) => asRecord(body) ?? {},
      failure: "The entry could not be deleted.",
      success: (result) => {
        removeMealFromDays(mealId);
        setEditState(emptyMealEditState<Meal>(), {
          mealPhotoDrafts: {},
          actionStatus: result.photoDeleted === false
            ? "Entry deleted. Its photo could not be removed."
            : "Entry deleted.",
        });
      },
    });
  }

  /** Copy an entry to today, or duplicate it at its own time on the selected day. */
  async function copyMeal(mealId: string, { toToday }: { toToday: boolean }) {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const meal = findLoadedMeal(mealId);
    const today = state.days.at(-1);
    const selected = selectedDay();
    if (!meal || !today || (toToday && selected.date === today.date)) return;
    const targetDate = toToday ? today.date : selected.date;
    const consumedAt = toToday
      ? mealDateTimestamp({ date: today.date, time: localTimeValue() }) ?? state.clockNow.getTime()
      : meal.consumedAt;
    const optimisticId = (action: PendingAction) => `optimistic-${toToday ? "copy" : "duplicate"}-${action.token}`;
    await runAction({
      kind: toToday ? "meal-copy" : "meal-duplicate",
      id: mealId,
      begin: (action) => {
        addMealToDate(targetDate, {
          ...meal,
          id: optimisticId(action),
          consumedAt,
          time: formatMealTime(consumedAt, displayTimeZone()),
          pending: toToday ? "copying" : "duplicating",
        });
        return () => removeMealFromDays(optimisticId(action));
      },
      request: () => fetch(`/api/meals/${encodeURIComponent(mealId)}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumedAt }),
      }),
      parse: parseMealResponse,
      failure: toToday ? "The entry could not be copied." : "The entry could not be duplicated.",
      invalid: toToday ? "The copied entry response was invalid." : "The duplicated entry response was invalid.",
      success: (parsedMeal, action) => {
        reconcileMeal(optimisticId(action), parsedMeal);
        update({ actionStatus: toToday ? `Copied “${meal.name}” to today.` : `Duplicated “${meal.name}”.` });
      },
    });
  }

  async function addToSavedEntries(mealId: string) {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    await runAction({
      kind: "saved-entry-add",
      id: mealId,
      request: () => fetch("/api/saved-entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceEntryId: mealId }),
      }),
      parse: (body) => parseSavedEntriesResponse({ entries: [asRecord(body)?.entry] })?.[0] ?? null,
      failure: "The entry could not be saved.",
      success: (saved) => update({
        savedEntries: [saved, ...state.savedEntries.filter((entry) => entry.id !== saved.id && entry.sourceEntryId !== saved.sourceEntryId)],
        actionStatus: "Added to saved entries.",
      }),
    });
  }

  async function removeFromSavedEntries(savedEntryId: string) {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    await runAction({
      kind: "saved-entry-remove",
      id: savedEntryId,
      request: () => fetch(`/api/saved-entries/${encodeURIComponent(savedEntryId)}`, { method: "DELETE" }),
      parse: () => true,
      failure: "The saved entry could not be removed.",
      success: () => update({
        savedEntries: state.savedEntries.filter((entry) => entry.id !== savedEntryId),
        actionStatus: "Removed from saved entries.",
      }),
    });
  }

  async function trackSavedEntryNow(savedEntry: SavedEntry) {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const today = state.days.at(-1);
    if (!today) return;
    const consumedAt = mealDateTimestamp({ date: today.date, time: localTimeValue() }) ?? state.clockNow.getTime();
    const itemNames = savedEntry.items.map((item) => item.name).filter(Boolean);
    const name = itemNames[0] ?? (savedEntry.caption || "Saved entry");
    const optimisticId = (action: PendingAction) => `optimistic-saved-${action.token}`;
    await runAction({
      kind: "saved-entry-track",
      id: savedEntry.id,
      begin: (action) => {
        addMealToDate(today.date, {
          id: optimisticId(action),
          consumedAt,
          time: localTimeValue(),
          name,
          description: savedEntry.caption || itemNames.join(", ") || "Tracked from saved entries",
          calories: savedEntry.totalCalories,
          protein: savedEntry.totalProteinG,
          carbs: savedEntry.totalCarbsG,
          fat: savedEntry.totalFatG,
          items: savedEntry.items,
          pending: "copying",
          kind: mealKind(savedEntry.entryType),
        });
        return () => removeMealFromDays(optimisticId(action));
      },
      request: () => fetch(`/api/saved-entries/${encodeURIComponent(savedEntry.id)}/track`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumedAt }),
      }),
      parse: parseTrackedEntryResponse,
      failure: "The saved entry could not be tracked.",
      success: (parsed, action) => {
        reconcileMeal(optimisticId(action), parsed);
        update({ selectedDayKey: dayKeyForDate(today.date), olderDay: null, actionStatus: `Tracked “${name}”.` });
      },
    });
  }

  async function addMeal(event: Event) {
    event.preventDefault();
    if (readOnly || state.dataMode !== "live") return;
    if (state.pendingAction) return;
    update({ actionError: null });
    const formElement = event.currentTarget as HTMLFormElement;
    const form = new FormData(formElement);
    const photoEntry = form.get("photo");
    const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
    if (photo) {
      const photoError = mealPhotoError(photo);
      if (photoError) {
        update({ actionError: photoError });
        return;
      }
    }
    const name = String(form.get("name") || "New entry").trim();
    const description = String(form.get("description") || "Added from dashboard").trim();
    const calories = Number(form.get("calories") || 0);
    const protein = Number(form.get("protein") || 0);
    const carbs = Number(form.get("carbs") || 0);
    const fat = Number(form.get("fat") || 0);
    const nutrients = nutrientValuesFromForm(form);
    const nutrientProvenance = nutrientProvenanceFromForm(form, "nutrient-origin-", nutrients);
    const time = String(form.get("time") || "");
    const selectedDate = selectedDay().date;
    const consumedAt = mealDateTimestamp({ date: selectedDate, time });
    if (consumedAt === null) {
      update({ actionError: "Enter a valid entry time.", actionStatus: null });
      return;
    }
    const optimisticId = (action: PendingAction) => `optimistic-meal-${action.token}`;
    const nextMeal: Meal = {
      id: "",
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
        ...(Object.keys(nutrientProvenance).length > 0 ? { nutrientProvenance } : {}),
      }],
      pending: "creating",
      kind: mealKind(String(form.get("mealType") ?? "")),
    };
    const added = await runAction({
      kind: "meal-create",
      begin: (action) => {
        addMealToDate(selectedDate, { ...nextMeal, id: optimisticId(action) });
        return () => removeMealFromDays(optimisticId(action));
      },
      request: () => fetch("/api/meals", {
        method: "POST",
        ...mealRequestOptions(mealPayload(nextMeal, consumedAt), photo),
      }),
      parse: parseMealResponse,
      failure: "The entry could not be added.",
      invalid: "The added entry response was invalid.",
      success: (parsedMeal, action) => {
        reconcileMeal(optimisticId(action), parsedMeal);
        update({ actionStatus: "Entry added." });
      },
    });
    if (!added) return;
    update({ showAddMeal: false });
    formElement.reset();
  }

  function setWeightForDate(logicalDate: string, weight: DailyWeight | null) {
    updateLoadedDays((day) => (
      day.date === logicalDate ? { ...day, weight } : day
    ));
  }

  function openWeightEditor() {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const weight = selectedDay().weight;
    weightForm = null;
    update({ weightDraft: weight ? String(weight.weightKg) : "", showWeightForm: true, actionError: null });
  }

  async function saveWeight(event: Event) {
    event.preventDefault();
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const weightKg = Number(state.weightDraft);
    if (!Number.isFinite(weightKg) || weightKg < 1 || weightKg > 1_000) {
      update({ actionError: "Enter a weight between 1 and 1,000 kg." });
      return;
    }

    const selected = selectedDay();
    const logicalDate = selected.date;
    const previousWeight = selected.weight ?? null;
    await runAction({
      kind: "weight-save",
      id: logicalDate,
      begin: () => {
        setWeightForDate(logicalDate, { logicalDate, weightKg, recordedAt: state.clockNow.getTime() });
        return () => setWeightForDate(logicalDate, previousWeight);
      },
      request: () => fetch("/api/weights", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logicalDate, weightKg }),
      }),
      parse: parseWeightResponse,
      failure: "The weight could not be saved.",
      invalid: "The saved weight response was invalid.",
      success: (savedWeight) => {
        setWeightForDate(logicalDate, savedWeight);
        update({ weightDraft: String(savedWeight.weightKg), showWeightForm: false, actionStatus: "Weight saved." });
      },
    });
  }

  // The settings panel loads when the owner first opens it.
  let settingsPanel: SettingsPanel | null = null;
  let settingsPanelLoading = false;
  let settingsDraftVersion = 0;

  function setSettingsDraft(settingsDraft: SettingsDraft, changes: Partial<State> = {}) {
    settingsDraftVersion += 1;
    update({ settingsDraft, ...changes });
  }

  function loadSettingsPanel() {
    if (settingsPanel || settingsPanelLoading) return;
    settingsPanelLoading = true;
    void import("./settings-panel").then(({ createSettingsPanel }) => {
      settingsPanel = createSettingsPanel({
        getDraft: () => state.settingsDraft,
        setDraft: (change) => {
          state.settingsDraft = change(state.settingsDraft);
        },
        onSave: () => void saveSettings(),
        onClose: () => update({ showSettings: false }),
        getThemePreference: () => state.themePreference,
        onThemeChange: changeThemePreference,
        deviceTimeZone: browserZone,
      });
      update();
    });
  }

  async function openSettings() {
    if (readOnly || state.dataMode !== "live" || state.pendingAction) return;
    const action = beginAction("settings-load");
    if (!action) return;
    loadSettingsPanel();
    settingsPanel?.refreshAccount();
    // Until the saved settings arrive, suggest this device's timezone.
    setSettingsDraft(settingsDraftForTargets({
      targets: state.targets,
      proteinGoal: state.proteinGoal,
      timezone: browserZone,
      vitaminB6UsFnbAdultUlEnabled: state.vitaminB6UsFnbAdultUlEnabled,
      usFnbAdultUlEnabled: state.usFnbAdultUlEnabled,
    }), { showSettings: true, actionError: null, actionStatus: null });
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
        : state.proteinGoal.fixedTargetG ?? state.targets.proteinG;
      const nextProteinGoal = updateProteinGoalSettings({
        current: state.proteinGoal,
        mode: parsed.proteinGoalMode,
        fixedTargetG: fixedProteinG,
        gramsPerKg: parsed.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
      });
      const nextTargets = {
        calories: Number.isFinite(parsed.calories) ? parsed.calories : activeCalorieTarget(),
        proteinG: fixedProteinG,
        nutrients: parsed.nutrients,
      };
      setSettingsDraft(settingsDraftForTargets({
        targets: nextTargets,
        proteinGoal: nextProteinGoal,
        timezone: parsed.timezone ?? browserZone,
        vitaminB6UsFnbAdultUlEnabled: parsed.vitaminB6UsFnbAdultUlEnabled,
        usFnbAdultUlEnabled: parsed.usFnbAdultUlEnabled,
        publicViewEnabled: parsed.publicViewEnabled,
      }), {
        targets: nextTargets,
        proteinGoal: nextProteinGoal,
        vitaminB6UsFnbAdultUlEnabled: parsed.vitaminB6UsFnbAdultUlEnabled,
        usFnbAdultUlEnabled: parsed.usFnbAdultUlEnabled,
      });
    } catch (error) {
      if (!isCurrentAction(action)) return;
      update({ actionError: error instanceof Error ? error.message : "The current targets could not be loaded." });
    } finally {
      finishAction(action);
    }
  }

  async function saveSettings() {
    if (readOnly || state.dataMode !== "live") return;
    if (state.pendingAction) return;
    const settingsDraft = state.settingsDraft;
    const calories = Number(settingsDraft.calories);
    const proteinG = Number(settingsDraft.proteinG);
    const proteinPerKg = Number(settingsDraft.proteinPerKg);
    if (!Number.isFinite(calories) || calories < 1) {
      update({ actionError: "Enter a calorie target greater than zero." });
      return;
    }
    if (settingsDraft.proteinGoalMode === "grams" && (!Number.isFinite(proteinG) || proteinG < 1)) {
      update({ actionError: "Enter a fixed protein target greater than zero." });
      return;
    }
    if (settingsDraft.proteinGoalMode === "gramsPerKg" && !isValidProteinPerKg(proteinPerKg)) {
      update({ actionError: `Enter a protein target between ${PROTEIN_PER_KG_MIN} and ${PROTEIN_PER_KG_MAX} g/kg.` });
      return;
    }
    const invalidNutrientGoal = Object.entries(settingsDraft.nutrients).find(([, value]) => {
      if (!value.trim()) return false;
      const parsed = Number(value);
      return !Number.isFinite(parsed) || parsed <= 0;
    });
    if (invalidNutrientGoal) {
      update({ actionError: "Nutrition goals must be greater than zero or left blank." });
      return;
    }
    const nutrientTargetOverrides = nutrientGoalOverridesFromDraft(settingsDraft.nutrients);
    const nutrientTargets = resolveNutrientGoals(nutrientTargetOverrides);

    const previous = {
      targets: state.targets,
      vitaminB6UsFnbAdultUlEnabled: state.vitaminB6UsFnbAdultUlEnabled,
      usFnbAdultUlEnabled: state.usFnbAdultUlEnabled,
    };
    const fixedProteinG = Number.isFinite(proteinG) && proteinG > 0 ? proteinG : null;
    const draftTargets = { calories, proteinG: fixedProteinG ?? state.targets.proteinG, nutrients: nutrientTargets };
    await runAction({
      kind: "settings-save",
      begin: () => {
        update({
          targets: draftTargets,
          vitaminB6UsFnbAdultUlEnabled: settingsDraft.vitaminB6UsFnbAdultUlEnabled,
          usFnbAdultUlEnabled: settingsDraft.usFnbAdultUlEnabled,
        });
        return () => update(previous);
      },
      request: () => fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timezone: settingsDraft.timezone,
          dailyCalorieTarget: calories,
          dailyProteinTargetG: fixedProteinG,
          proteinGoalMode: settingsDraft.proteinGoalMode,
          dailyProteinTargetPerKg: isValidProteinPerKg(proteinPerKg) ? proteinPerKg : null,
          nutrientTargets: nutrientTargetOverrides,
          vitaminB6UsFnbAdultUlEnabled: settingsDraft.vitaminB6UsFnbAdultUlEnabled,
          usFnbAdultUlEnabled: settingsDraft.usFnbAdultUlEnabled,
          ...(settingsDraft.publicViewEnabled === null ? {} : { publicViewEnabled: settingsDraft.publicViewEnabled }),
        }),
      }),
      // A response without readable settings still counts as saved; the draft values stay.
      parse: (body) => ({ saved: parseSettingsTargets(body) }),
      failure: "The targets could not be saved.",
      success: ({ saved }) => update({
        targets: saved && Number.isFinite(saved.calories)
          ? { calories: saved.calories, proteinG: Number.isFinite(saved.proteinG) ? saved.proteinG : draftTargets.proteinG, nutrients: saved.nutrients }
          : draftTargets,
        vitaminB6UsFnbAdultUlEnabled: saved?.vitaminB6UsFnbAdultUlEnabled ?? settingsDraft.vitaminB6UsFnbAdultUlEnabled,
        usFnbAdultUlEnabled: saved?.usFnbAdultUlEnabled ?? settingsDraft.usFnbAdultUlEnabled,
        showSettings: false,
        actionStatus: "Targets saved.",
      }),
    });
  }

  /** Close the editors and forms of the day in view, before another day replaces it. */
  function resetDayEditing(changes: Partial<State> = {}) {
    historicalMealRequest += 1;
    setEditState(emptyMealEditState<Meal>(), {
      historicalMeal: null,
      historicalMealLoadingId: null,
      historicalMealError: null,
      mealPhotoDrafts: {},
      showAddMeal: false,
      showWeightForm: false,
      ...changes,
    });
  }

  function selectDay(key: DayKey) {
    if (state.pendingAction) return;
    olderDayRequest += 1;
    resetDayEditing({ olderDayLoadingDate: null, olderDay: null, selectedDayKey: key });
  }

  /** Load a day before the seven recent days and show it as the selected day. */
  async function loadOlderDay(date: string) {
    const requestId = olderDayRequest + 1;
    olderDayRequest = requestId;
    update({ olderDayLoadingDate: date, actionError: null, actionStatus: null });
    try {
      const endpoint = publicView
        ? `/api/public/summary?view=day&date=${date}`
        : `/api/days/${date}?timezone=${encodeURIComponent(displayTimeZone())}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(responseBody, "The day could not be loaded."));
      const parsed = parseDayLog(responseBody);
      if (!parsed || parsed.date !== date) throw new Error("The day response was invalid.");
      if (olderDayRequest !== requestId || state.pendingAction) return;
      const meals = parsed.meals.map((meal) => mapRemoteMeal(meal, { publicView, timeZone: displayTimeZone() }));
      resetDayEditing({
        olderDay: {
          day: dayWithMeals({ key: dayKeyForDate(date), date, ...dayLabelForDate(date), calories: 0, protein: 0, meals: [], weight: parsed.weight }, meals),
          proteinGoal: parsed.proteinGoal,
        },
      });
    } catch (error) {
      if (olderDayRequest !== requestId) return;
      update({ actionError: error instanceof Error ? error.message : "The day could not be loaded." });
    } finally {
      if (olderDayRequest === requestId) update({ olderDayLoadingDate: null });
    }
  }

  function selectDate(date: string) {
    if (state.pendingAction || date > todayDate()) return;
    const recentDay = state.days.find((day) => day.date === date);
    if (recentDay) selectDay(recentDay.key);
    else if (state.dataMode === "live") void loadOlderDay(date);
  }

  function scrollToElement(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function loadHistoricalMeal(entryId: string, date: string) {
    if (readOnly || state.pendingAction || state.historicalMealLoadingId) return;
    const requestId = historicalMealRequest + 1;
    historicalMealRequest = requestId;
    setEditState(emptyMealEditState<Meal>(), {
      historicalMealLoadingId: entryId,
      historicalMealError: null,
      historicalMeal: null,
      mealPhotoDrafts: {},
    });
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(entryId)}`, { cache: "no-store" });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiErrorMessage(responseBody, "The historical entry could not be loaded."));
      }
      const parsedMeal = parseMealResponse(responseBody);
      if (!parsedMeal) throw new Error("The historical entry response was invalid.");
      const mappedMeal = mapRemoteMeal(parsedMeal, { publicView: false, timeZone: displayTimeZone() });
      const mappedDate = dateKeyInTimeZone(mappedMeal.consumedAt, displayTimeZone());
      if (mappedDate !== date) throw new Error("The historical entry date no longer matches the insight.");
      if (historicalMealRequest !== requestId) return;
      setEditState(beginMealEdit(mappedMeal), { historicalMeal: mappedMeal });
      scrollToElement("historical-meal-editor");
    } catch (error) {
      if (historicalMealRequest !== requestId) return;
      update({ historicalMealError: error instanceof Error ? error.message : "The historical entry could not be loaded." });
    } finally {
      if (historicalMealRequest === requestId) update({ historicalMealLoadingId: null });
    }
  }

  function inspectInsightEntry(entryId: string, date: string) {
    if (readOnly || state.pendingAction) return;
    const day = state.days.find((candidate) => candidate.date === date);
    const meal = day?.meals.find((candidate) => candidate.id === entryId);
    if (day && meal) {
      selectDay(day.key);
      openMealEditor(meal);
      scrollToElement("meals");
      return;
    }
    if (state.insightHistory?.entries.some((entry) => entry.id === entryId && entry.date === date)) {
      void loadHistoricalMeal(entryId, date);
    }
  }

  function compareFoodForNutrient(nutrient: NutrientKey) {
    update({ focusedInsightNutrient: nutrient });
    scrollToElement("nutrient-food-scenarios");
  }

  function moveSelectedDay(direction: "previous" | "next") {
    selectDate(shiftDateKey(selectedDay().date, direction === "previous" ? -1 : 1));
  }

  const changeTrendRange = (trendRange: TrendRangeDays) => update({ trendRange });

  // Forms keep what the user typed, so each one is built once and stays the same node while it is open.
  let addMealForm: HTMLFormElement | null = null;
  let weightForm: HTMLFormElement | null = null;
  let calendar: ReturnType<typeof createHistoryCalendar> | null = null;
  const openNutritionDetails = new Set<string>();
  // A photo element is kept between renders so the browser does not load and decode it again.
  let photoElements = new Map<string, HTMLImageElement>();

  function setDisabled(container: HTMLElement, disabled: boolean) {
    for (const control of container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button")) control.disabled = disabled;
  }

  function buildAddMealForm(): HTMLFormElement {
    const time = localTimeValue();
    const numberField = ({ label, name, placeholder, required = false }: { label: string; name: string; placeholder: string; required?: boolean }) =>
      h("label", null, label, h("input", { name, type: "number", min: "0", step: "any", placeholder, required }));
    return h("form", { class: "add-meal-form", onsubmit: (event: Event) => void addMeal(event) },
      h("div", { class: "form-heading" },
        h("div", null, h("strong", null, "Log an entry"), h("span", null, "Use a quick estimate now. You can edit it later.")),
        h("label", null, "Time", h("input", { name: "time", type: "time", value: time, required: true, "aria-label": "Entry time" })),
        h("label", null, "Type", h("select", { name: "mealType", value: mealKindForTime(time), "aria-label": "Entry type" }, mealKindOptions())),
        h("button", { class: "close-button", type: "button", onclick: () => update({ showAddMeal: false }), "aria-label": "Close add entry form" }, "×"),
      ),
      h("label", null, "Entry name", h("input", { name: "name", placeholder: "e.g. Turkey sandwich", required: true })),
      h("label", { class: "wide-field" }, "Description", h("input", { name: "description", placeholder: "Ingredients or a short note" })),
      numberField({ label: "Calories", name: "calories", placeholder: "450", required: true }),
      numberField({ label: "Protein (g)", name: "protein", placeholder: "30" }),
      numberField({ label: "Carbs (g)", name: "carbs", placeholder: "45" }),
      numberField({ label: "Fat (g)", name: "fat", placeholder: "15" }),
      mealNutritionEditor({ namePrefix: "nutrient-" }),
      h("label", { class: "meal-photo-field" }, "Photo (optional)", h("input", { name: "photo", type: "file", accept: mealPhotoAccept }), h("small", null, "JPEG, PNG, or WebP · up to 10 MB")),
      h("button", { class: "save-button", type: "submit" }, "Save entry"),
    );
  }

  function buildWeightForm(): HTMLFormElement {
    return h("form", { class: "weight-form", onsubmit: (event: Event) => void saveWeight(event) },
      h("label", null, "Weight (kg)", h("input", {
        name: "weightKg",
        type: "number",
        min: "1",
        max: "1000",
        step: "0.1",
        inputmode: "decimal",
        value: state.weightDraft,
        oninput: (event: Event) => {
          state.weightDraft = (event.target as HTMLInputElement).value;
        },
        required: true,
      })),
      h("button", { class: "save-button", type: "submit" }),
      h("button", { class: "cancel-button", type: "button", onclick: () => update({ showWeightForm: false }) }, "Cancel"),
    );
  }

  /** Apply the pending state to the open forms. Their fields are not built again. */
  function syncForms(view: View) {
    const { pending, actionInProgress } = view;
    if (addMealForm) {
      const creating = pending?.kind === "meal-create";
      addMealForm.className = cx("add-meal-form", creating && "is-pending");
      addMealForm.setAttribute("aria-busy", String(creating));
      setDisabled(addMealForm, actionInProgress);
      const save = addMealForm.querySelector<HTMLButtonElement>(".save-button")!;
      save.setAttribute("aria-busy", String(creating));
      save.textContent = creating ? "Saving…" : "Save entry";
    }
    if (weightForm) {
      weightForm.setAttribute("aria-busy", String(view.weightActionPending));
      setDisabled(weightForm, actionInProgress);
      const save = weightForm.querySelector<HTMLButtonElement>(".save-button")!;
      save.setAttribute("aria-busy", String(view.weightActionPending));
      save.textContent = view.weightActionPending ? "Saving…" : view.selectedWeight ? "Save changes" : "Save weight";
    }
    for (const { mealId, editor } of editors.values()) {
      editor.sync({
        disabled: actionInProgress,
        saving: pending?.kind === "meal-save" && pending.id === mealId,
        photoName: state.mealPhotoDrafts[mealId]?.name ?? null,
      });
    }
  }

  function topbar(view: View) {
    const live = state.dataMode === "live";
    return h("header", { class: "topbar" },
      h("a", { class: "brand", href: "#today", "aria-label": readOnly ? "Calocount public view" : "Calocount home" },
        h("span", { class: "brand-mark", "aria-hidden": "true" }, h("span"), h("span"), h("span")),
        h("span", null, "calocount"),
      ),
      h("div", { class: "topbar-actions" },
        h("span", { class: "sync-status" }, h("span", { class: "status-dot", "aria-hidden": "true" }), ` ${readOnly ? "Public read-only" : live ? "Live data" : state.dataMode === "loading" ? "Loading" : "Unavailable"}`),
        readOnly ? h("a", { class: "secondary-button owner-link", href: "/owner" }, "Open owner view") : null,
        !readOnly && live ? h("button", { class: "icon-button", type: "button", onclick: () => void openSettings(), disabled: view.actionInProgress, "aria-label": "Open settings", "aria-expanded": state.showSettings, "aria-controls": "settings-panel", "aria-busy": view.settingsLoadPending },
          view.settingsLoadPending
            ? h("span", { "aria-hidden": "true" }, "…")
            : svg("svg", { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "aria-hidden": "true" },
              svg("path", { d: "M2 4.5h6.5M13 4.5h1M2 11.5h1M7.5 11.5H14" }),
              svg("circle", { cx: "10.75", cy: "4.5", r: "2" }),
              svg("circle", { cx: "5.25", cy: "11.5", r: "2" }),
            ),
        ) : null,
        h("span", { class: "avatar", "aria-label": readOnly ? "Public read-only view" : "Account" }, h("span", { "aria-hidden": "true" }, readOnly ? "↗" : "M")),
      ),
    );
  }

  function banners(view: View) {
    const { dataMode, dataMessage, actionError, actionStatus, summaryTimeZone } = state;
    const feedback = actionError ?? view.pendingLabel ?? view.olderDayLabel ?? actionStatus;
    return [
      dataMessage ? h("div", { class: `data-banner ${dataMode}`, role: "status" }, h("span", { "aria-hidden": "true" }, dataMode === "live" ? "✓" : dataMode === "loading" ? "…" : "i"), dataMessage) : null,
      readOnly && dataMode === "live" ? h("div", { class: "data-banner public", role: "status" },
        h("span", { "aria-hidden": "true" }, "✓"),
        `Public read-only view — changes are disabled.${summaryTimeZone && summaryTimeZone !== browserZone ? ` Days and times are shown in ${summaryTimeZone.replaceAll("_", " ")} time.` : ""}`,
      ) : null,
      feedback ? h("div", { class: `action-feedback ${actionError ? "error" : ""}`, role: actionError ? "alert" : "status", "aria-live": "polite", "aria-busy": view.actionInProgress || state.olderDayLoadingDate !== null }, feedback) : null,
    ];
  }

  function dashboardStateSection() {
    const loading = state.dataMode === "loading";
    return h("section", { class: "dashboard-state", "aria-live": "polite" },
      h("span", { class: "dashboard-state-mark", "aria-hidden": "true" }, loading ? "…" : "!"),
      h("h1", null, loading
        ? publicView ? "Loading public dashboard" : "Loading your saved log"
        : publicView ? "Public dashboard unavailable" : "Your dashboard is unavailable"),
      h("p", null, state.dataMessage ?? (publicView
        ? "The public dashboard could not be loaded."
        : "Your saved log is unavailable. Try again later.")),
      state.dataMode === "error" ? h("button", { class: "primary-button", type: "button", onclick: retryDashboard, disabled: state.dashboardLoading, "aria-busy": state.dashboardLoading }, state.dashboardLoading ? "Loading…" : "Try again") : null,
    );
  }

  function dateStrip(view: View) {
    const { selected, actionInProgress } = view;
    return h("section", { class: "date-strip", "aria-label": "Choose a day" },
      h("div", { class: "date-heading" },
        h("p", { class: "eyebrow" }, "Your log"),
        h("h1", { id: "today" }, `${selected.weekday}, ${fullDateLabel(selected.date)}`),
        selected.date === view.today ? h("span", { class: "today-chip" }, "Today") : null,
      ),
      h("div", { class: "date-controls" },
        h("button", { class: "date-arrow", type: "button", onclick: () => moveSelectedDay("previous"), "aria-label": "Previous day", disabled: actionInProgress }, "‹"),
        h("div", { class: "date-pills" }, state.days.map((day) => h("button", {
          class: cx("date-pill", selected.date === day.date && "active", day.meals.length > 0 && "has-entries"),
          type: "button",
          onclick: () => selectDay(day.key),
          disabled: actionInProgress,
          "aria-label": `${day.weekday}, ${fullDateLabel(day.date)}`,
          "aria-pressed": selected.date === day.date,
        }, h("span", null, dayLabels[day.key]), h("strong", null, day.shortDate)))),
        h("button", { class: "date-arrow", type: "button", onclick: () => moveSelectedDay("next"), "aria-label": "Next day", disabled: actionInProgress || !view.hasNextDay }, "›"),
        h("button", { class: cx("date-arrow calendar-toggle", state.showCalendar && "active"), type: "button", onclick: () => update({ showCalendar: !state.showCalendar }), "aria-label": state.showCalendar ? "Close calendar" : "Open calendar", "aria-expanded": state.showCalendar, "aria-controls": "history-calendar" },
          svg("svg", { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
            svg("rect", { x: "2", y: "3.5", width: "12", height: "10.5", rx: "2" }),
            svg("path", { d: "M2 7h12M5.5 2v3M10.5 2v3" }),
          ),
        ),
      ),
    );
  }

  function jumpNav() {
    return h("nav", { class: "jump-nav", "aria-label": "Dashboard sections" }, sections.map((section) => {
      const active = state.activeSection === section;
      return h("a", { class: active ? "active" : "", href: `#${section}`, "aria-current": active ? "page" : undefined }, sectionLabels[section]);
    }));
  }

  function summaryGrid(view: View) {
    const { selected, calorieGoal, activeProteinTarget, remainingCalories, averageComparison } = view;
    const caloriePercent = calculateTargetPercent(selected.calories, calorieGoal);
    const labelRow = (dot: string, label: string) => h("div", { class: "card-label-row" }, h("span", { class: `metric-dot ${dot}`, "aria-hidden": "true" }), h("span", { class: "card-label" }, label));
    const proteinCard = () => {
      if (activeProteinTarget === null) {
        return h("div", { class: "summary-copy protein-goal-unavailable" },
          labelRow("protein-dot", "Protein"),
          h("p", { class: "metric-value" }, "Goal unavailable"),
          h("p", { class: "metric-subtitle" }, "Record a weight to calculate your daily protein goal."),
          readOnly
            ? h("span", { class: "protein-goal-hint" }, "Record a weight in the owner dashboard.")
            : h("a", { class: "secondary-button protein-goal-link", href: "#weight", onclick: () => openWeightEditor() }, "Record weight"),
        );
      }
      const proteinPercent = calculateTargetPercent(selected.protein, activeProteinTarget);
      return [
        h("div", { class: "summary-copy" },
          labelRow("protein-dot", "Protein"),
          h("p", { class: "metric-value" }, `${formatNumber(Math.round(selected.protein))}g `, h("span", null, `/ ${formatNumber(Math.round(activeProteinTarget))}g`)),
          h("p", { class: "metric-subtitle" }, view.remainingProteinLabel),
          view.proteinWeightSource ? h("span", { class: "protein-goal-hint" }, view.proteinWeightSource) : null,
        ),
        metricRing({ className: "protein-ring", percent: proteinPercent, label: `${proteinPercent} percent of protein target` }),
      ];
    };
    return h("section", { class: "summary-grid", "aria-label": "Daily calorie and protein summary" },
      h("article", { class: "summary-card calories-card" },
        h("div", { class: "summary-copy" },
          labelRow("calorie-dot", "Calories"),
          h("p", { class: "metric-value" }, `${formatNumber(Math.round(selected.calories))} `, h("span", null, `/ ${formatNumber(Math.round(calorieGoal))}`)),
          h("p", { class: `metric-subtitle ${remainingCalories < 0 ? "over" : ""}` },
            remainingCalories >= 0 ? `${formatNumber(Math.round(remainingCalories))} kcal left today` : `${formatNumber(Math.round(Math.abs(remainingCalories)))} kcal over target`),
        ),
        metricRing({ className: `calorie-ring${remainingCalories < 0 ? " is-over" : ""}`, percent: caloriePercent, label: `${caloriePercent} percent of calorie target` }),
      ),

      h("article", { class: "summary-card protein-card" }, proteinCard()),

      h("article", { class: "summary-card average-card" },
        h("div", null,
          labelRow("average-dot", "7 day average"),
          h("p", { class: "metric-value" }, `${formatNumber(Math.round(view.averageCalories))} `, h("span", null, "kcal")),
          h("p", { class: `metric-subtitle ${averageComparison.direction === "above" ? "over" : "positive"}` },
            averageComparison.direction === "at"
              ? "At your target average"
              : [h("span", { "aria-hidden": "true" }, averageComparison.direction === "below" ? "↘" : "↗"), ` ${averageComparison.percentage}% ${averageComparison.direction} your target`]),
        ),
        h("div", { class: "mini-bars", "aria-hidden": "true" }, view.sevenDayValues.map((day) => h("span", { class: day.date === selected.date ? "is-selected" : undefined, style: { height: `${Math.max(22, (day.value / 2600) * 100)}%` } }))),
      ),
    );
  }

  function calorieTrendPanel(view: View) {
    const { calorieGoal, selected } = view;
    const { values, scale } = view.calorieChart;
    const range = state.trendRange;
    return h("section", { class: "panel chart-panel", id: "trend", "aria-labelledby": "trend-title" },
      panelHeading({ eyebrow: "A quick view", title: "Calorie trend", titleId: "trend-title" }, trendRangeSelect({ value: range, onChange: changeTrendRange, label: "Calorie trend" })),
      h("div", { class: "chart-legend" }, h("span", null, h("i", { class: "legend-swatch calorie-swatch" }), " Calories"), h("span", null, h("i", { class: "legend-line" }), ` Target ${formatNumber(calorieGoal)}`)),
      h("div", { class: cx("bar-chart", range === 30 && "is-month"), role: "group", "aria-label": `Calorie intake for the past ${range} days compared with a ${calorieGoal} calorie target` },
        h("div", { class: "chart-y-axis", "aria-hidden": "true" }, scale.tickValues.map((value) => h("span", null, formatChartTick(value)))),
        h("div", { class: "chart-plot" },
          h("div", { class: "target-line", style: { top: `${scale.targetLineTopPercent}%` } }, h("span", null, formatNumber(calorieGoal))),
          gridLines(),
          h("div", { class: "bars" }, values.map((day, index) => h("button", { key: day.date, class: cx("bar-column", day.date === selected.date && "is-selected"), type: "button", "aria-label": `${day.label}: ${day.value.toLocaleString()} kilocalories` },
            h("span", { class: "bar-value" }, day.value.toLocaleString()),
            h("span", { class: cx("bar", day.value <= 0 && "bar-empty"), style: { height: day.value > 0 ? `${Math.max(12, scale.valueHeightPercents[index] ?? 0)}%` : "0" } }),
            h("span", null, showTrendDateLabel(index, values.length) ? day.label : ""),
          ))),
        ),
      ),
    );
  }

  function weightTrendPanel(view: View) {
    const chart = view.weightChart;
    const range = state.trendRange;
    const change = chart.weeklyChange;
    return h("section", { class: "panel chart-panel weight-trend-panel", "aria-labelledby": "weight-trend-title" },
      panelHeading({ eyebrow: "A quick view", title: "Weight trend", titleId: "weight-trend-title" }, trendRangeSelect({ value: range, onChange: changeTrendRange, label: "Weight trend" })),
      chart.hasData ? [
        h("div", { class: "chart-legend weight-chart-legend" },
          h("span", null, h("i", { class: "legend-swatch weight-swatch" }), " Daily weight"),
          h("span", null, h("i", { class: "legend-line weight-average-line" }), " 7-day average"),
          change === null ? null : h("span", { class: "weight-change" }, `${change > 0 ? "+" : ""}${formatWeight(change)} kg vs 7 days earlier`),
        ),
        h("div", { class: cx("bar-chart weight-chart", range === 30 && "is-month"), role: "group", "aria-label": `Recorded weight for the past ${range} days in kilograms; missing days are shown as gaps` },
          h("div", { class: "chart-y-axis", "aria-hidden": "true" }, chart.scale.tickValues.map((value) => h("span", null, formatWeight(value)))),
          h("div", { class: "chart-plot" },
            gridLines(),
            svg("svg", { class: "weight-line", viewBox: "0 0 100 100", preserveAspectRatio: "none", "aria-hidden": "true" },
              svg("defs", null, svg("linearGradient", { id: "weight-area-fill", x1: "0", y1: "0", x2: "0", y2: "1" }, svg("stop", { class: "weight-area-start", offset: "0" }), svg("stop", { class: "weight-area-end", offset: "1" }))),
              chart.averageLine.length > 1 ? svg("polygon", { class: "weight-area", points: `${chart.averageLine.join(" ")} ${chart.averageLine.at(-1)?.split(",")[0]},100 ${chart.averageLine[0].split(",")[0]},100` }) : null,
              chart.lineSegments.map((points) => points.length > 1 ? svg("polyline", { class: "weight-raw-line", points: points.join(" ") }) : null),
              chart.averageLine.length > 1 ? svg("polyline", { class: "weight-average-path", points: chart.averageLine.join(" ") }) : null,
            ),
            h("div", { class: "weight-points" }, chart.values.map((day, index) => h("button", {
              key: day.date,
              class: cx("weight-point-column", day.value === null && "missing", day.date === view.selected.date && "is-selected"),
              type: "button",
              "aria-label": day.value === null ? `${day.label}: no weight recorded` : `${day.label}: ${formatWeight(day.value)} kilograms`,
            },
              h("span", { class: "weight-tooltip" }, day.value === null ? "No record" : `${formatWeight(day.value)} kg`),
              day.value === null ? null : h("span", { class: "weight-point", style: { bottom: `calc(21px + ${(chart.scale.valueHeightPercents[index * 2] ?? 0) * 0.902}%)` }, "aria-hidden": "true" }),
              h("span", null, showTrendDateLabel(index, chart.values.length) ? day.label : ""),
            ))),
          ),
        ),
      ] : h("div", { class: "chart-empty", role: "status" }, h("strong", null, `No weight records for the past ${range} days`), h("span", null, "Record a daily weight to see your trend.")),
    );
  }

  function macroTrendPanel(view: View) {
    const values = view.macroTrend;
    const range = state.trendRange;
    return h("section", { class: "panel chart-panel macro-trend-panel", "aria-labelledby": "macro-trend-title" },
      panelHeading({ eyebrow: "A quick view", title: "Macros trend", titleId: "macro-trend-title" }, trendRangeSelect({ value: range, onChange: changeTrendRange, label: "Macros trend" })),
      values.some((day) => day.hasData) ? [
        h("div", { class: "chart-legend macro-trend-legend" },
          h("span", null, h("i", { class: "legend-swatch macro-carbs-swatch" }), " Carbs"),
          h("span", null, h("i", { class: "legend-swatch macro-protein-swatch" }), " Protein"),
          h("span", null, h("i", { class: "legend-swatch macro-fat-swatch" }), " Fat"),
        ),
        h("div", { class: cx("macro-trend-chart", range === 30 && "is-month"), role: "group", "aria-label": `Calorie-weighted carbohydrate, protein, and fat split for the past ${range} days; days without macro data are shown as gaps` },
          h("div", { class: "macro-trend-y-axis", "aria-hidden": "true" }, h("span", null, "100%"), h("span", null, "50%"), h("span", null, "0%")),
          h("div", { class: "macro-trend-plot" },
            h("div", { class: "macro-mid-line", "aria-hidden": "true" }),
            h("div", { class: "macro-trend-bars" }, values.map((day, index) => {
              const { carbs, protein, fat } = day.percentages;
              return h("button", {
                key: day.date,
                class: cx("macro-trend-column", !day.hasData && "missing", day.date === view.selected.date && "is-selected"),
                type: "button",
                "aria-label": day.hasData
                  ? `${day.label}: ${carbs}% carbohydrates, ${protein}% protein, ${fat}% fat`
                  : `${day.label}: no macro data`,
              },
                h("span", { class: "macro-tooltip" }, day.hasData ? `${carbs}% C · ${protein}% P · ${fat}% F` : "No data"),
                h("div", { class: "macro-stack", title: day.hasData ? `${carbs}% carbs · ${protein}% protein · ${fat}% fat` : "No macro data" },
                  day.hasData ? [
                    h("span", { class: "macro-segment fat", style: { height: `${fat}%` } }),
                    h("span", { class: "macro-segment protein", style: { height: `${protein}%` } }),
                    h("span", { class: "macro-segment carbs", style: { height: `${carbs}%` } }),
                  ] : h("span", { class: "macro-gap", "aria-hidden": "true" }, "—"),
                ),
                h("span", null, showTrendDateLabel(index, values.length) ? day.label : ""),
              );
            })),
          ),
        ),
      ] : h("div", { class: "chart-empty", role: "status" }, h("strong", null, `No macro records for the past ${range} days`), h("span", null, "Add protein, carbs, or fat to an entry to see the daily split.")),
    );
  }

  function weightPanel(view: View) {
    const { selectedWeight, weightActionPending, actionInProgress } = view;
    const { latestAverage, weeklyChange } = view.weightChart;
    const saving = weightActionPending ? h("span", { class: "pending-indicator", role: "status" }, "Saving…") : null;
    return h("section", { class: "panel weight-panel compact-dashboard-panel", id: "weight", "aria-labelledby": "weight-title" },
      panelHeading({ eyebrow: "Daily check-in", title: "Weight", titleId: "weight-title", className: "panel-heading weight-heading" },
        !readOnly
          ? h("button", { class: "primary-button", type: "button", disabled: actionInProgress, "aria-busy": weightActionPending, onclick: openWeightEditor }, weightActionPending ? "Saving…" : selectedWeight ? "Edit weight" : "Add weight")
          : h("span", { class: "panel-meta" }, "read only"),
      ),
      h("div", { class: cx("weight-reading", !selectedWeight && "empty", weightActionPending && "is-pending"), "aria-busy": weightActionPending },
        selectedWeight ? [
          h("strong", null, `${formatWeight(selectedWeight.weightKg)} `, h("small", null, "kg")),
          h("time", { datetime: new Date(selectedWeight.recordedAt).toISOString() }, `Saved at ${formatRecordedTime(selectedWeight.recordedAt, view.timeZone)}`),
          saving,
        ] : [
          h("strong", null, "No weight recorded"),
          h("span", null, `Add one value for ${view.selected.weekday}.`),
          saving,
        ],
      ),
      latestAverage === null ? null : h("div", { class: "weight-facts" },
        h("div", null, h("span", null, "7-day average"), h("strong", null, `${formatWeight(latestAverage)} `, h("small", null, "kg"))),
        weeklyChange === null ? null : h("div", null, h("span", null, "vs 7 days earlier"), h("strong", null, `${weeklyChange > 0 ? "+" : ""}${formatWeight(weeklyChange)} `, h("small", null, "kg"))),
      ),
      weightForm,
    );
  }

  function macroPanel(view: View) {
    const { selected } = view;
    const percentages = calculateMacroPercentages({ carbsG: selected.carbs ?? 0, proteinG: selected.protein, fatG: selected.fat ?? 0 });
    const hasData = percentages.carbs + percentages.protein + percentages.fat > 0;
    const gradient = hasData
      ? `conic-gradient(var(--chart-green) 0 ${percentages.protein}%, var(--chart-blue) ${percentages.protein}% ${percentages.protein + percentages.carbs}%, var(--chart-orange) ${percentages.protein + percentages.carbs}% 100%)`
      : "var(--chart-base)";
    const legendRow = ({ key, label, grams, percent }: { key: string; label: string; grams: number; percent: number }) =>
      h("div", null, h("span", { class: `macro-key ${key}` }), h("span", null, label), h("small", null, `${formatNumber(Math.round(grams))} g`), h("strong", null, `${percent}%`));
    return h("section", { class: "panel macro-panel compact-dashboard-panel", "aria-labelledby": "macros" },
      panelHeading({ eyebrow: "Daily split", title: "Macros", titleId: "macros", className: "panel-heading compact-heading" }, h("span", { class: "panel-meta" }, "per day")),
      h("div", { class: "macro-donut", style: { background: gradient }, role: "img", "aria-label": `Estimated daily macro split: ${percentages.carbs} percent carbohydrates, ${percentages.protein} percent protein, ${percentages.fat} percent fat` },
        h("div", null, h("strong", null, formatNumber(Math.round(selected.calories))), h("span", null, "kcal")),
      ),
      h("div", { class: "macro-legend" },
        legendRow({ key: "carbs", label: "Carbs", grams: selected.carbs ?? 0, percent: percentages.carbs }),
        legendRow({ key: "protein", label: "Protein", grams: selected.protein, percent: percentages.protein }),
        legendRow({ key: "fat", label: "Fat", grams: selected.fat ?? 0, percent: percentages.fat }),
      ),
    );
  }

  function historyPanel(view: View) {
    const { showAllDays } = state;
    const streak = view.loggingStreak;
    return h("section", { class: "panel history-panel compact-dashboard-panel", "aria-labelledby": "history-title" },
      panelHeading({ eyebrow: "Keep the thread", title: "Recent days", titleId: "history-title", className: "panel-heading compact-heading" },
        h("button", { class: "more-button", type: "button", onclick: () => update({ showAllDays: !state.showAllDays }) }, showAllDays ? "Less" : "View all"),
      ),
      h("div", { class: "history-list" }, state.days.slice(showAllDays ? 0 : 3).reverse().map((day) => h("button", { class: `history-row ${view.selected.date === day.date ? "selected" : ""}`, type: "button", onclick: () => selectDay(day.key), disabled: view.actionInProgress },
        h("span", { class: "history-date" }, h("strong", null, day.shortDate), h("small", null, day.weekday.slice(0, 3))),
        h("span", { class: "history-bar" }, h("i", { style: { width: `${calculateTargetPercent(day.calories, view.calorieGoal)}%` } })),
        h("span", { class: "history-calories" }, formatNumber(day.calories), h("small", null, " kcal")),
        h("span", { class: "history-chevron", "aria-hidden": "true" }, "›"),
      ))),
      state.olderDay ? null : h("div", { class: "streak-line" }, h("span", { class: "streak-flame", "aria-hidden": "true" }, "✦"), h("span", null, h("strong", null, `${streak} day${streak === 1 ? "" : "s"}`), " logging streak")),
    );
  }

  function savedEntriesPanel(view: View) {
    const { savedEntries } = state;
    const { pending, actionInProgress } = view;
    return h("section", { class: "panel saved-entries-panel", "aria-labelledby": "saved-entries-title" },
      panelHeading({ eyebrow: "Your go-tos", title: ["Saved entries ", h("span", null, savedEntries.length)], titleId: "saved-entries-title", className: "panel-heading saved-entry-heading" }),
      savedEntries.length === 0
        ? h("div", { class: "saved-entries-empty" }, h("strong", null, "No saved entries yet"), h("span", null, "Use “Add to saved entries” on any entry to keep it handy here."))
        : h("div", { class: "saved-entry-list" }, savedEntries.map((entry) => {
          const name = entry.items[0]?.name || entry.caption || "Saved entry";
          const isTracking = pending?.kind === "saved-entry-track" && pending.id === entry.id;
          const isRemoving = pending?.kind === "saved-entry-remove" && pending.id === entry.id;
          return h("div", { class: "saved-entry-row", key: entry.id, "aria-busy": isTracking || isRemoving },
            h("div", null, h("strong", null, name), h("span", null, `${formatNumber(entry.totalCalories)} kcal · ${formatNumber(entry.totalProteinG)}g protein`)),
            h("div", { class: "saved-entry-actions" },
              h("button", { class: "track-button", type: "button", disabled: actionInProgress, onclick: () => void trackSavedEntryNow(entry), "aria-busy": isTracking }, isTracking ? "Tracking…" : "Track now"),
              h("button", { class: "remove-saved-entry-button", type: "button", disabled: actionInProgress, onclick: () => void removeFromSavedEntries(entry.id), "aria-busy": isRemoving }, isRemoving ? "Removing…" : "Remove"),
            ),
          );
        })),
    );
  }

  function photoElement(meal: Meal, kept: Map<string, HTMLImageElement>) {
    const photoUrl = meal.photoUrl as string;
    const key = `${meal.id}|${photoUrl}|${meal.name}`;
    // Native images let the browser lazy-load private and public R2-backed routes.
    const image = photoElements.get(key) ?? keep(h("img", { class: "meal-photo", src: photoUrl, alt: meal.name, loading: "lazy", decoding: "async", onerror: () => markPhotoUnavailable(photoUrl) }));
    kept.set(key, image);
    return image;
  }

  /** The nutrition details of an entry. Opening them changes this one element, not the whole list of entries. */
  function nutritionDetailsFor(meal: Meal): HTMLElement {
    return mealNutritionDetails({
      meal,
      open: openNutritionDetails.has(meal.id),
      onToggle: (event) => {
        if (!openNutritionDetails.delete(meal.id)) openNutritionDetails.add(meal.id);
        const shown = (event.currentTarget as HTMLElement).parentElement;
        if (shown) patch(shown, nutritionDetailsFor(meal));
      },
    });
  }

  function mealGroup(meal: Meal, view: View, keptPhotos: Map<string, HTMLImageElement>) {
    const { pending, actionInProgress, selected } = view;
    const hasPhoto = Boolean(meal.photoUrl && !state.failedPhotoUrls.has(meal.photoUrl));
    const busy = Boolean(meal.pending || pending?.id === meal.id);
    const indicator = (label: string) => h("span", { class: "pending-indicator", role: "status" }, label);
    const actionOn = (kind: PendingActionKind) => pending?.kind === kind && pending.id === meal.id;
    const stat = (className: string, label: string, value: number, unit: string) =>
      h("div", { class: `meal-stat ${className}` }, h("span", { class: "meal-stat-label" }, label), h("span", null, `${formatNumber(value)} `, h("small", null, unit)));
    const saved = state.savedEntries.some((entry) => entry.sourceEntryId === meal.id || entry.id === meal.savedEntryId);
    const deleting = pending?.kind === "meal-delete";
    const copying = pending?.kind === "meal-copy";
    const duplicating = pending?.kind === "meal-duplicate";
    const editing = state.mealEditState.editingMealId === meal.id;
    return h("div", { class: "meal-group", key: meal.id },
      h("div", { class: cx("meal-row", !hasPhoto && "without-photo", busy && "is-pending"), "aria-busy": busy },
        h("div", { class: cx("meal-row-content", !hasPhoto && "without-photo") },
          hasPhoto ? h("button", {
            class: "meal-photo-button",
            type: "button",
            "aria-label": `View photo of ${meal.name}`,
            onpointerdown: (event: Event) => event.stopPropagation(),
            onclick: (event: Event) => {
              event.stopPropagation();
              update({ previewMeal: meal });
            },
          }, photoElement(meal, keptPhotos)) : null,
          h("div", { class: "meal-info" },
            h("div", { class: "meal-name-line" },
              h("strong", null, meal.name),
              h("time", null, meal.time),
              meal.kind ? h("span", { class: "meal-kind", "data-kind": meal.kind }, mealKindLabels[meal.kind]) : null,
              meal.pending === "creating" ? indicator("Saving…") : null,
              meal.pending === "copying" ? indicator("Copying…") : null,
              meal.pending === "duplicating" ? indicator("Duplicating…") : null,
              actionOn("meal-save") ? indicator("Saving…") : null,
              actionOn("meal-delete") ? indicator("Deleting…") : null,
              actionOn("meal-copy") ? indicator("Copying…") : null,
              actionOn("meal-duplicate") ? indicator("Duplicating…") : null,
            ),
            meal.description.trim().toLocaleLowerCase() !== meal.name.trim().toLocaleLowerCase() ? h("span", null, meal.description) : null,
          ),
          h("div", { class: "meal-macros", "aria-label": "Entry macros" },
            stat("calories-stat", "Energy", meal.calories, "kcal"),
            stat("protein-stat", "Protein", meal.protein, "g"),
            stat("carbs-stat", "Carbs", meal.carbs ?? 0, "g"),
            stat("fat-stat", "Fat", meal.fat ?? 0, "g"),
          ),
        ),
        h("div", { class: "meal-row-footer" },
          nutritionDetailsFor(meal),
          !readOnly ? h("div", { class: "meal-actions", id: `meal-actions-${meal.id}` },
            h("button", { class: "save-entry-button", type: "button", disabled: actionInProgress || saved, onclick: () => void addToSavedEntries(meal.id), "aria-label": `Add ${meal.name} to saved entries` }, saved ? "Saved" : "Add to saved entries"),
            selected.date !== state.days.at(-1)?.date ? h("button", { class: "copy-button", type: "button", disabled: actionInProgress || deleting || copying, onclick: () => void copyMeal(meal.id, { toToday: true }), "aria-label": `Copy ${meal.name} to today`, "aria-busy": actionOn("meal-copy") }, actionOn("meal-copy") ? "Copying…" : "Copy to today") : null,
            h("button", { class: "duplicate-button", type: "button", disabled: actionInProgress || deleting || copying || duplicating, onclick: () => void copyMeal(meal.id, { toToday: false }), "aria-label": `Duplicate ${meal.name}`, "aria-busy": actionOn("meal-duplicate") }, actionOn("meal-duplicate") ? "Duplicating…" : "Duplicate"),
            h("button", {
              class: "edit-button",
              type: "button",
              disabled: actionInProgress || deleting || copying || duplicating,
              onclick: () => {
                if (state.mealEditState.editingMealId === meal.id) cancelMealEditor(meal.id);
                else openMealEditor(meal);
              },
              "aria-expanded": editing,
              "aria-label": `Edit ${meal.name}`,
            }, "Edit"),
            h("button", { class: "delete-button", type: "button", disabled: actionInProgress || deleting || copying || duplicating, onclick: () => void deleteMeal(meal.id), "aria-label": `Delete ${meal.name}`, "aria-busy": actionOn("meal-delete") }, actionOn("meal-delete") ? "Deleting…" : "Delete"),
          ) : null,
        ),
      ),
      !readOnly && editing ? editorFor({ meal, idPrefix: "edit-", itemsHint: "Values stay with each item in this meal." }).el : null,
    );
  }

  function mealsPanel(view: View) {
    const { selected, pending, actionInProgress } = view;
    const creating = pending?.kind === "meal-create";
    const keptPhotos = new Map<string, HTMLImageElement>();
    for (const id of openNutritionDetails) if (!selected.meals.some((meal) => meal.id === id)) openNutritionDetails.delete(id);
    const panel = h("section", { class: cx("panel meals-panel", readOnly && "meals-panel-read-only"), id: "meals", "aria-labelledby": "meals-title" },
      panelHeading({ eyebrow: "What you consumed", title: ["Entries ", h("span", null, selected.meals.length)], titleId: "meals-title", className: "panel-heading meal-heading" },
        !readOnly
          ? h("button", { class: "primary-button", type: "button", disabled: actionInProgress, "aria-busy": creating, onclick: () => update({ showAddMeal: !state.showAddMeal }) }, h("span", { "aria-hidden": "true" }, "＋"), ` ${creating ? "Saving…" : "Add entry"}`)
          : h("span", { class: "panel-meta" }, "read only"),
      ),
      addMealForm,
      selected.meals.length > 0
        ? h("div", { class: "meal-list" }, selected.meals.map((meal) => mealGroup(meal, view, keptPhotos)))
        : h("div", { class: "empty-meals" },
          h("span", { class: "empty-icon", "aria-hidden": "true" }, readOnly ? "·" : "＋"),
          h("strong", null, `No entries logged for ${selected.weekday}`),
          h("span", null, readOnly ? "No entries were logged for this day." : "Tap “Add entry” to record what you consumed."),
        ),
      h("div", { class: "entries-estimate-note", "aria-label": "Calocount tip" }, h("span", { class: "tip-icon", "aria-hidden": "true" }, "i"), h("p", null, h("strong", null, "Estimates are a starting point."), " Add a description to your photo for a more useful result.")),
      h("div", { class: "meal-total" }, h("span", null, `Total for ${selected.weekday}`), h("strong", null, `${formatNumber(selected.calories)} `, h("small", null, "kcal"), " ", h("i"), ` ${formatNumber(selected.protein)}g `, h("small", null, "protein"))),
    );
    photoElements = keptPhotos;
    return panel;
  }

  function insightsHeading() {
    const collapsed = state.insightsCollapsed;
    return h("div", { class: "nutrition-overview-heading insights-overview-heading" },
      h("div", null, h("p", { class: "eyebrow" }, "Longer-term patterns"), h("h2", { id: "insights-title" }, "Insights")),
      h("div", { class: "nutrition-overview-actions" },
        h("span", { class: "panel-meta" }, "historical patterns"),
        h("button", {
          type: "button",
          class: "nutrition-section-toggle",
          "aria-expanded": !collapsed,
          "aria-controls": "nutrition-insights-content insights-overview-content",
          onclick: () => update({ insightsCollapsed: !state.insightsCollapsed }),
        }, collapsed ? "Show insights" : "Hide insights", h("span", { "aria-hidden": "true" }, collapsed ? "⌄" : "⌃")),
      ),
    );
  }

  function historicalEntrySections(view: View) {
    const { historicalMeal, historicalMealError, historicalMealLoadingId } = state;
    const heading = (title: string) => h("div", { class: "panel-heading compact-heading" }, h("div", null, h("p", { class: "eyebrow" }, "Entry inspection"), h("h2", null, title)), h("span", { class: "panel-meta" }, "owner only"));
    return [
      historicalMealLoadingId ? h("section", { class: "panel historical-meal-editor", id: "historical-meal-editor", "aria-live": "polite", role: "status" },
        heading("Loading historical entry"),
        h("p", { class: "historical-meal-editor__message" }, "Loading the original entry so its nutrient values can be inspected and edited safely."),
      ) : null,
      historicalMealError ? h("section", { class: "panel historical-meal-editor", id: "historical-meal-editor", "aria-live": "polite", role: "alert" },
        heading("Historical entry unavailable"),
        h("p", { class: "historical-meal-editor__message" }, historicalMealError),
        h("button", { class: "cancel-button", type: "button", onclick: () => update({ historicalMealError: null }) }, "Dismiss"),
      ) : null,
      !readOnly && historicalMeal ? h("section", { class: "panel historical-meal-editor", id: "historical-meal-editor", "aria-labelledby": "historical-meal-editor-title" },
        h("div", { class: "panel-heading historical-meal-editor__heading" },
          h("div", null,
            h("p", { class: "eyebrow" }, "Entry inspection"),
            h("h2", { id: "historical-meal-editor-title" }, "Edit historical entry"),
            h("span", { class: "historical-meal-editor__date" }, `${fullDateLabel(dateKeyInTimeZone(historicalMeal.consumedAt, view.timeZone))} · ${historicalMeal.name}`),
          ),
          h("button", { class: "close-button", type: "button", disabled: view.actionInProgress, onclick: () => cancelMealEditor(historicalMeal.id), "aria-label": "Close historical entry editor" }, "×"),
        ),
        h("p", { class: "historical-meal-editor__message" }, "This entry is outside the seven-day dashboard editor. It was loaded from your owner history; changes use the same saved meal endpoint and recalculate the insight after refresh."),
        editorFor({ meal: historicalMeal, idPrefix: "historical-edit-", itemsHint: "Values stay with each item in this historical entry.", className: "inline-editor historical-meal-editor__form" }).el,
      ) : null,
    ];
  }

  let previewClose: HTMLButtonElement | null = null;

  function photoPreview() {
    const meal = state.previewMeal;
    previewClose = null;
    if (!meal) return null;
    const photoUrl = meal.photoUrl;
    previewClose = keep(h("button", { class: "close-button photo-preview-close", type: "button", onclick: () => update({ previewMeal: null }), "aria-label": "Close photo preview" }, "×"));
    return h("div", {
      class: "photo-preview-backdrop",
      role: "presentation",
      onclick: (event: Event) => {
        if (event.target === event.currentTarget) update({ previewMeal: null });
      },
    },
      h("div", { class: "photo-preview-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "photo-preview-title" },
        previewClose,
        h("div", { class: "photo-preview-media" },
          photoUrl && !state.failedPhotoUrls.has(photoUrl)
            ? h("img", { class: "photo-preview-image", src: photoUrl, alt: meal.name, decoding: "async", onerror: () => markPhotoUnavailable(photoUrl) })
            : h("p", { class: "photo-preview-fallback", role: "status" }, "Photo unavailable"),
        ),
        h("p", { class: "photo-preview-title", id: "photo-preview-title" }, meal.name),
      ),
    );
  }

  /** The page below the banners while data is loaded. Each slot holds one part and swaps it when its inputs change. */
  function createLiveView() {
    const slots = {
      dateStrip: slot(), calendar: slot(), jumpNav: slot(), summary: slot(), calorieTrend: slot(), proteinTarget: slot(),
      weightTrend: slot(), macroTrend: slot(), consistency: slot(), nutrition: slot(), weight: slot(), macros: slot(),
      history: slot(), savedEntries: slot(), meals: slot(), insightsHeading: slot(), historicalEntry: slot(), preview: slot(),
    };
    const foodContribution = createFoodContributionChart();
    const nutrientTrend = createNutrientTrendPanel();
    const attention = createNutritionAttention();
    const foodScenarios = createNutrientFoodScenarios();
    const daysWorthRepeating = createDaysWorthRepeating();
    const weeklyChanges = createWeeklyChanges();
    const frequencyPortion = createFrequencyPortion();

    // The two containers hold the slots and the panels with state. They go into the page as they are.
    const contentGrid = keep(h("div", { class: "content-grid" },
      h("section", { class: "primary-column" },
        slots.calorieTrend.anchors, slots.proteinTarget.anchors, slots.weightTrend.anchors, slots.macroTrend.anchors,
        foodContribution.el,
        slots.consistency.anchors, slots.nutrition.anchors, slots.weight.anchors, slots.macros.anchors, slots.history.anchors,
        slots.savedEntries.anchors, slots.meals.anchors,
      ),
    ));
    const nutritionInsights = h("div", { class: "nutrition-insights-content", id: "nutrition-insights-content" }, attention.el, foodScenarios.el, slots.historicalEntry.anchors);
    const insightsOverview = h("div", { class: "insights-overview-content", id: "insights-overview-content" }, daysWorthRepeating.el, weeklyChanges.el, frequencyPortion.el);
    const insights = keep(h("section", { class: "insights-overview", "aria-labelledby": "insights-title" }, slots.insightsHeading.anchors, nutritionInsights, insightsOverview));

    const selectCalendarDate = (date: string) => {
      selectDate(date);
      update({ showCalendar: false });
    };
    const closeCalendar = () => update({ showCalendar: false });

    return {
      nodes: [slots.dateStrip.anchors, slots.calendar.anchors, slots.jumpNav.anchors, slots.summary.anchors, contentGrid, insights, slots.preview.anchors] as Child[],
      update(view: View) {
        const { selected, pending, actionInProgress, insightData } = view;
        const { targets, proteinGoal, trendRange } = state;

        if (!state.showAddMeal || readOnly) addMealForm = null;
        else addMealForm ??= keep(buildAddMealForm());
        if (!state.showWeightForm || readOnly) weightForm = null;
        else weightForm ??= keep(buildWeightForm());
        if (!state.showCalendar) {
          calendar?.destroy();
          calendar = null;
        } else {
          calendar ??= createHistoryCalendar({ selectedDate: selected.date });
        }

        slots.dateStrip.update([selected.date, selected.weekday, view.today, state.days, actionInProgress, state.showCalendar], () => dateStrip(view));
        slots.calendar.update([calendar], () => calendar?.el);
        calendar?.update({
          today: view.today,
          selectedDate: selected.date,
          timeZone: view.timeZone,
          publicView,
          refreshKey: state.dashboardReloadKey,
          disabled: actionInProgress,
          onSelectDate: selectCalendarDate,
          onClose: closeCalendar,
        });
        slots.jumpNav.update([state.activeSection], jumpNav);
        slots.summary.update([
          selected.date, selected.calories, selected.protein, view.calorieGoal, view.activeProteinTarget, view.remainingProteinLabel,
          view.proteinWeightSource, view.averageCalories, view.sevenDayValues,
        ], () => summaryGrid(view));

        contentGrid.className = cx("content-grid", state.showAllDays && "history-expanded");
        slots.calorieTrend.update([view.calorieChart, view.calorieGoal, trendRange, selected.date], () => calorieTrendPanel(view));
        slots.proteinTarget.update([view.labelledTrendDays, selected.date, proteinGoal, view.activeProteinTarget, trendRange], () => proteinTargetChart({
          days: view.labelledTrendDays,
          selectedDate: selected.date,
          goalByDate: proteinGoal.byDate,
          fallbackTarget: proteinGoal.mode === "grams" ? view.activeProteinTarget : null,
          range: trendRange,
          onRangeChange: changeTrendRange,
        }));
        slots.weightTrend.update([view.weightChart, trendRange, selected.date], () => weightTrendPanel(view));
        slots.macroTrend.update([view.macroTrend, trendRange, selected.date], () => macroTrendPanel(view));
        foodContribution.update({ days: view.foodContributionDays, visibleDates: view.visibleTrendDates });
        slots.consistency.update([view.labelledTrendDays, selected.date, targets.nutrients], () => nutrientConsistencyMatrix({ days: view.labelledTrendDays, selectedDate: selected.date, goals: targets.nutrients }));
        slots.nutrition.update([selected.nutrients, selected.carbs, selected.fat, targets.nutrients, state.nutritionCollapsed], () => nutritionOverview({
          values: selected.nutrients,
          carbsG: selected.carbs,
          fatG: selected.fat,
          goals: targets.nutrients,
          collapsed: state.nutritionCollapsed,
          onToggle: toggleNutritionSection,
          children: nutrientTrend.el,
        }));
        nutrientTrend.update({ byDate: view.nutrientTrendByDate, selectedDate: selected.date, goals: targets.nutrients, range: trendRange, onRangeChange: changeTrendRange });
        slots.weight.update([view.selectedWeight, actionInProgress, view.weightActionPending, selected.weekday, view.weightChart, weightForm, view.timeZone], () => weightPanel(view));
        slots.macros.update([selected.carbs, selected.protein, selected.fat, selected.calories], () => macroPanel(view));
        slots.history.update([state.days, state.showAllDays, selected.date, actionInProgress, view.calorieGoal, state.olderDay === null, view.loggingStreak], () => historyPanel(view));
        slots.savedEntries.update([readOnly, state.savedEntries, pending], () => readOnly ? null : savedEntriesPanel(view));
        slots.meals.update([
          selected, pending, state.savedEntries, state.failedPhotoUrls, addMealForm, state.mealEditState.editingMealId, editorsVersion,
          state.days.at(-1)?.date,
        ], () => mealsPanel(view));

        slots.insightsHeading.update([state.insightsCollapsed], insightsHeading);
        nutritionInsights.hidden = state.insightsCollapsed;
        insightsOverview.hidden = state.insightsCollapsed;
        attention.update({
          days: insightData.days,
          entries: insightData.entries,
          currentDate: view.dashboardDate,
          goals: targets.nutrients,
          referenceSettings: view.referenceSettings,
          onInspectEntry: readOnly ? undefined : inspectInsightEntry,
          onSelectFoodChange: compareFoodForNutrient,
        });
        foodScenarios.update({ entries: insightData.entries, currentDate: view.dashboardDate, goals: targets.nutrients, focusedNutrient: state.focusedInsightNutrient });
        slots.historicalEntry.update([state.historicalMealLoadingId, state.historicalMealError, state.historicalMeal, editorsVersion, actionInProgress, view.timeZone], () => historicalEntrySections(view));
        daysWorthRepeating.update({
          days: insightData.days,
          entries: insightData.entries,
          currentDate: view.dashboardDate,
          calorieTarget: targets.calories,
          proteinGoals: proteinGoal.byDate,
          fallbackProteinTarget: proteinGoal.mode === "grams" ? proteinGoal.fixedTargetG : null,
          nutrientGoals: targets.nutrients,
        });
        weeklyChanges.update({ days: insightData.days, entries: insightData.entries, currentDate: view.dashboardDate });
        frequencyPortion.update({ days: insightData.days, entries: insightData.entries, currentDate: view.dashboardDate });

        slots.preview.update([state.previewMeal, state.failedPhotoUrls], photoPreview);
      },
    };
  }

  const topbarSlot = slot();
  const settingsSlot = slot();
  const bannerSlot = slot();
  const bodySlot = slot();
  let liveView: ReturnType<typeof createLiveView> | null = null;
  let settingsShown = "";

  /** Drop the forms and panels of the loaded page. They start again when data loads. */
  function closeLiveView() {
    liveView = null;
    calendar?.destroy();
    calendar = null;
    addMealForm = null;
    weightForm = null;
    editors.clear();
    editorsVersion += 1;
    openNutritionDetails.clear();
    photoElements = new Map();
  }

  let themeApplied: ThemePreference | null = null;
  let stopThemeSync = () => {};
  let previewShown: Meal | null = null;
  let closePreview: (() => void) | null = null;

  /** Close the photo preview on Escape, and give the focus back when it closes. */
  function syncPhotoPreview() {
    if (state.previewMeal === previewShown) return;
    closePreview?.();
    closePreview = null;
    previewShown = state.previewMeal;
    if (!previewShown) return;
    const previousFocus = document.activeElement;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") update({ previewMeal: null });
    };
    document.addEventListener("keydown", closeOnEscape);
    previewClose?.focus();
    closePreview = () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }

  function render() {
    const view = derive();
    const live = state.dataMode === "live";

    topbarSlot.update([state.dataMode, view.actionInProgress, state.showSettings, view.settingsLoadPending], () => topbar(view));

    const showSettings = !readOnly && live && state.showSettings;
    settingsSlot.update([showSettings, settingsPanel], () => showSettings ? settingsPanel?.el ?? h("p", { role: "status" }, "Loading settings…") : null);
    const settingsState = showSettings && settingsPanel ? `${view.settingsLoadPending}|${view.settingsSavePending}|${settingsDraftVersion}` : "";
    if (settingsState && settingsState !== settingsShown) settingsPanel?.render({ loading: view.settingsLoadPending, saving: view.settingsSavePending });
    settingsShown = settingsState;

    bannerSlot.update([
      state.dataMessage, state.dataMode, state.summaryTimeZone, view.pendingLabel, view.olderDayLabel, state.actionStatus, state.actionError,
      view.actionInProgress, state.olderDayLoadingDate,
    ], () => banners(view));

    if (live) liveView ??= createLiveView();
    else if (liveView) closeLiveView();
    const shown = liveView;
    bodySlot.update(shown ? [shown] : [state.dataMode, state.dataMessage, state.dashboardLoading], () => shown ? shown.nodes : dashboardStateSection());
    shown?.update(view);
    syncForms(view);

    if (themeApplied !== state.themePreference) {
      stopThemeSync();
      themeApplied = state.themePreference;
      stopThemeSync = subscribeToTheme(themeApplied, document.documentElement, window.matchMedia("(prefers-color-scheme: light)"));
    }
    syncPhotoPreview();
    loadDashboardWhenStale(view.dashboardDate);
  }

  function syncSectionFromHash() {
    const section = window.location.hash.slice(1) as DashboardSection;
    update({ activeSection: sections.includes(section) ? section : "today" });
  }

  const stopClock = scheduleDashboardClock({
    now: () => new Date(),
    onTick: (clockNow) => update({ clockNow }),
  });
  let refreshFrame: number | null = null;
  const refreshClock = () => {
    if (document.hidden || refreshFrame !== null) return;
    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = null;
      update({ clockNow: new Date(), dashboardReloadKey: state.dashboardReloadKey + 1 });
    });
  };
  window.addEventListener("focus", refreshClock);
  document.addEventListener("visibilitychange", refreshClock);
  window.addEventListener("hashchange", syncSectionFromHash);

  root.replaceChildren(
    ...topbarSlot.anchors, ...settingsSlot.anchors, ...bannerSlot.anchors, ...bodySlot.anchors,
    h("footer", { class: "app-footer" },
      h("span", null, readOnly ? "Public read-only view" : "Private by default"),
      h("span", { class: "footer-separator", "aria-hidden": "true" }, "·"),
      h("span", null, "Calocount dashboard"),
    ),
  );
  const section = window.location.hash.slice(1) as DashboardSection;
  state.activeSection = sections.includes(section) ? section : "today";
  render();

  return () => {
    stopped = true;
    stopClock();
    if (refreshFrame !== null) window.cancelAnimationFrame(refreshFrame);
    window.removeEventListener("focus", refreshClock);
    document.removeEventListener("visibilitychange", refreshClock);
    window.removeEventListener("hashchange", syncSectionFromHash);
    cancelDashboardLoad?.();
    closePreview?.();
    stopThemeSync();
    closeLiveView();
  };
}
