import { cx, h } from "./dom";
import {
  goalKindFor,
  goalKindWord,
  nutrientGoalProgress,
  nutrientLabel,
  type NutrientAggregate,
  type NutrientGoal,
  type NutrientValue as NutrientAmount,
} from "../nutrition/nutrient-meta";
import { nutrientValue } from "./nutrient-value";

type NutrientStatProps = {
  aggregate?: NutrientAggregate | null;
  className?: string;
  goal?: NutrientGoal | null;
  label?: string;
  nutrientKey: string;
  showCoverage?: boolean;
  value?: NutrientAmount;
};

export function nutrientStat({
  aggregate,
  className = "",
  goal,
  label,
  nutrientKey,
  showCoverage = true,
  value,
}: NutrientStatProps) {
  const amount = aggregate ? aggregate.amount : value;
  const kind = goalKindFor(nutrientKey, goal);
  const progress = nutrientGoalProgress(amount, goal, kind);
  const partial = Boolean(aggregate && aggregate.amount !== null && !aggregate.complete);
  return h("div", {
    class: cx(
      "nutrient-stat",
      progress && "has-goal-progress",
      progress && `goal-${progress.status}`,
      partial && "goal-partial",
      className,
    ),
    style: progress ? { "--goal-progress": `${progress.fillPercent}%` } : undefined,
  },
    h("span", { class: "nutrient-stat-label" }, label ?? nutrientLabel(nutrientKey)),
    nutrientValue({ nutrientKey, value, aggregate, goal, showLabel: showCoverage }),
    progress ? h("span", { class: "nutrient-goal-percent" }, `${progress.displayPercent}% of ${goalKindWord(kind)}`) : null,
  );
}
