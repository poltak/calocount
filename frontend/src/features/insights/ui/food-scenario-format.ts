import {
  foodScenarioMetricKeys,
  type FoodScenarioMetric,
  type ScenarioFoodCandidate,
} from "@app/common/features/entries/utils/insights/nutrient-food-scenario";
import { NUTRIENT_META } from "@app/common/features/entries/utils/nutrients";
import type { NutrientGoalMap } from "@app/common/features/entries/utils/nutrient-goals";
import { formatShortDate } from "../utils/insight-format.js";

function metricDigits(key: FoodScenarioMetric["key"]): number {
  if (key === "calories") {
    return 0;
  }
  if (key === "proteinG") {
    return 1;
  }
  return NUTRIENT_META.find((meta) => meta.key === key)?.precision ?? 1;
}

export function formatAmount(
  value: number | null,
  key: FoodScenarioMetric["key"],
): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unknown";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: metricDigits(key),
  }).format(value);
}

export function formatMetricValue(
  value: number | null,
  metric: FoodScenarioMetric,
): string {
  return value === null
    ? "Unknown"
    : `${formatAmount(value, metric.key)} ${metric.unit}`;
}

export function formatDelta(metric: FoodScenarioMetric): string {
  if (metric.delta === null) {
    return "Unknown";
  }
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: metricDigits(metric.key),
    signDisplay: "exceptZero",
  }).format(metric.delta);
  return `${amount} ${metric.unit}`;
}

export function candidateLabel(candidate: ScenarioFoodCandidate): string {
  const quantity =
    candidate.item.quantity == null
      ? ""
      : ` · ${candidate.item.quantity}${candidate.item.unit ? ` ${candidate.item.unit}` : ""}`;
  return `${candidate.label}${quantity} · ${formatShortDate(candidate.date)}`;
}

export function goalLabel(
  metric: FoodScenarioMetric,
  goals: NutrientGoalMap,
): string | null {
  if (metric.key === "calories" || metric.key === "proteinG") {
    return null;
  }
  const goal = goals[metric.key];
  if (goal.value === null) {
    return null;
  }
  return `${goal.direction === "minimum" ? "minimum" : "maximum"} ${formatAmount(goal.value, metric.key)} ${metric.unit}`;
}

/** The share of the goal that an amount reaches, for a nutrient that has a goal. */
export function referencePercent(
  value: number | null,
  metric: FoodScenarioMetric,
  goals: NutrientGoalMap,
): { value: number; direction: "minimum" | "maximum" } | null {
  if (
    value === null ||
    metric.key === "calories" ||
    metric.key === "proteinG"
  ) {
    return null;
  }
  const goal = goals[metric.key];
  if (goal.value === null || goal.value <= 0) {
    return null;
  }
  return { value: (value / goal.value) * 100, direction: goal.direction };
}

/** The rows with a known change come first, then the nutrients that have a goal. */
export function orderedMetrics(
  metrics: FoodScenarioMetric[],
  goals: NutrientGoalMap,
): FoodScenarioMetric[] {
  const rank = (metric: FoodScenarioMetric) => {
    if (metric.key === "calories") {
      return 0;
    }
    if (metric.key === "proteinG") {
      return 1;
    }
    return goals[metric.key].value === null ? 3 : 2;
  };
  return metrics.toSorted(
    (left, right) =>
      Number(left.delta === null) - Number(right.delta === null) ||
      rank(left) - rank(right) ||
      foodScenarioMetricKeys.indexOf(left.key) -
        foodScenarioMetricKeys.indexOf(right.key),
  );
}
