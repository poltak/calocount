"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ProteinGoalDay } from "../domain/protein-goals";
import type { NutrientAggregateMap, NutrientGoalMap, NutrientKey, NutrientValueMap } from "./nutrition/nutrient-meta";
import { nutrientLabel, nutrientUnit } from "./nutrition/nutrient-meta";
import { TrendRangeSelect, type TrendRangeDays } from "./trend-range-select";

type TrendDatum = {
  date: string;
  label: string;
  proteinG: number;
  mealCount: number;
  nutrients: NutrientAggregateMap;
};

type FoodItem = {
  name: string;
  calories?: number;
  proteinG?: number;
  nutrients?: NutrientValueMap;
};

type LoggedMeal = { items: FoodItem[] };
type LoggedDay = { date: string; meals: LoggedMeal[] };

function format(value: number, digits = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function showDate(index: number, total: number) {
  return total <= 7 || index === 0 || index === total - 1 || (index % 7 === 0 && index < total - 2);
}

export function ProteinTargetChart({
  days,
  goalByDate,
  fallbackTarget,
  range,
  onRangeChange,
}: {
  days: TrendDatum[];
  goalByDate: ProteinGoalDay[];
  fallbackTarget: number | null;
  range: TrendRangeDays;
  onRangeChange: (range: TrendRangeDays) => void;
}) {
  const targets = new Map(goalByDate.map((entry) => [entry.date, entry.targetG]));
  const values = days.map((day) => ({ ...day, target: targets.get(day.date) ?? fallbackTarget }));
  const max = Math.max(1, ...values.flatMap((day) => [day.proteinG, day.target ?? 0])) * 1.12;
  const knownDays = values.filter((day) => day.mealCount > 0);
  const average = knownDays.length ? knownDays.reduce((sum, day) => sum + day.proteinG, 0) / knownDays.length : 0;
  const targetDays = knownDays.filter((day) => day.target !== null && day.target > 0);
  const hitDays = targetDays.filter((day) => day.proteinG >= (day.target ?? Infinity)).length;

  return <section className="panel chart-panel protein-target-panel" aria-labelledby="protein-target-title">
    <div className="panel-heading">
      <div><p className="eyebrow">Daily amount</p><h2 id="protein-target-title">Protein vs target</h2></div>
      <TrendRangeSelect value={range} onChange={onRangeChange} label="Protein versus target" />
    </div>
    <div className="insight-summary">
      <span><strong>{format(average)} g</strong> known-day average</span>
      <span><strong>{hitDays} of {targetDays.length}</strong> recorded days met target</span>
    </div>
    <div className={`protein-target-chart${range === 30 ? " is-month" : ""}`} role="group" aria-label={`Daily protein in grams compared with the protein target for the past ${range} days`}>
      {values.map((day, index) => {
        const targetPercent = day.target ? Math.min(100, (day.target / max) * 100) : null;
        return <button className={`protein-target-day${day.mealCount > 0 ? "" : " missing"}`} key={day.date} type="button" aria-label={day.mealCount > 0
          ? `${day.label}: ${format(day.proteinG)} grams protein${day.target ? `, target ${format(day.target)} grams` : ""}`
          : `${day.label}: no entries recorded`}>
          <span className="protein-target-tooltip">{day.mealCount > 0 ? `${format(day.proteinG)}g${day.target ? ` / ${format(day.target)}g` : ""}` : "No meals"}</span>
          <span className="protein-target-track" aria-hidden="true">
            {targetPercent === null ? null : <i className="protein-target-marker" style={{ bottom: `${targetPercent}%` }} />}
            <i className="protein-target-fill" style={{ height: `${Math.min(100, (day.proteinG / max) * 100)}%` }} />
          </span>
          <span>{showDate(index, values.length) ? day.label : ""}</span>
        </button>;
      })}
    </div>
  </section>;
}

const foodMetrics = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g" },
] as const;

type FoodMetricKey = (typeof foodMetrics)[number]["key"];

