import { zonedCalendar } from "@app/common/features/core/utils/logical-date";
import {
  parseNutrientGoalOverridesJson,
  resolveNutrientGoals,
} from "@app/common/features/entries/utils/nutrient-goals";
import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import { normaliseProteinGoalMode } from "@app/common/features/goals/utils/daily-targets";
import type {
  MealItemRow,
  MealWithItems,
} from "../../entries/storage/types.js";
import type {
  GoalChangeRow,
  SettingsRow,
} from "../../settings/storage/types.js";
import type { DailyWeightRow } from "../../weights/storage/types.js";
import {
  encodeNutritionHistoryCursor,
  type NutritionDateRange,
  type NutritionHistoryInput,
} from "./nutrition-read-input.js";

function readItem(item: MealItemRow) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    caloriesKcal: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
    nutrients: Object.fromEntries(
      NUTRIENT_KEYS.map((key) => [key, item[key] ?? null]),
    ) as Record<NutrientKey, number | null>,
    sourceFormAmounts: Object.fromEntries(
      NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [key, item[key] ?? null]),
    ) as Record<NutrientUpperLimitKey, number | null>,
  };
}

/** One page of the history. The internal ID of a meal stays inside the cursor. */
export function historyPayload({
  input,
  page,
}: {
  input: NutritionHistoryInput;
  page: {
    timeZone: string;
    hasMore: boolean;
    entries: Array<MealWithItems & { date: string }>;
  };
}) {
  const last = page.entries.at(-1);
  return {
    start_date: input.startDate,
    end_date: input.endDate,
    timezone: page.timeZone,
    meals: page.entries.map(({ meal, items, date }) => ({
      date,
      eaten_at: new Date(meal.consumedAt).toISOString(),
      request_id: meal.externalRequestId,
      meal_type: meal.mealType,
      totals: {
        caloriesKcal: meal.totalCalories,
        proteinG: meal.totalProteinG,
        carbsG: meal.totalCarbsG,
        fatG: meal.totalFatG,
      },
      items: items.map(readItem),
    })),
    has_more: page.hasMore,
    next_cursor:
      page.hasMore && last
        ? encodeNutritionHistoryCursor(input, {
            consumedAt: last.meal.consumedAt,
            id: last.meal.id,
          })
        : null,
  };
}

function proteinGoalOf(values: {
  proteinGoalMode: string | null;
  dailyProteinTargetG: number | null;
  dailyProteinTargetPerKg: number | null;
}) {
  return {
    mode: normaliseProteinGoalMode(values.proteinGoalMode),
    grams: values.dailyProteinTargetG,
    gramsPerKg: values.dailyProteinTargetPerKg,
  };
}

/** The totals of each date, the current targets, and the recorded goal changes. */
export function summaryPayload<Day>({
  range,
  timeZone,
  days,
  settings,
  goalChanges,
}: {
  range: NutritionDateRange;
  timeZone: string;
  days: Day[];
  settings: SettingsRow | undefined;
  goalChanges: GoalChangeRow[];
}) {
  const calendar = zonedCalendar(timeZone);
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    timezone: timeZone,
    days,
    currentTargets: {
      scope: "current_settings_only" as const,
      caloriesKcal: settings?.dailyCalorieTarget ?? null,
      protein: proteinGoalOf({
        proteinGoalMode: settings?.proteinGoalMode ?? null,
        dailyProteinTargetG: settings?.dailyProteinTargetG ?? null,
        dailyProteinTargetPerKg: settings?.dailyProteinTargetPerKg ?? null,
      }),
      nutrients: resolveNutrientGoals(
        parseNutrientGoalOverridesJson(settings?.nutrientTargetsJson),
      ),
    },
    goalChanges: goalChanges.map((change) => ({
      date: calendar.dateKey(change.changedAt),
      changedAt: new Date(change.changedAt).toISOString(),
      caloriesKcal: change.dailyCalorieTarget,
      protein: proteinGoalOf(change),
    })),
  };
}

export function weightsPayload({
  range,
  firstWeightDate,
  weights,
}: {
  range: NutritionDateRange;
  firstWeightDate: string | null;
  weights: Array<
    Pick<DailyWeightRow, "logicalDate" | "weightKg" | "recordedAt">
  >;
}) {
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    firstWeightDate,
    weights: weights.map((weight) => ({
      date: weight.logicalDate,
      weightKg: weight.weightKg,
      recordedAt: new Date(weight.recordedAt).toISOString(),
    })),
  };
}
