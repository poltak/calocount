"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from "react";

import {
  calculateLoggingStreak,
  calculateMacroPercentages,
  calculateTargetPercent,
  compareAverageToTarget,
  getAdjacentDayKey,
} from "./dashboard-calculations";
import { getMealSwipeAction } from "./meal-swipe";
import { photoUrlForKey } from "./photo-url";

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
  meals: Meal[];
};

type SerializedMealItem = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
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
  items: SerializedMealItem[];
};

type DashboardSummary = {
  date: string;
  targets: { calories: number | null; proteinG: number | null };
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
};

type DataMode = "loading" | "live" | "demo";
type DashboardSection = "today" | "meals" | "trend" | "plan";
type MealSwipeStart = {
  mealId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

const calorieTarget = 2400;
const proteinTarget = 160;

// This dataset is used only when the local API is unauthenticated or has no D1 binding.
const demoDays: Day[] = [
  {
    key: "sun",
    date: "2025-06-08",
    shortDate: "8",
    weekday: "Sunday",
    calories: 2280,
    protein: 148,
    meals: [],
  },
  {
    key: "mon",
    date: "2025-06-09",
    shortDate: "9",
    weekday: "Monday",
    calories: 2490,
    protein: 164,
    meals: [],
  },
  {
    key: "tue",
    date: "2025-06-10",
    shortDate: "10",
    weekday: "Tuesday",
    calories: 2170,
    protein: 151,
    meals: [],
  },
  {
    key: "wed",
    date: "2025-06-11",
    shortDate: "11",
    weekday: "Wednesday",
    calories: 2360,
    protein: 158,
    meals: [],
  },
  {
    key: "thu",
    date: "2025-06-12",
    shortDate: "12",
    weekday: "Thursday",
    calories: 1860,
    protein: 131,
    meals: [
      {
        id: "breakfast",
        time: "08:10",
        name: "Greek yogurt bowl",
        description: "Greek yogurt, blueberries, granola, honey",
        calories: 420,
        protein: 31,
        kind: "breakfast",
      },
      {
        id: "lunch",
        time: "12:35",
        name: "Chicken rice bowl",
        description: "Grilled chicken, jasmine rice, avocado, greens",
        calories: 680,
        protein: 48,
        kind: "lunch",
      },
      {
        id: "snack",
        time: "15:50",
        name: "Apple and peanut butter",
        description: "One apple with two tablespoons peanut butter",
        calories: 290,
        protein: 8,
        kind: "snack",
      },
      {
        id: "dinner",
        time: "19:20",
        name: "Salmon soba plate",
        description: "Miso salmon, soba noodles, edamame, cucumber",
        calories: 470,
        protein: 44,
        kind: "dinner",
      },
    ],
  },
  {
    key: "fri",
    date: "2025-06-13",
    shortDate: "13",
    weekday: "Friday",
    calories: 2420,
    protein: 166,
    meals: [],
  },
  {
    key: "sat",
    date: "2025-06-14",
    shortDate: "14",
    weekday: "Saturday",
    calories: 2310,
    protein: 154,
    meals: [],
  },
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

function parseSerializedMeal(value: unknown): SerializedMeal | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string") return null;
  const consumedAt = numberOr(record.consumedAt, Number.NaN);
  if (!Number.isFinite(consumedAt)) return null;
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        const itemRecord = asRecord(item);
        if (!itemRecord || typeof itemRecord.name !== "string") return [];
        return [{
          name: itemRecord.name,
          calories: numberOr(itemRecord.calories),
          proteinG: numberOr(itemRecord.proteinG),
          carbsG: numberOr(itemRecord.carbsG),
          fatG: numberOr(itemRecord.fatG),
        }];
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
    items,
  };
}

