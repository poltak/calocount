import type { getDashboardSummary } from "../../../db/repository";
import { resolveNutrientGoals } from "../../../domain/nutrient-goals";
import { NUTRIENT_KEYS, nullableNutrientValue, type NutrientAggregateMap, type NutrientValues } from "../../../domain/nutrients";
import { isPublicPhotoMimeType, isWithinPublicDateRange } from "./public-photo-policy";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;

type PublicMealItem = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  nutrients: NutrientValues;
};

type PublicMeal = {
  id: string;
  consumedAt: number;
  mealType: string | null;
  hasPhoto: boolean;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  items: PublicMealItem[];
};

type PublicTrendDay = {
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
};

type PublicWeight = {
  logicalDate: string;
  weightKg: number;
  recordedAt: number;
};

function dateKeyFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dateKeyDaysBefore(date: string, days: number): string {
  const timestamp = new Date(`${date}T12:00:00.000Z`).getTime() - days * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function publicMeal(entry: DashboardSummary["recentMeals"][number]): PublicMeal {
  return {
    id: entry.meal.id,
    consumedAt: entry.meal.consumedAt,
    mealType: entry.meal.mealType,
    hasPhoto: Boolean(entry.meal.photoKey) && isPublicPhotoMimeType(entry.meal.photoMimeType),
    totalCalories: entry.meal.totalCalories,
    totalProteinG: entry.meal.totalProteinG,
    totalCarbsG: entry.meal.totalCarbsG,
    totalFatG: entry.meal.totalFatG,
    items: entry.items.map((item) => {
      const nutrients = {} as NutrientValues;
      for (const key of NUTRIENT_KEYS) nutrients[key] = nullableNutrientValue(item[key]);
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        nutrients,
      };
    }),
  };
}

function publicWeight(entry: PublicWeight): PublicWeight {
  return {
    logicalDate: entry.logicalDate,
    weightKg: entry.weightKg,
    recordedAt: entry.recordedAt,
  };
}

function publicNutrientAggregates(source: NutrientAggregateMap | undefined): NutrientAggregateMap {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => {
    const aggregate = source?.[key];
    return [key, {
      amount: nullableNutrientValue(aggregate?.amount),
      knownItemCount: aggregate?.knownItemCount ?? 0,
      totalItemCount: aggregate?.totalItemCount ?? 0,
      complete: aggregate?.complete === true,
    }];
  })) as NutrientAggregateMap;
}

function publicTrend(summary: DashboardSummary): PublicTrendDay[] {
  const byDate = new Map<string, PublicTrendDay>();
  for (let daysBefore = 6; daysBefore >= 0; daysBefore -= 1) {
    const date = dateKeyDaysBefore(summary.date, daysBefore);
    byDate.set(date, { date, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0 });
  }

  for (const entry of summary.recentMeals) {
    if (entry.meal.status !== "complete") continue;
    const day = byDate.get(dateKeyFromTimestamp(entry.meal.consumedAt));
    if (!day) continue;
    day.calories += entry.meal.totalCalories;
    day.proteinG += entry.meal.totalProteinG;
    day.carbsG += entry.meal.totalCarbsG;
    day.fatG += entry.meal.totalFatG;
    day.mealCount += 1;
  }

  return [...byDate.values()].map((day) => (
    day.date === summary.date
      ? {
          ...day,
          calories: summary.today.calories,
          proteinG: summary.today.proteinG,
          carbsG: summary.today.carbsG,
          fatG: summary.today.fatG,
          mealCount: summary.today.mealCount,
        }
      : day
  ));
}

function publicNutrientGoals(summary: DashboardSummary) {
  const goals = summary.targets.nutrients ?? resolveNutrientGoals();
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => {
    const goal = goals[key];
    return [key, { value: goal.value, direction: goal.direction }];
  }));
}

function publicProteinGoal(summary: DashboardSummary) {
  const goal = summary.proteinGoal;
  if (!goal) {
    return {
      mode: "grams" as const,
      gramsPerKg: null,
      fixedTargetG: summary.targets.proteinG,
      targetG: summary.targets.proteinG,
      weightKg: null,
      weightDate: null,
      byDate: [],
    };
  }
  return {
    mode: goal.mode,
    gramsPerKg: goal.gramsPerKg,
    fixedTargetG: goal.fixedTargetG,
    targetG: goal.targetG,
    weightKg: goal.weightKg,
    weightDate: goal.weightDate,
    byDate: goal.byDate.map((day) => ({
      date: day.date,
      targetG: day.targetG,
      weightKg: day.weightKg,
      weightDate: day.weightDate,
    })),
  };
}

function publicInsights(summary: DashboardSummary) {
  if (!summary.insights) return undefined;
  const fromDate = dateKeyDaysBefore(summary.date, 30);
  return {
    fromDate,
    toDate: summary.date,
    entries: summary.insights.entries.filter((entry) => (
      entry.date >= fromDate && entry.date <= summary.date
      && dateKeyFromTimestamp(entry.consumedAt) === entry.date
    )).map((entry) => ({
      id: entry.id,
      date: entry.date,
      consumedAt: entry.consumedAt,
      calories: entry.calories,
      proteinG: entry.proteinG,
      items: entry.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nullableNutrientValue(item.nutrients[key])])),
      })),
    })),
  };
}

/**
 * Build the deliberately small contract used by the anonymous root dashboard.
 * Keep this explicit: private database fields must not cross this boundary.
 */
export function projectPublicDashboardSummary(summary: DashboardSummary) {
  return {
    date: summary.date,
    targets: {
      calories: summary.targets.calories,
      proteinG: summary.targets.proteinG,
      nutrients: publicNutrientGoals(summary),
    },
    proteinGoal: publicProteinGoal(summary),
    today: {
      calories: summary.today.calories,
      proteinG: summary.today.proteinG,
      carbsG: summary.today.carbsG,
      fatG: summary.today.fatG,
      mealCount: summary.today.mealCount,
    },
    sevenDay: {
      calories: summary.sevenDay.calories,
      proteinG: summary.sevenDay.proteinG,
      averageCalories: summary.sevenDay.averageCalories,
      averageProteinG: summary.sevenDay.averageProteinG,
      daysWithMeals: summary.sevenDay.daysWithMeals,
      trend: publicTrend(summary),
    },
    trend: {
      byDate: (summary.trend?.byDate ?? publicTrend(summary).map((day) => ({ ...day, nutrients: {} }))).map((day) => ({
        date: day.date,
        calories: day.calories,
        proteinG: day.proteinG,
        carbsG: day.carbsG,
        fatG: day.fatG,
        mealCount: day.mealCount,
        nutrients: publicNutrientAggregates(day.nutrients),
      })),
      weights: (summary.trend?.weights ?? summary.recentWeights).map(publicWeight),
    },
    nutrition: {
      today: publicNutrientAggregates(summary.nutrition.today),
      sevenDay: publicNutrientAggregates(summary.nutrition.sevenDay),
      byDate: summary.nutrition.byDate.map((day) => ({
        date: day.date,
        nutrients: publicNutrientAggregates(day.nutrients),
      })),
    },
    insights: publicInsights(summary),
    recentMeals: summary.recentMeals.filter((entry) => (
      entry.meal.status === "complete"
      && isWithinPublicDateRange({ consumedAt: entry.meal.consumedAt, summaryDate: summary.date })
    )).map(publicMeal),
    recentWeights: summary.recentWeights.map(publicWeight),
  };
}
