import {
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  type NutrientAggregateMap,
  type NutrientGoalMap,
  type NutrientKey,
  type NutrientValueMap,
} from "./nutrient-meta";
import { NutrientStat } from "./nutrient-stat";

type NutrientGroupProps = {
  title: string;
  nutrientKeys: readonly NutrientKey[];
  values?: NutrientAggregateMap | NutrientValueMap;
  goals?: NutrientGoalMap;
  id?: string;
  eyebrow?: string;
  className?: string;
};

function aggregateFor(values: NutrientAggregateMap | NutrientValueMap | undefined, key: NutrientKey) {
  const value = values?.[key];
  if (!value || typeof value !== "object" || !("amount" in value)) return { value: value as number | null | undefined, aggregate: null };
  return { value: undefined, aggregate: value };
}

export function NutrientGroup({ title, nutrientKeys, values, goals, id, eyebrow = "Nutrition", className = "" }: NutrientGroupProps) {
  return <section className={`panel nutrient-group-panel ${className}`.trim()} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
    <div className="panel-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2 id={id ? `${id}-title` : undefined}>{title}</h2></div>
      <span className="panel-meta">amounts</span>
    </div>
    <div className="nutrient-stat-grid">
      {nutrientKeys.map((key) => {
        const selected = aggregateFor(values, key);
        return <NutrientStat key={key} nutrientKey={key} label={nutrientLabel(key)} value={selected.value} aggregate={selected.aggregate} goal={goals?.[key]} />;
      })}
    </div>
  </section>;
}

export function NutrientGroups({ values, goals, groups = groupedNutrientKeys(), className = "" }: { values?: NutrientAggregateMap | NutrientValueMap; goals?: NutrientGoalMap; groups?: ReturnType<typeof groupedNutrientKeys>; className?: string }) {
  return <div className={`nutrient-groups ${className}`.trim()}>
    {groups.map(({ group, keys }) => <NutrientGroup key={group} title={nutrientGroupLabel(group)} nutrientKeys={keys} values={values} goals={goals} />)}
  </div>;
}