export function FoodContributionChart({ days, visibleDates }: { days: LoggedDay[]; visibleDates: string[] }) {
  const [metric, setMetric] = useState<FoodMetricKey>("calories");
  const metricMeta = foodMetrics.find((entry) => entry.key === metric) ?? foodMetrics[0];
  const dateSet = useMemo(() => new Set(visibleDates), [visibleDates]);
  const rows = useMemo(() => {
    const totals = new Map<string, { label: string; value: number; occurrences: number }>();
    for (const day of days) {
      if (!dateSet.has(day.date)) continue;
      for (const item of day.meals.flatMap((meal) => meal.items)) {
        const raw = metric === "calories" || metric === "proteinG" ? item[metric] : item.nutrients?.[metric];
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) continue;
        const normalized = item.name.trim().toLocaleLowerCase();
        const current = totals.get(normalized) ?? { label: item.name.trim() || "Unnamed food", value: 0, occurrences: 0 };
        current.value += raw;
        current.occurrences += 1;
        totals.set(normalized, current);
      }
    }
    return [...totals.values()].sort((left, right) => right.value - left.value).slice(0, 6);
  }, [dateSet, days, metric]);
  const max = rows[0]?.value ?? 1;

  return <section className="panel chart-panel food-contribution-panel" aria-labelledby="food-contribution-title">
    <div className="panel-heading">
      <div><p className="eyebrow">What drives your totals</p><h2 id="food-contribution-title">Top food contributors</h2></div>
      <label className="compact-select">Show <select value={metric} onChange={(event) => setMetric(event.target.value as FoodMetricKey)}>{foodMetrics.map((entry) => <option value={entry.key} key={entry.key}>{entry.label}</option>)}</select></label>
    </div>
    {rows.length ? <div className="contribution-list" role="list" aria-label={`Foods contributing the most ${metricMeta.label.toLocaleLowerCase()}`}>
      {rows.map((row) => <div className="contribution-row" role="listitem" key={row.label}>
        <div className="contribution-label"><strong title={row.label}>{row.label}</strong><span>{row.occurrences} {row.occurrences === 1 ? "entry" : "entries"}</span></div>
        <div className="contribution-bar"><i style={{ width: `${(row.value / max) * 100}%` }} /></div>
        <span className="contribution-value">{format(row.value)} {metricMeta.unit}</span>
      </div>)}
    </div> : <div className="chart-empty compact-empty" role="status"><strong>No {metricMeta.label.toLocaleLowerCase()} data in this range</strong><span>Logged food items will appear here.</span></div>}
  </section>;
}

const matrixNutrients: NutrientKey[] = ["fiberG", "saturatedFatG", "sodiumMg", "potassiumMg", "calciumMg", "ironMg"];

export function NutrientConsistencyMatrix({ days, goals }: { days: TrendDatum[]; goals: NutrientGoalMap }) {
  const visible = days.slice(-7);
  return <section className="panel chart-panel consistency-panel" aria-labelledby="consistency-title">
    <div className="panel-heading">
      <div><p className="eyebrow">Seven-day pattern</p><h2 id="consistency-title">Nutrient consistency</h2></div>
      <span className="panel-meta">target progress</span>
    </div>
    <div className="matrix-legend" aria-hidden="true"><span><i className="matrix-key low" /> Low</span><span><i className="matrix-key met" /> Goal met</span><span><i className="matrix-key partial" /> Partial data</span></div>
    <div className="consistency-scroll">
      <div className="consistency-matrix" style={{ "--matrix-columns": visible.length } as CSSProperties}>
        <div />{visible.map((day) => <strong className="matrix-date" key={day.date}>{day.label.replace(" ", "\n")}</strong>)}
        {matrixNutrients.map((key) => {
          const goal = goals[key];
          return <div className="matrix-row" key={key}>
            <div className="matrix-label"><strong>{nutrientLabel(key)}</strong><span>{goal?.direction === "maximum" ? "limit" : "goal"} {goal?.value ? `${format(goal.value)} ${nutrientUnit(key)}` : "off"}</span></div>
            {visible.map((day) => {
              const aggregate = day.nutrients[key];
              const amount = aggregate?.amount;
              const progress = typeof amount === "number" && goal?.value ? (amount / goal.value) * 100 : null;
              const met = progress !== null && (goal.direction === "minimum" ? progress >= 100 : progress <= 100);
              const intensity = progress === null ? 0 : goal?.direction === "maximum" ? Math.min(100, Math.max(12, progress)) : Math.min(100, Math.max(12, progress));
              const coverage = aggregate && aggregate.totalItemCount > 0 ? aggregate.knownItemCount / aggregate.totalItemCount : 0;
              const state = progress === null ? "unknown" : met ? "met" : goal?.direction === "maximum" ? "over" : "low";
              const label = progress === null ? "unknown" : `${format(amount ?? 0)} ${nutrientUnit(key)}, ${Math.round(progress)}% of ${goal?.direction === "maximum" ? "limit" : "goal"}`;
              return <button type="button" className={`matrix-cell ${state}${coverage < 1 && progress !== null ? " partial" : ""}`} style={{ "--cell-intensity": `${intensity}%`, "--cell-coverage": coverage } as CSSProperties} key={day.date} aria-label={`${day.label}, ${nutrientLabel(key)}: ${label}`}><span>{progress === null ? "—" : `${Math.round(progress)}%`}</span></button>;
            })}
          </div>;
        })}
      </div>
    </div>
  </section>;
}
