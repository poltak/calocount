import type { getDashboardSummary } from "../../../../db/repository";

type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;

type PublicMealItem = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type PublicMeal = {
  id: string;
  consumedAt: number;
  mealType: string | null;
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
    totalCalories: entry.meal.totalCalories,
    totalProteinG: entry.meal.totalProteinG,
    totalCarbsG: entry.meal.totalCarbsG,
    totalFatG: entry.meal.totalFatG,
    items: entry.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
    })),
  };
}

function publicWeight(entry: DashboardSummary["recentWeights"][number]): PublicWeight {
  return {
    logicalDate: entry.logicalDate,
    weightKg: entry.weightKg,
    recordedAt: entry.recordedAt,
  };
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

/**
 * Build the deliberately small contract used by an anonymous share page.
 * Keep this explicit: private database fields must not cross this boundary.
 */
export function projectPublicDashboardSummary(summary: DashboardSummary) {
  return {
    date: summary.date,
    targets: {
      calories: summary.targets.calories,
      proteinG: summary.targets.proteinG,
    },
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
    recentMeals: summary.recentMeals.filter((entry) => entry.meal.status === "complete").map(publicMeal),
    recentWeights: summary.recentWeights.map(publicWeight),
  };
}
