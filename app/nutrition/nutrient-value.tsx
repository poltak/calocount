import {
  aggregateCoverageLabel,
  formatNutrientAmount,
  nutrientLabel,
  nutrientUnit,
  type NutrientAggregate,
  type NutrientGoal,
  type NutrientValue,
} from "./nutrient-meta";

type NutrientValueProps = {
  nutrientKey: string;
  value?: NutrientValue;
  aggregate?: NutrientAggregate | null;
  goal?: NutrientGoal | null;
  showLabel?: boolean;
  className?: string;
};

export function NutrientValue({ nutrientKey, value, aggregate, goal, showLabel = true, className = "" }: NutrientValueProps) {
  const amount = aggregate ? aggregate.amount : value;
  const formatted = formatNutrientAmount(amount, nutrientKey);
  const isPartial = Boolean(aggregate && aggregate.amount !== null && !aggregate.complete);
  const coverage = aggregateCoverageLabel(aggregate);
  const goalAmount = goal?.value ?? null;
  return <span className={`nutrient-value ${isPartial ? "is-partial" : ""} ${className}`.trim()}>
    <span className="nutrient-value-reading"><strong>{formatted}</strong>{formatted !== "—" ? <small>{nutrientUnit(nutrientKey)}</small> : null}</span>
    {goalAmount !== null ? <span className="nutrient-goal-reading"><span aria-hidden="true">/</span> {formatNutrientAmount(goalAmount, nutrientKey)}{nutrientUnit(nutrientKey)}{goal?.direction === "maximum" ? " max" : ""}</span> : null}
    {showLabel && isPartial ? <em title={`${aggregate?.knownItemCount ?? 0} of ${aggregate?.totalItemCount ?? 0} items have a value`}>{coverage}</em> : null}
    {showLabel && formatted === "—" ? <em>{nutrientLabel(nutrientKey)} unknown</em> : null}
  </span>;
}

export function NutrientValueText({ nutrientKey, value, aggregate }: Pick<NutrientValueProps, "nutrientKey" | "value" | "aggregate">) {
  const amount = aggregate ? aggregate.amount : value;
  return formatNutrientAmount(amount, nutrientKey) === "—"
    ? "—"
    : `${formatNutrientAmount(amount, nutrientKey)} ${nutrientUnit(nutrientKey)}`;
}
