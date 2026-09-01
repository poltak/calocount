"use client";

import { useMemo, useState } from "react";

import { formatNutrientAmount, groupedNutrientKeys, nutrientGroupLabel, nutrientLabel, nutrientUnit, nutrientKeys, type NutrientAggregateMap, type NutrientGoalMap } from "./nutrient-meta";
import { knownAverage, trendCoverage, trendForNutrient } from "./nutrition-calculations";

type NutrientTrendPanelProps = {
  byDate: Array<{ date: string; nutrients: NutrientAggregateMap }>;
  goals?: NutrientGoalMap;
};

function dateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

export function NutrientTrendPanel({ byDate, goals }: NutrientTrendPanelProps) {
  const [selectedNutrient, setSelectedNutrient] = useState<string>(nutrientKeys[0] ?? "fiberG");
  const points = useMemo(() => trendForNutrient(byDate, selectedNutrient), [byDate, selectedNutrient]);
  const average = knownAverage(points);
  const coverage = trendCoverage(points);
  const goal = goals?.[selectedNutrient as keyof NutrientGoalMap];
  const max = Math.max(1, goal?.value ?? 0, ...points.map((point) => point.amount ?? 0));

  return <section className="panel chart-panel nutrient-trend-panel" id="nutrient-trend" aria-labelledby="nutrient-trend-title">
    <div className="panel-heading">
      <div><p className="eyebrow">One nutrient at a time</p><h2 id="nutrient-trend-title">Nutrient trend</h2></div>
      <span className="chart-range">Past 7 days</span>
    </div>
    <div className="nutrient-trend-controls">
      <label htmlFor="nutrient-trend-selector">Show</label>
      <select id="nutrient-trend-selector" value={selectedNutrient} onChange={(event) => setSelectedNutrient(event.target.value)}>
        {groupedNutrientKeys().map(({ group, keys }) => <optgroup key={group} label={nutrientGroupLabel(group)}>{keys.map((key) => <option key={key} value={key}>{nutrientLabel(key)}</option>)}</optgroup>)}
      </select>
      <span className="panel-meta">{nutrientUnit(selectedNutrient)}</span>
    </div>
    {points.length ? <>
      <div className="nutrient-trend-summary" aria-live="polite">
        <span>Known average <strong>{average === null ? "—" : `${average.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${nutrientUnit(selectedNutrient)}`}</strong></span>
        {goal?.value !== null && goal?.value !== undefined ? <span>Daily {goal.direction === "maximum" ? "limit" : "goal"} <strong>{formatNutrientAmount(goal.value, selectedNutrient)} {nutrientUnit(selectedNutrient)}</strong></span> : <span>No daily goal</span>}
        <span className={coverage.complete ? "coverage-complete" : "coverage-partial"}>{coverage.knownDays} of {coverage.totalDays} days known{coverage.complete ? "" : " · Partial"}</span>
      </div>
      <div className="nutrient-trend-chart" role="group" aria-label={`${nutrientLabel(selectedNutrient)} for the past seven days; missing days are shown as gaps`}>
        <div className="nutrient-trend-y-axis" aria-hidden="true"><span>{max.toLocaleString("en-US", { maximumFractionDigits: 1 })}</span><span>{(max / 2).toLocaleString("en-US", { maximumFractionDigits: 1 })}</span><span>0</span></div>
        <div className="nutrient-trend-plot">
          <div className="grid-line line-one" /><div className="grid-line line-two" /><div className="grid-line line-three" />
          {goal?.value !== null && goal?.value !== undefined ? <div className={`nutrient-trend-goal-line goal-${goal.direction}`} style={{ bottom: `${Math.min(100, (goal.value / max) * 100)}%` }}><span>{goal.direction === "maximum" ? "Limit" : "Goal"}</span></div> : null}
          <div className="nutrient-trend-bars">{points.map((point) => <div className={`nutrient-trend-column${point.amount === null ? " missing" : ""}`} key={point.date} role="img" aria-label={point.amount === null ? `${dateLabel(point.date)}: unknown` : `${dateLabel(point.date)}: ${point.amount} ${nutrientUnit(selectedNutrient)}`}>
            {point.amount === null ? <span className="nutrient-trend-gap" aria-hidden="true">—</span> : <><div className="bar-value">{point.amount.toLocaleString("en-US", { maximumFractionDigits: 1 })}</div><div className="bar nutrient-trend-bar" style={{ height: `${Math.max(8, (point.amount / max) * 100)}%` }} /></>}
            <span>{dateLabel(point.date)}</span>
          </div>)}</div>
        </div>
      </div>
    </> : <div className="chart-empty" role="status"><strong>No nutrient records for the past seven days</strong><span>Add nutrient estimates to see a trend.</span></div>}
  </section>;
}