function parseDashboardSummary(value: unknown): DashboardSummary | null {
  const record = asRecord(value);
  const targets = asRecord(record?.targets);
  const today = asRecord(record?.today);
  const sevenDay = asRecord(record?.sevenDay);
  if (!record || typeof record.date !== "string" || !today || !sevenDay) return null;
  const recentMeals = Array.isArray(record.recentMeals)
    ? record.recentMeals.flatMap((meal) => {
        const parsed = parseSerializedMeal(meal);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    date: record.date,
    targets: {
      calories: targets && typeof targets.calories === "number" ? targets.calories : null,
      proteinG: targets && typeof targets.proteinG === "number" ? targets.proteinG : null,
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
  };
}

function dateKeyFromTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
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

function mealKind(value: string | null): Meal["kind"] {
  if (value === "breakfast" || value === "lunch" || value === "dinner") return value;
  return "snack";
}

function mapRemoteMeal(meal: SerializedMeal): Meal {
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
    photoKey: meal.photoKey,
    photoMimeType: meal.photoMimeType,
    kind,
  };
}

function buildLiveDays(summary: DashboardSummary): Day[] {
  const summaryDate = new Date(`${summary.date}T12:00:00.000Z`);
  const mealsByDate = new Map<string, Meal[]>();
  for (const serializedMeal of summary.recentMeals) {
    const key = dateKeyFromTimestamp(serializedMeal.consumedAt);
    const meals = mealsByDate.get(key) ?? [];
    meals.push(mapRemoteMeal(serializedMeal));
    mealsByDate.set(key, meals);
  }
  return Array.from({ length: 7 }, (_, index) => {
    const parsedDate = new Date(summaryDate.getTime() - (6 - index) * 86_400_000);
    const date = parsedDate.toISOString().slice(0, 10);
    const labels = dayLabelForDate(date);
    const meals = mealsByDate.get(date) ?? [];
    const isToday = date === summary.date;
    return {
      key: dayKeyForDate(date),
      date,
      ...labels,
      calories: isToday ? summary.today.calories : meals.reduce((total, meal) => total + meal.calories, 0),
      protein: isToday ? summary.today.proteinG : meals.reduce((total, meal) => total + meal.protein, 0),
      carbs: isToday ? summary.today.carbsG : meals.reduce((total, meal) => total + (meal.carbs ?? 0), 0),
      fat: isToday ? summary.today.fatG : meals.reduce((total, meal) => total + (meal.fat ?? 0), 0),
      meals,
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
    items: [{
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

function mealDateTimestamp(date: string) {
  return new Date(`${date}T12:00:00.000Z`).getTime();
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
  };
}

export default function Home() {
  const [days, setDays] = useState(demoDays);
  const [selectedDayKey, setSelectedDayKey] = useState<DayKey>("thu");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>("today");
  const [settingsDraft, setSettingsDraft] = useState({ calories: String(calorieTarget), proteinG: String(proteinTarget) });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const settingsSaveInFlight = useRef(false);
  const settingsReadVersion = useRef(0);
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>("loading");
  const [targets, setTargets] = useState({ calories: calorieTarget, proteinG: proteinTarget });
  const [dataMessage, setDataMessage] = useState<string | null>("Loading your saved log — local demo data is visible until it arrives.");
  const [actionState, setActionState] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingMealId, setDeletingMealId] = useState<string | null>(null);
  const [previewMeal, setPreviewMeal] = useState<Meal | null>(null);
  const [failedPhotoKeys, setFailedPhotoKeys] = useState<Set<string>>(() => new Set());
  const mealDeleteInFlight = useRef<string | null>(null);
  const mealSwipeRef = useRef<MealSwipeStart | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const actionInProgress = Boolean(actionState?.endsWith("…"));

  const selectedDay = days.find((day) => day.key === selectedDayKey) ?? days[4];
  const totalCalories = selectedDay.calories;
  const totalProtein = selectedDay.protein;
  const activeCalorieTarget = targets.calories ?? calorieTarget;
  const activeProteinTarget = targets.proteinG ?? proteinTarget;
  const remainingCalories = activeCalorieTarget - totalCalories;
  const remainingProtein = activeProteinTarget - totalProtein;

  const chartValues = useMemo(
    () => days.map((day) => ({ label: `${day.weekday.slice(0, 3)} ${day.shortDate}`, value: day.calories })),
    [days],
  );

  const averageCalories = useMemo(
    () => chartValues.length === 0 ? 0 : Math.round(chartValues.reduce((total, day) => total + day.value, 0) / chartValues.length),
    [chartValues],
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

  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard/summary", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setDataMode("demo");
            setDataMessage(response.status === 503
              ? "Demo mode — no D1 database binding is available, so changes stay local."
              : response.status === 401
                ? "Demo mode — sign in to load your saved meals. Changes stay local for now."
                : "Demo mode — saved data is unavailable, so changes stay local.");
          }
          return;
        }
        const parsed = parseDashboardSummary(await response.json());
        if (!parsed) throw new Error("invalid_dashboard_summary");
        if (cancelled) return;
        const liveDays = buildLiveDays(parsed);
        setTargets({
          calories: parsed.targets.calories ?? calorieTarget,
          proteinG: parsed.targets.proteinG ?? proteinTarget,
        });
        setDays(liveDays);
        setSelectedDayKey(dayKeyForDate(parsed.date));
        setDataMode("live");
        setDataMessage(null);
      } catch {
        if (!cancelled) {
          setDataMode("demo");
          setDataMessage("Demo mode — the saved log could not be reached, so changes stay local.");
        }
      }
    }
    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncSectionFromHash() {
      const section = window.location.hash.slice(1);
      if (section === "today" || section === "meals" || section === "trend" || section === "plan") {
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
    const swipe = mealSwipeRef.current;
    if (!swipe || swipe.mealId !== mealId || swipe.pointerId !== event.pointerId) return;
    mealSwipeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function markPhotoUnavailable(photoKey: string) {
    setFailedPhotoKeys((current) => {
      if (current.has(photoKey)) return current;
      const next = new Set(current);
      next.add(photoKey);
      return next;
    });
  }

  function updateMeal(mealId: string, changes: Partial<Meal>) {
    setDays((currentDays) =>
      currentDays.map((day) => {
        if (day.key !== selectedDayKey) return day;
        const nextMeals = day.meals.map((meal) => (meal.id === mealId ? { ...meal, ...changes } : meal));
        return {
          ...day,
          meals: nextMeals,
          calories: nextMeals.reduce((total, meal) => total + meal.calories, 0),
          protein: nextMeals.reduce((total, meal) => total + meal.protein, 0),
          carbs: nextMeals.reduce((total, meal) => total + (meal.carbs ?? 0), 0),
          fat: nextMeals.reduce((total, meal) => total + (meal.fat ?? 0), 0),
        };
      }),
    );
  }

  function replaceRemoteMeal(remoteMeal: SerializedMeal) {
    const nextMeal = mapRemoteMeal(remoteMeal);
    const date = dateKeyFromTimestamp(remoteMeal.consumedAt);
    setDays((currentDays) => currentDays.map((day) => {
      if (day.date !== date) return day;
      const meals = day.meals.some((meal) => meal.id === nextMeal.id)
        ? day.meals.map((meal) => meal.id === nextMeal.id ? nextMeal : meal)
        : [...day.meals, nextMeal];
      return {
        ...day,
        meals,
        calories: meals.reduce((total, meal) => total + meal.calories, 0),
        protein: meals.reduce((total, meal) => total + meal.protein, 0),
        carbs: meals.reduce((total, meal) => total + (meal.carbs ?? 0), 0),
        fat: meals.reduce((total, meal) => total + (meal.fat ?? 0), 0),
      };
    }));
  }

  function removeMealFromDays(mealId: string) {
    setDays((currentDays) => currentDays.map((day) => {
      const meals = day.meals.filter((meal) => meal.id !== mealId);
      if (meals.length === day.meals.length) return day;
      return {
        ...day,
        meals,
        calories: meals.reduce((total, meal) => total + meal.calories, 0),
        protein: meals.reduce((total, meal) => total + meal.protein, 0),
        carbs: meals.reduce((total, meal) => total + (meal.carbs ?? 0), 0),
        fat: meals.reduce((total, meal) => total + (meal.fat ?? 0), 0),
      };
    }));
  }

  async function saveMeal(mealId: string) {
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    if (!meal) return;
    setActionError(null);
    if (dataMode !== "live") {
      setEditingMealId(null);
      return;
    }
    setActionState("Saving changes…");
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(meal.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mealPayload(meal)),
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be saved."));
      }
      const parsedMeal = parseMealResponse(responseBody);
      if (!parsedMeal) throw new Error("The saved meal response was invalid.");
      replaceRemoteMeal(parsedMeal);
      setEditingMealId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The meal could not be saved.");
    } finally {
      setActionState(null);
    }
  }

  async function deleteMeal(mealId: string) {
    if (mealDeleteInFlight.current) return;
    const meal = days.flatMap((day) => day.meals).find((entry) => entry.id === mealId);
    if (!meal) return;
    if (!window.confirm(`Delete "${meal.name}"? This removes the meal and its analysis data. This cannot be undone.`)) return;

    mealDeleteInFlight.current = mealId;
    setOpenMealId(null);
    setDeletingMealId(mealId);
    setActionError(null);
    if (dataMode !== "live") {
      removeMealFromDays(mealId);
      setEditingMealId(null);
      setActionState("Meal deleted locally.");
      mealDeleteInFlight.current = null;
      setDeletingMealId(null);
      return;
    }

    setActionState("Deleting meal…");
    try {
      const response = await fetch(`/api/meals/${encodeURIComponent(mealId)}`, { method: "DELETE" });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const errorRecord = asRecord(asRecord(responseBody)?.error);
        throw new Error(stringOr(errorRecord?.message, "The meal could not be deleted."));
      }
      removeMealFromDays(mealId);
      setEditingMealId(null);
      const result = asRecord(responseBody);
      setActionState(result?.photoDeleted === false
        ? "Meal deleted. Its photo could not be removed."
        : "Meal deleted.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The meal could not be deleted.");
      setActionState(null);
    } finally {
      mealDeleteInFlight.current = null;
      setDeletingMealId(null);
    }
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "New meal").trim();
    const description = String(form.get("description") || "Added from dashboard").trim();
    const calories = Number(form.get("calories") || 0);
    const protein = Number(form.get("protein") || 0);
    const carbs = Number(form.get("carbs") || 0);
    const fat = Number(form.get("fat") || 0);
    const nextMeal: Meal = {
      id: `meal-${Date.now()}`,
      time: "Now",
      name,
      description,
      calories,
      protein,
      carbs,
      fat,
      kind: "snack",
    };

    if (dataMode === "live") {
      setActionError(null);
      setActionState("Adding meal…");
      try {
        const response = await fetch("/api/meals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mealPayload(nextMeal, mealDateTimestamp(selectedDay.date))),
        });
        const responseBody = await response.json().catch(() => null);
        if (!response.ok) {
          const errorRecord = asRecord(asRecord(responseBody)?.error);
          throw new Error(stringOr(errorRecord?.message, "The meal could not be added."));
        }
        const parsedMeal = parseMealResponse(responseBody);
        if (!parsedMeal) throw new Error("The added meal response was invalid.");
        replaceRemoteMeal(parsedMeal);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "The meal could not be added.");
        setActionState(null);
        return;
      }
      setActionState(null);
    } else {
      setDays((currentDays) =>
        currentDays.map((day) =>
          day.key === selectedDayKey
            ? {
                ...day,
                meals: [...day.meals, nextMeal],
                calories: day.calories + calories,
                protein: day.protein + protein,
                carbs: (day.carbs ?? 0) + carbs,
                fat: (day.fat ?? 0) + fat,
              }
            : day,
        ),
      );
    }

    setShowAddMeal(false);
    formElement.reset();
  }

  async function openSettings() {
    const readVersion = settingsReadVersion.current + 1;
    settingsReadVersion.current = readVersion;
    setSettingsDraft({ calories: String(activeCalorieTarget), proteinG: String(activeProteinTarget) });
    setShowSettings(true);
    setActionError(null);
    setActionState(null);
    if (dataMode === "demo") return;

    setSettingsLoading(true);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 401 || response.status === 503) return;
        throw new Error("The current targets could not be loaded.");
      }
      const parsed = parseSettingsTargets(await response.json());
      if (!parsed || settingsReadVersion.current !== readVersion || settingsSaveInFlight.current) return;
      const nextTargets = {
        calories: Number.isFinite(parsed.calories) ? parsed.calories : activeCalorieTarget,
        proteinG: Number.isFinite(parsed.proteinG) ? parsed.proteinG : activeProteinTarget,
      };
      setTargets(nextTargets);
      setSettingsDraft({ calories: String(nextTargets.calories), proteinG: String(nextTargets.proteinG) });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The current targets could not be loaded.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    if (settingsSaveInFlight.current) return;
    const calories = Number(settingsDraft.calories);
    const proteinG = Number(settingsDraft.proteinG);
    if (!Number.isFinite(calories) || calories < 1 || !Number.isFinite(proteinG) || proteinG < 1) {
      setActionError("Enter calorie and protein targets greater than zero.");
      return;
    }

    setActionError(null);
    settingsReadVersion.current += 1;
    settingsSaveInFlight.current = true;
    setSettingsSaving(true);
    try {
      let nextTargets = { calories, proteinG };
      if (dataMode === "live") {
        const response = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dailyCalorieTarget: calories, dailyProteinTargetG: proteinG }),
        });
        const responseBody = await response.json().catch(() => null);
        if (!response.ok) {
          const errorRecord = asRecord(asRecord(responseBody)?.error);
          throw new Error(stringOr(errorRecord?.message, "The targets could not be saved."));
        }
        const parsed = parseSettingsTargets(responseBody);
        if (parsed && Number.isFinite(parsed.calories) && Number.isFinite(parsed.proteinG)) {
          nextTargets = { calories: parsed.calories, proteinG: parsed.proteinG };
        }
      }
      setTargets(nextTargets);
      setSettingsDraft({ calories: String(nextTargets.calories), proteinG: String(nextTargets.proteinG) });
      setShowSettings(false);
      setActionState(dataMode === "live" ? "Targets saved." : "Demo mode — targets updated locally for this session.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The targets could not be saved.");
    } finally {
      settingsSaveInFlight.current = false;
      setSettingsSaving(false);
    }
  }

  function selectDay(key: DayKey) {
    setSelectedDayKey(key);
    setEditingMealId(null);
    setShowAddMeal(false);
  }

  function moveSelectedDay(direction: "previous" | "next") {
    const nextKey = getAdjacentDayKey(days, selectedDayKey, direction);
    if (nextKey) selectDay(nextKey as DayKey);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#today" aria-label="Calocount home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>calocount</span>
        </a>
        <div className="topbar-actions">
          <span className="sync-status"><span className="status-dot" aria-hidden="true" /> {dataMode === "live" ? "Live data" : dataMode === "loading" ? "Loading" : "Demo mode"}</span>
          <button className="icon-button" type="button" onClick={() => void openSettings()} aria-label="Open settings" aria-expanded={showSettings} aria-controls="settings-panel"><span aria-hidden="true">⚙</span></button>
          <span className="avatar" aria-label="Account"><span aria-hidden="true">M</span></span>
        </div>
      </header>

      {showSettings ? <section className="settings-panel" id="settings-panel" role="dialog" aria-labelledby="settings-title">
        <div className="settings-heading"><div><p className="eyebrow">Personal targets</p><h2 id="settings-title">Daily targets</h2></div><button className="close-button" type="button" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button></div>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <label>Calories<input name="daily-calorie-target" type="number" min="1" max="100000" step="10" value={settingsDraft.calories} onChange={(event) => setSettingsDraft((current) => ({ ...current, calories: event.target.value }))} required /></label>
          <label>Protein (g)<input name="daily-protein-target" type="number" min="1" max="10000" step="1" value={settingsDraft.proteinG} onChange={(event) => setSettingsDraft((current) => ({ ...current, proteinG: event.target.value }))} required /></label>
          <button className="save-button" type="button" onClick={() => void saveSettings()} disabled={settingsSaving}>{settingsSaving ? "Saving…" : "Save targets"}</button>
        </form>
        <p className="settings-help" role="status">{settingsLoading ? "Loading saved targets…" : "Targets guide the rings, trend line, and daily nudge."}</p>
      </section> : null}

      {dataMessage ? <div className={`data-banner ${dataMode}`} role="status"><span aria-hidden="true">{dataMode === "live" ? "✓" : dataMode === "loading" ? "…" : "i"}</span>{dataMessage}</div> : null}
      {actionState || actionError ? <div className={`action-feedback ${actionError ? "error" : ""}`} role={actionError ? "alert" : "status"}>{actionError ?? actionState}</div> : null}

      <section className="date-strip" aria-label="Choose a day">
        <div className="date-heading">
          <p className="eyebrow">Your log</p>
          <h1 id="today">{selectedDay.weekday}, {fullDateLabel(selectedDay.date)}</h1>
        </div>
        <div className="date-controls">
          <button className="date-arrow" type="button" onClick={() => moveSelectedDay("previous")} aria-label="Previous day" disabled={!previousDayKey}>‹</button>
          <div className="date-pills">
            {days.map((day) => (
              <button
                className={`date-pill ${selectedDayKey === day.key ? "active" : ""}`}
                key={day.key}
                type="button"
                onClick={() => selectDay(day.key)}
                aria-label={`${day.weekday}, ${fullDateLabel(day.date)}`}
                aria-pressed={selectedDayKey === day.key}
              >
                <span>{dayLabels[day.key]}</span><strong>{day.shortDate}</strong>
              </button>
            ))}
          </div>
          <button className="date-arrow" type="button" onClick={() => moveSelectedDay("next")} aria-label="Next day" disabled={!nextDayKey}>›</button>
        </div>
      </section>

      <nav className="jump-nav" aria-label="Dashboard sections">
        <a className={activeSection === "today" ? "active" : ""} href="#today" aria-current={activeSection === "today" ? "page" : undefined}>Today</a>
        <a className={activeSection === "meals" ? "active" : ""} href="#meals" aria-current={activeSection === "meals" ? "page" : undefined}>Meals</a>
        <a className={activeSection === "trend" ? "active" : ""} href="#trend" aria-current={activeSection === "trend" ? "page" : undefined}>Trend</a>
        <a className={activeSection === "plan" ? "active" : ""} href="#plan" aria-current={activeSection === "plan" ? "page" : undefined}>Rest of day</a>
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
              <div className="chart-y-axis" aria-hidden="true"><span>2.6k</span><span>2.0k</span><span>1.4k</span><span>0.8k</span><span>0</span></div>
              <div className="chart-plot">
                <div className="target-line"><span>{formatNumber(activeCalorieTarget)}</span></div><div className="grid-line line-one" /><div className="grid-line line-two" /><div className="grid-line line-three" />
                <div className="bars">{chartValues.map((day) => <div className="bar-column" key={day.label}><div className="bar-value">{day.value.toLocaleString()}</div><div className="bar" style={{ height: `${Math.max(12, (day.value / 2600) * 100)}%` }} /><span>{day.label}</span></div>)}</div>
              </div>
            </div>
          </section>

          <section className="panel meals-panel" id="meals" aria-labelledby="meals-title">
            <div className="panel-heading meal-heading"><div><p className="eyebrow">What you ate</p><h2 id="meals-title">Meals <span>{selectedDay.meals.length}</span></h2></div><button className="primary-button" type="button" onClick={() => setShowAddMeal((current) => !current)}><span aria-hidden="true">＋</span> Add meal</button></div>

            {showAddMeal ? <form className="add-meal-form" onSubmit={addMeal}>
              <div className="form-heading"><div><strong>Log a meal</strong><span>Use a quick estimate now. You can edit it later.</span></div><button className="close-button" type="button" onClick={() => setShowAddMeal(false)} aria-label="Close add meal form">×</button></div>
              <label>Meal name<input name="name" placeholder="e.g. Turkey sandwich" required /></label>
              <label className="wide-field">Description<input name="description" placeholder="Ingredients or a short note" /></label>
              <label>Calories<input name="calories" type="number" min="0" step="any" placeholder="450" required /></label>
              <label>Protein (g)<input name="protein" type="number" min="0" step="any" placeholder="30" /></label>
              <label>Carbs (g)<input name="carbs" type="number" min="0" step="any" placeholder="45" /></label>
              <label>Fat (g)<input name="fat" type="number" min="0" step="any" placeholder="15" /></label>
              <button className="save-button" type="submit">Save meal</button>
            </form> : null}

            {selectedDay.meals.length > 0 ? <div className="meal-list">
              <div className="meal-list-head" aria-hidden="true"><span /><span>Meal</span><span>Energy</span><span>Protein</span><span>Carbs</span><span>Fat</span><span /></div>
              {selectedDay.meals.map((meal) => <div className="meal-group" key={meal.id}>
                <div className={`meal-row${openMealId === meal.id ? " is-actions-open" : ""}`}>
                  <div
                    className="meal-row-content"
                    onPointerDown={(event) => handleMealPointerDown(meal.id, event)}
                    onPointerUp={(event) => finishMealPointer(meal.id, event)}
                    onPointerCancel={(event) => cancelMealPointer(meal.id, event)}
                  >
                    {meal.photoKey && !failedPhotoKeys.has(meal.photoKey) && photoUrlForKey(meal.photoKey) ? <button
                      className="meal-photo-button"
                      type="button"
                      aria-label={`View photo of ${meal.name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewMeal(meal);
                      }}
                    >
                      {/* The private R2 route needs a native image element so the browser can lazy-load it. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="meal-photo"
                        src={photoUrlForKey(meal.photoKey) ?? undefined}
                        alt={meal.name}
                        loading="lazy"
                        decoding="async"
                        onError={() => markPhotoUnavailable(meal.photoKey as string)}
                      />
                    </button> : <div className={`meal-avatar ${meal.kind}`} aria-hidden="true">{mealPlaceholders[meal.kind]}</div>}
                    <div className="meal-info"><div className="meal-name-line"><strong>{meal.name}</strong><time>{meal.time}</time></div><span>{meal.description}</span></div>
                    <div className="meal-stat calories-stat" data-label="Energy">{formatNumber(meal.calories)} <small>kcal</small></div>
                    <div className="meal-stat protein-stat" data-label="Protein">{formatNumber(meal.protein)}<small>g</small></div>
                    <div className="meal-stat carbs-stat" data-label="Carbs">{formatNumber(meal.carbs ?? 0)}<small>g</small></div>
                    <div className="meal-stat fat-stat" data-label="Fat">{formatNumber(meal.fat ?? 0)}<small>g</small></div>
                  </div>
                  <button
                    className="meal-actions-toggle"
                    type="button"
                    aria-expanded={openMealId === meal.id}
                    aria-controls={`meal-actions-${meal.id}`}
                    aria-label={`${openMealId === meal.id ? "Close" : "Open"} actions for ${meal.name}`}
                    onClick={() => setOpenMealId((current) => current === meal.id ? null : meal.id)}
                  >
                    {openMealId === meal.id ? "×" : "⋯"}
                  </button>
                  <div className="meal-actions" id={`meal-actions-${meal.id}`}>
                    <button className="edit-button" type="button" disabled={actionInProgress || deletingMealId !== null} onClick={() => setEditingMealId(editingMealId === meal.id ? null : meal.id)} aria-expanded={editingMealId === meal.id} aria-label={`Edit ${meal.name}`}>Edit</button>
                    <button className="delete-button" type="button" disabled={actionInProgress || deletingMealId !== null} onClick={() => void deleteMeal(meal.id)} aria-label={`Delete ${meal.name}`} aria-busy={deletingMealId === meal.id}>{deletingMealId === meal.id ? "Deleting…" : "Delete"}</button>
                  </div>
                </div>
                {editingMealId === meal.id ? <div className="inline-editor">
                  <label>Name<input value={meal.name} onChange={(event) => updateMeal(meal.id, { name: event.target.value })} /></label>
                  <label>Calories<input type="number" min="0" step="any" value={meal.calories} onChange={(event) => updateMeal(meal.id, { calories: Number(event.target.value) })} /></label>
                  <label>Protein<input type="number" min="0" step="any" value={meal.protein} onChange={(event) => updateMeal(meal.id, { protein: Number(event.target.value) })} /></label>
                  <label>Carbs<input type="number" min="0" step="any" value={meal.carbs ?? 0} onChange={(event) => updateMeal(meal.id, { carbs: Number(event.target.value) })} /></label>
                  <label>Fat<input type="number" min="0" step="any" value={meal.fat ?? 0} onChange={(event) => updateMeal(meal.id, { fat: Number(event.target.value) })} /></label>
                  <div className="editor-actions">
                    <button className="done-button" type="button" disabled={Boolean(actionState)} onClick={() => void saveMeal(meal.id)}>Save changes</button>
                  </div>
                </div> : null}
              </div>)}
            </div> : <div className="empty-meals"><span className="empty-icon" aria-hidden="true">＋</span><strong>No meals logged for {selectedDay.weekday}</strong><span>Tap “Add meal” to record what you ate.</span></div>}
            <div className="meal-total"><span>Total for {selectedDay.weekday}</span><strong>{formatNumber(totalCalories)} <small>kcal</small> <i /> {formatNumber(totalProtein)}g <small>protein</small></strong></div>
          </section>
        </section>

        <aside className="side-column">
          {!noteDismissed ? <section className="ai-note" id="plan" aria-labelledby="plan-title">
            <div className="ai-note-topline"><span className="sparkle" aria-hidden="true">✦</span><span>Calocount AI</span><button className="close-button" type="button" onClick={() => setNoteDismissed(true)} aria-label="Dismiss AI note">×</button></div>
            <h2 id="plan-title">A small nudge for the rest of your day</h2>
            <p>You are {remainingCalories > 0 ? `${formatNumber(remainingCalories)} kcal` : "at your target"} away from today&apos;s goal. A protein-forward dinner will keep you close to your {activeProteinTarget}g target.</p>
            <div className="ai-suggestion"><span className="suggestion-icon" aria-hidden="true">↗</span><div><strong>Try 35–45g protein</strong><span>Lean protein, vegetables, and a small carb portion</span></div></div>
            <button className="text-button" type="button" onClick={() => setShowAddMeal(true)}>Log dinner idea <span aria-hidden="true">→</span></button>
          </section> : <button className="show-note-button" type="button" onClick={() => setNoteDismissed(false)}>Show daily nudge</button>}

          <section className="panel macro-panel" aria-labelledby="macro-title">
            <div className="panel-heading compact-heading"><div><p className="eyebrow">Daily split</p><h2 id="macro-title">Macros</h2></div><span className="panel-meta">per day</span></div>
            <div className="macro-donut" style={{ background: macroValues.gradient }} role="img" aria-label={`Estimated daily macro split: ${macroValues.carbs} percent carbohydrates, ${macroValues.protein} percent protein, ${macroValues.fat} percent fat`}><div><strong>{formatNumber(totalCalories)}</strong><span>kcal</span></div></div>
            <div className="macro-legend"><div><span className="macro-key carbs" /><span>Carbs</span><strong>{macroValues.carbs}%</strong></div><div><span className="macro-key protein" /><span>Protein</span><strong>{macroValues.protein}%</strong></div><div><span className="macro-key fat" /><span>Fat</span><strong>{macroValues.fat}%</strong></div></div>
          </section>

          <section className="panel history-panel" aria-labelledby="history-title">
            <div className="panel-heading compact-heading"><div><p className="eyebrow">Keep the thread</p><h2 id="history-title">Recent days</h2></div><button className="more-button" type="button" onClick={() => setShowAllDays((current) => !current)}>{showAllDays ? "Less" : "View all"}</button></div>
            <div className="history-list">{days.slice(showAllDays ? 0 : 3).reverse().map((day) => <button className={`history-row ${selectedDayKey === day.key ? "selected" : ""}`} type="button" key={day.key} onClick={() => selectDay(day.key)}><span className="history-date"><strong>{day.shortDate}</strong><small>{day.weekday.slice(0, 3)}</small></span><span className="history-bar"><i style={{ width: `${calculateTargetPercent(day.calories, activeCalorieTarget)}%` }} /></span><span className="history-calories">{formatNumber(day.calories)}<small> kcal</small></span><span className="history-chevron" aria-hidden="true">›</span></button>)}</div>
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
            {previewMeal.photoKey && !failedPhotoKeys.has(previewMeal.photoKey) && photoUrlForKey(previewMeal.photoKey) ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
              className="photo-preview-image"
              src={photoUrlForKey(previewMeal.photoKey) ?? undefined}
              alt={previewMeal.name}
              decoding="async"
              onError={() => markPhotoUnavailable(previewMeal.photoKey as string)}
              />
            </> : <p className="photo-preview-fallback" role="status">Photo unavailable</p>}
          </div>
          <p className="photo-preview-title" id="photo-preview-title">{previewMeal.name}</p>
        </div>
      </div> : null}

      <footer className="app-footer"><span>Private by default</span><span className="footer-separator" aria-hidden="true">·</span><span>Calocount dashboard</span></footer>
    </main>
  );
}
