import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import {
  goalKindWord,
  nutrientGoalKind,
  nutrientGoalProgress,
} from "@app/common/features/entries/utils/nutrient-goals";
import type { CSSProperties } from "react";
import { cx } from "../../core/utils/class-names.js";
import {
  formatNutrientAmount,
  nutrientLabel,
  nutrientUnit,
} from "../../core/utils/nutrient-format.js";
import { useDashboard } from "./dashboard-context.js";

export interface NutrientTotal {
  amount: number | null;
  knownItemCount: number;
  totalItemCount: number;
  complete: boolean;
}

function coverageLabel(total: NutrientTotal): string {
  if (total.amount === null) {
    return "Unknown";
  }
  return total.complete
    ? "Complete"
    : `Partial · ${total.knownItemCount} of ${total.totalItemCount} items`;
}

/** One nutrient of a day: its amount, and whether every item had a value for it. */
export function NutrientStat({
  nutrientKey,
  label,
  total,
  showCoverage = true,
  showGoal = false,
  className = "",
}: {
  nutrientKey: NutrientKey;
  label?: string;
  total: NutrientTotal | undefined;
  showCoverage?: boolean;
  /** Show the goal of the nutrient and the progress toward it. */
  showGoal?: boolean;
  className?: string;
}) {
  const { dashboard } = useDashboard();
  const goal = showGoal
    ? dashboard.state.targets.nutrients[nutrientKey]
    : undefined;
  const kind = nutrientGoalKind(nutrientKey, goal);
  const progress = nutrientGoalProgress({ amount: total?.amount, goal, kind });
  const formatted = formatNutrientAmount(total?.amount, nutrientKey);
  const partial = Boolean(total && total.amount !== null && !total.complete);
  return (
    <div
      className={cx(
        "nutrient-stat",
        progress && "has-goal-progress",
        progress && `goal-${progress.status}`,
        partial && "goal-partial",
        className,
      )}
      style={
        progress
          ? ({ "--goal-progress": `${progress.fillPercent}%` } as CSSProperties)
          : undefined
      }
    >
      <span className="nutrient-stat-label">
        {label ?? nutrientLabel(nutrientKey)}
      </span>
      <span
        className={partial ? "nutrient-value is-partial" : "nutrient-value"}
      >
        <span className="nutrient-value-reading">
          <strong>{formatted}</strong>
          {formatted !== "—" && <small>{nutrientUnit(nutrientKey)}</small>}
        </span>
        {goal?.value != null && (
          <span className="nutrient-goal-reading">
            <span aria-hidden="true">/</span>
            {` ${formatNutrientAmount(goal.value, nutrientKey)}${nutrientUnit(nutrientKey)}${kind === "limit" ? " max" : ""}`}
          </span>
        )}
        {showCoverage && partial && total && (
          <em
            title={`${total.knownItemCount} of ${total.totalItemCount} items have a value`}
          >
            {coverageLabel(total)}
          </em>
        )}
        {showCoverage && formatted === "—" && (
          <em>{`${nutrientLabel(nutrientKey)} unknown`}</em>
        )}
      </span>
      {progress && (
        <span className="nutrient-goal-percent">
          {`${progress.displayPercent}% of ${goalKindWord(kind)}`}
        </span>
      )}
    </div>
  );
}
