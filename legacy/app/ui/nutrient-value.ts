import { cx, h } from "./dom";
import {
  aggregateCoverageLabel,
  goalKindFor,
  formatNutrientAmount,
  nutrientLabel,
  nutrientUnit,
  type NutrientAggregate,
  type NutrientGoal,
  type NutrientValue,
} from "../nutrition/nutrient-meta";

type NutrientValueProps = {
  nutrientKey: string;
  value?: NutrientValue;
  aggregate?: NutrientAggregate | null;
  goal?: NutrientGoal | null;
  showLabel?: boolean;
  className?: string;
};

export function nutrientValue({ nutrientKey, value, aggregate, goal, showLabel = true, className = "" }: NutrientValueProps) {
  const amount = aggregate ? aggregate.amount : value;
  const formatted = formatNutrientAmount(amount, nutrientKey);
  const isPartial = Boolean(aggregate && aggregate.amount !== null && !aggregate.complete);
  const coverage = aggregateCoverageLabel(aggregate);
  const goalAmount = goal?.value ?? null;
  return h("span", { class: cx("nutrient-value", isPartial && "is-partial", className) },
    h("span", { class: "nutrient-value-reading" },
      h("strong", null, formatted),
      formatted !== "—" ? h("small", null, nutrientUnit(nutrientKey)) : null,
    ),
    goalAmount !== null ? h("span", { class: "nutrient-goal-reading" },
      h("span", { "aria-hidden": "true" }, "/"),
      ` ${formatNutrientAmount(goalAmount, nutrientKey)}${nutrientUnit(nutrientKey)}${goalKindFor(nutrientKey, goal) === "limit" ? " max" : ""}`,
    ) : null,
    showLabel && isPartial ? h("em", { title: `${aggregate?.knownItemCount ?? 0} of ${aggregate?.totalItemCount ?? 0} items have a value` }, coverage) : null,
    showLabel && formatted === "—" ? h("em", null, `${nutrientLabel(nutrientKey)} unknown`) : null,
  );
}

export function nutrientValueText({ nutrientKey, value, aggregate }: Pick<NutrientValueProps, "nutrientKey" | "value" | "aggregate">) {
  const amount = aggregate ? aggregate.amount : value;
  return formatNutrientAmount(amount, nutrientKey) === "—"
    ? "—"
    : `${formatNutrientAmount(amount, nutrientKey)} ${nutrientUnit(nutrientKey)}`;
}
