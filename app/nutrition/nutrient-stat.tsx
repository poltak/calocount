import type { CSSProperties } from "react";

import {
  nutrientGoalProgress,
  nutrientLabel,
  type NutrientAggregate,
  type NutrientGoal,
  type NutrientValue as NutrientAmount,
} from "./nutrient-meta";
import { NutrientValue } from "./nutrient-value";

type NutrientStatProps = {
  aggregate?: NutrientAggregate | null;
  className?: string;
  goal?: NutrientGoal | null;
  label?: string;
  nutrientKey: string;
  showCoverage?: boolean;
  value?: NutrientAmount;
};

export function NutrientStat({
  aggregate,
  className = "",
  goal,
  label,
  nutrientKey,
  showCoverage = true,
  value,
}: NutrientStatProps) {
  const amount = aggregate ? aggregate.amount : value;
  const progress = nutrientGoalProgress(amount, goal);
  const partial = Boolean(aggregate && aggregate.amount !== null && !aggregate.complete);
  const classes = [
    "nutrient-stat",
    progress ? "has-goal-progress" : "",
    progress ? `goal-${progress.status}` : "",
    partial ? "goal-partial" : "",
    className,
  ].filter(Boolean).join(" ");
  const style = progress ? {
    "--goal-progress": `${progress.fillPercent}%`,
  } as CSSProperties : undefined;
  return <div className={classes} style={style}>
    <span className="nutrient-stat-label">{label ?? nutrientLabel(nutrientKey)}</span>
    <NutrientValue nutrientKey={nutrientKey} value={value} aggregate={aggregate} goal={goal} showLabel={showCoverage} />
    {progress ? <span className="nutrient-goal-percent">{progress.displayPercent}% of {goal?.direction === "maximum" ? "limit" : "goal"}</span> : null}
  </div>;
}
