"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  calculateFoodScenario,
  calculateNutrientSourceDependence,
  calculateNutrientSourceExclusion,
  foodScenarioTradeoffText,
  foodScenarioMetricKeys,
  foodScenarioMultipliers,
  insightDateRange,
  scenarioFoodCandidates,
  type FoodScenarioMetric,
  type FoodScenarioMode,
  type FoodScenarioMultiplier,
  type InsightRange,
  type NutrientSource,
  type ScenarioFoodCandidate,
} from "./nutrient-food-calculations";
import {
  nutrientKeys,
  nutrientMeta,
  type NutrientGoalMap,
  type NutrientKey,
} from "../nutrition/nutrient-meta";
import type { InsightEntry } from "./types";

export type NutrientFoodScenariosProps = {
  entries: InsightEntry[];
  currentDate: string;
  goals: NutrientGoalMap;
  /** Nutrient selected from the attention panel; used to orient both views. */
  focusedNutrient?: NutrientKey | null;
};

const ranges: readonly InsightRange[] = [14, 28];

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
}

function formatAmount(value: number | null, key: FoodScenarioMetric["key"]) {
  if (value === null || !Number.isFinite(value)) return "Unknown";
  const digits = key === "calories" ? 0 : key === "proteinG" ? 1 : nutrientMeta(key).precision;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function formatMetricValue(value: number | null, metric: FoodScenarioMetric) {
  return value === null ? "Unknown" : `${formatAmount(value, metric.key)} ${metric.unit}`;
}

function formatDelta(metric: FoodScenarioMetric) {
  if (metric.delta === null) return "Unknown";
  const digits = metric.key === "calories" ? 0 : metric.key === "proteinG" ? 1 : nutrientMeta(metric.key).precision;
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(metric.delta);
  return `${amount} ${metric.unit}`;
}

function candidateLabel(candidate: ScenarioFoodCandidate) {
  const quantity = candidate.item.quantity == null
    ? ""
    : ` · ${candidate.item.quantity}${candidate.item.unit ? ` ${candidate.item.unit}` : ""}`;
  return `${candidate.label}${quantity} · ${formatDate(candidate.date)}`;
}

function goalLabel(metric: FoodScenarioMetric, goals: NutrientGoalMap) {
  if (metric.key === "calories" || metric.key === "proteinG") return null;
  const goal = goals[metric.key];
  if (!goal || goal.value === null) return null;
  return `${goal.direction === "minimum" ? "minimum" : "maximum"} ${formatAmount(goal.value, metric.key)} ${metric.unit}`;
}

function referencePercent(value: number | null, metric: FoodScenarioMetric, goals: NutrientGoalMap) {
  if (value === null || metric.key === "calories" || metric.key === "proteinG") return null;
  const goal = goals[metric.key];
  if (!goal || goal.value === null || goal.value <= 0) return null;
  return { value: value / goal.value * 100, direction: goal.direction };
}

function ReferenceProgress({ value, metric, goals, side }: {
  value: number | null;
  metric: FoodScenarioMetric;
  goals: NutrientGoalMap;
  side: "before" | "after";
}) {
  const reference = referencePercent(value, metric, goals);
  if (!reference) return null;
  const percent = Math.max(0, reference.value);
  const label = reference.direction === "minimum" ? "minimum reference" : "maximum reference";
  return <span
    className={`nutrient-food-scenarios__reference ${reference.direction === "maximum" && percent > 100 ? "is-over" : ""}`}
    aria-label={`${metric.label} ${side}: ${Math.round(percent)}% of ${label}`}
  >
    <span className="nutrient-food-scenarios__reference-label">{Math.round(percent)}% of {reference.direction === "minimum" ? "minimum" : "maximum"}</span>
    <span className="nutrient-food-scenarios__reference-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, percent)}%` }} /></span>
  </span>;
}

function rangeLabel(range: InsightRange, currentDate: string) {
  const { startDate, endDate } = insightDateRange(currentDate, range);
  return `${formatDate(startDate)}–${formatDate(endDate)}`;
}

function rangeControls(range: InsightRange, onChange: (range: InsightRange) => void, label: string) {
  return <div className="nutrient-food-scenarios__range" aria-label={label}>
    {ranges.map((value) => <button
      type="button"
      key={value}
      aria-pressed={range === value}
      className={range === value ? "is-active" : ""}
      onClick={() => onChange(value)}
    >{value} days</button>)}
  </div>;
}

function ScenarioMetricTable({
  metrics,
  goals,
}: {
  metrics: FoodScenarioMetric[];
  goals: NutrientGoalMap;
}) {
  const ordered = [...metrics].sort((left, right) => {
    const rank = (metric: FoodScenarioMetric) => {
      if (metric.key === "calories") return 0;
      if (metric.key === "proteinG") return 1;
      if (goals[metric.key].value !== null) return 2;
      return 3;
    };
    return Number(left.delta === null) - Number(right.delta === null) || rank(left) - rank(right) || foodScenarioMetricKeys.indexOf(left.key) - foodScenarioMetricKeys.indexOf(right.key);
  });
  const known = ordered.filter((metric) => metric.delta !== null);
  const unavailable = ordered.filter((metric) => metric.delta === null);
  const table = (rows: FoodScenarioMetric[], caption: string) => <table className="nutrient-food-scenarios__scenario-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">Nutrient</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Change</th></tr></thead>
    <tbody>{rows.map((metric) => <tr key={metric.key} className={metric.delta === null ? "is-unknown" : ""}>
      <th scope="row"><span>{metric.label}</span>{goalLabel(metric, goals) ? <small>{goalLabel(metric, goals)}</small> : null}</th>
      <td data-label="Before"><span className="nutrient-food-scenarios__metric-value">{formatMetricValue(metric.before, metric)}</span><ReferenceProgress value={metric.before} metric={metric} goals={goals} side="before" /></td>
      <td data-label="After"><span className="nutrient-food-scenarios__metric-value">{formatMetricValue(metric.after, metric)}</span><ReferenceProgress value={metric.after} metric={metric} goals={goals} side="after" /></td>
      <td data-label="Change" className={metric.delta === null ? "" : metric.delta > 0 ? "is-increase" : metric.delta < 0 ? "is-decrease" : ""}>{formatDelta(metric)}</td>
    </tr>)}</tbody>
  </table>;
  return <div className="nutrient-food-scenarios__table-wrap">
    {table(known, "Known recorded amounts for one hypothetical portion")}
    {unavailable.length ? <details className="nutrient-food-scenarios__unavailable">
      <summary>Show unavailable nutrients ({unavailable.length})</summary>
      <div className="nutrient-food-scenarios__unavailable-table">{table(unavailable, "Unavailable nutrient values for one hypothetical portion")}</div>
    </details> : null}
  </div>;
}

function ScenarioFoodSelect({
  label,
  candidates,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  candidates: ScenarioFoodCandidate[];
  value: ScenarioFoodCandidate | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return <label className="nutrient-food-scenarios__select-label">
    <span>{label}</span>
    <select value={value?.id ?? ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
      {!candidates.length ? <option value="">No logged foods in this range</option> : null}
      {candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidateLabel(candidate)}</option>)}
    </select>
  </label>;
}

function FoodScenarioPanel({
  entries,
  currentDate,
  goals,
  focusedNutrient,
}: NutrientFoodScenariosProps) {
  const [range, setRange] = useState<InsightRange>(28);
  const [mode, setMode] = useState<FoodScenarioMode>("addition");
  const [multiplier, setMultiplier] = useState<FoodScenarioMultiplier>(1);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const candidates = useMemo(() => scenarioFoodCandidates({ entries, currentDate, range, prioritizeNutrient: focusedNutrient ?? undefined }), [entries, currentDate, focusedNutrient, range]);
  const candidate = candidates.find((item) => item.id === candidateId) ?? candidates[0] ?? null;
  const before = candidates.find((item) => item.id === beforeId) ?? candidates[0] ?? null;
  const after = candidates.find((item) => item.id === afterId)
    ?? candidates.find((item) => item.label.toLocaleLowerCase() !== before?.label.toLocaleLowerCase())
    ?? candidates.find((item) => item.id !== before?.id)
    ?? candidates[0]
    ?? null;
  const scenario = useMemo(() => {
    if (mode === "addition") return candidate ? calculateFoodScenario({ mode, item: candidate.item, multiplier }) : null;
    if (!before || !after) return null;
    return calculateFoodScenario({ mode, before: before.item, after: after.item, multiplier });
  }, [after, before, candidate, mode, multiplier]);

  return <article className="nutrient-food-scenarios__panel" aria-labelledby="nutrient-food-change-title">
    <div className="nutrient-food-scenarios__heading">
      <div>
        <p className="eyebrow">Food changes</p>
        <h3 id="nutrient-food-change-title">Compare a food change</h3>
      </div>
      {rangeControls(range, setRange, "Food change date range")}
    </div>
    <p className="nutrient-food-scenarios__description">
      Choose a logged portion from {rangeLabel(range, currentDate)}. The comparison is hypothetical and does not log a meal or change your totals; missing nutrient values stay unknown.
    </p>
    {focusedNutrient ? <p className="nutrient-food-scenarios__focus-note">Focused finding: <strong>{nutrientMeta(focusedNutrient).label}</strong>. Logged candidates with a known amount of this nutrient are shown first.</p> : null}
    <div className="nutrient-food-scenarios__scenario-controls">
      <label className="nutrient-food-scenarios__select-label">
        <span>Change type</span>
        <select value={mode} onChange={(event) => setMode(event.target.value as FoodScenarioMode)}>
          <option value="addition">Add a logged food</option>
          <option value="replacement">Replace one logged food</option>
        </select>
      </label>
      {mode === "addition" ? <ScenarioFoodSelect label="Food to add" candidates={candidates} value={candidate} onChange={setCandidateId} disabled={!candidates.length} /> : <>
        <ScenarioFoodSelect label="Food being replaced" candidates={candidates} value={before} onChange={setBeforeId} disabled={!candidates.length} />
        <ScenarioFoodSelect label="Replacement food" candidates={candidates} value={after} onChange={setAfterId} disabled={!candidates.length} />
      </>}
      <div className="nutrient-food-scenarios__multiplier" aria-label="Logged portion multiplier">
        <span>Portion</span>
        <div>{foodScenarioMultipliers.map((value) => <button
          type="button"
          key={value}
          aria-pressed={multiplier === value}
          className={multiplier === value ? "is-active" : ""}
          onClick={() => setMultiplier(value)}
        >{value}×</button>)}</div>
      </div>
    </div>
    {scenario ? <div className="nutrient-food-scenarios__scenario-result" aria-live="polite">
      <p className="nutrient-food-scenarios__scenario-summary">
        {scenario.mode === "addition" ? `Adding ${scenario.afterName}` : `Replacing ${scenario.beforeName ?? "the selected food"} with ${scenario.afterName}`} at {scenario.multiplier}× the logged portion. <span>{scenario.knownMetricCount} of {scenario.metrics.length} tracked values have a known change.</span>
      </p>
      <p className="nutrient-food-scenarios__tradeoff"><strong>Tradeoff:</strong> {foodScenarioTradeoffText(scenario, { focusedNutrient })}</p>
      <ScenarioMetricTable metrics={scenario.metrics} goals={goals} />
    </div> : <div className="nutrient-food-scenarios__empty" role="status">Log a food with this date range to compare a hypothetical change.</div>}
  </article>;
}

function formatSourceAmount(source: NutrientSource, nutrientKey: NutrientKey) {
  return source.amount === null ? "Unknown" : `${formatAmount(source.amount, nutrientKey)} ${nutrientMeta(nutrientKey).unit}`;
}

function sourceCoverage(source: NutrientSource) {
  const itemCoverage = source.unknownItemCount ? `${source.knownItemCount} of ${source.totalItemCount} values known` : `${source.totalItemCount} values`;
  return `${source.entryCount} portion${source.entryCount === 1 ? "" : "s"} · ${source.dayCount} day${source.dayCount === 1 ? "" : "s"} · ${itemCoverage}`;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(timestamp));
}

function sourceConcentrationText(result: ReturnType<typeof calculateNutrientSourceDependence>, nutrientLabel: string) {
  const largest = result.allSources[0];
  if (!largest || result.largestSourceShare === null) {
    return `Concentration is unavailable because there is no positive known recorded ${nutrientLabel.toLowerCase()} amount.`;
  }
  const largestShare = Math.round(result.largestSourceShare * 100);
  const topThreeShare = result.topThreeSourceShare === null ? null : Math.round(result.topThreeSourceShare * 100);
  const habit = `The largest recorded source is ${largest.label}, appearing in ${largest.entryCount} portion${largest.entryCount === 1 ? "" : "s"} across ${largest.dayCount} day${largest.dayCount === 1 ? "" : "s"}.`;
  return `${largest.label} provides ${largestShare}% of known recorded ${nutrientLabel.toLowerCase()}; ${topThreeShare === null ? "the top-three share is unavailable" : `the top three sources provide ${topThreeShare}%`}. ${habit} This describes concentration in the log, not a health score.`;
}

function SourceDependencePanel({
  entries,
  currentDate,
  focusedNutrient,
}: {
  entries: InsightEntry[];
  currentDate: string;
  focusedNutrient?: NutrientKey | null;
}) {
  const [range, setRange] = useState<InsightRange>(28);
  const [nutrientKey, setNutrientKey] = useState<NutrientKey>(focusedNutrient ?? "fiberG");
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);
  const result = useMemo(() => calculateNutrientSourceDependence({ entries, currentDate, range, nutrientKey }), [entries, currentDate, nutrientKey, range]);
  const rows = result.other ? [...result.sources, result.other] : result.sources;
  const selectedSource = selectedSourceKey === null ? null : rows.find((source) => source.key === selectedSourceKey) ?? result.allSources.find((source) => source.key === selectedSourceKey) ?? null;
  const exclusion = selectedSource ? calculateNutrientSourceExclusion(result, selectedSource.key) : null;
  const meta = nutrientMeta(nutrientKey);

  return <article className="nutrient-food-scenarios__panel" aria-labelledby="nutrient-source-title">
    <div className="nutrient-food-scenarios__heading">
      <div>
        <p className="eyebrow">Food sources</p>
        <h3 id="nutrient-source-title">Where a nutrient comes from</h3>
      </div>
      {rangeControls(range, setRange, "Nutrient source date range")}
    </div>
    <div className="nutrient-food-scenarios__source-controls">
      <label className="nutrient-food-scenarios__select-label">
        <span>Nutrient</span>
        <select value={nutrientKey} onChange={(event) => { setNutrientKey(event.target.value as NutrientKey); setSelectedSourceKey(null); }}>
          {nutrientKeys.map((key) => <option value={key} key={key}>{nutrientMeta(key).label}</option>)}
        </select>
      </label>
      <p className="nutrient-food-scenarios__source-coverage">
        {rangeLabel(range, currentDate)} · {result.knownTotal === null ? "No known recorded amount" : `${formatAmount(result.knownTotal, nutrientKey)} ${meta.unit} known`} · {result.knownItemCount} of {result.totalItemCount} item values known
      </p>
    </div>
    <p className="nutrient-food-scenarios__description">
      Sources use exact food names after trimming whitespace and ignoring case. Shares describe recorded known {meta.label.toLowerCase()} only; {result.unknownItemCount ? `${result.unknownItemCount} item value${result.unknownItemCount === 1 ? " is" : "s are"} unknown.` : "all matching item values are known."}
    </p>
    {focusedNutrient ? <p className="nutrient-food-scenarios__focus-note">Showing sources for the selected <strong>{meta.label}</strong> finding.</p> : null}
    {rows.length ? <div className="nutrient-food-scenarios__source-summary">
      <div><small>Recorded entries</small><strong>{result.recordedEntryCount} · {result.recordedDayCount} days</strong></div>
      <div><small>Largest source</small><strong>{result.largestSourceShare === null ? "Unavailable" : `${Math.round(result.largestSourceShare * 100)}%`}</strong></div>
      <div><small>Top three</small><strong>{result.topThreeSourceShare === null ? "Unavailable" : `${Math.round(result.topThreeSourceShare * 100)}%`}</strong></div>
      <p>{sourceConcentrationText(result, meta.label)}</p>
    </div> : null}
    {rows.length ? <>
      {rows.some((source) => source.share !== null && source.share > 0) ? <div className="nutrient-food-scenarios__stack" role="group" aria-label={`Recorded ${meta.label.toLowerCase()} contributions by food source`}>
        {rows.map((source, index) => source.share !== null && source.share > 0 ? <button
          type="button"
          key={source.key}
          className={`nutrient-food-scenarios__stack-segment source-color-${index % 6}`}
          style={{ width: `${source.share * 100}%` } as CSSProperties}
          aria-label={`${source.label}: ${Math.round(source.share * 100)}% of known recorded ${meta.label.toLowerCase()}. Select to inspect.`}
          onClick={() => setSelectedSourceKey(source.key)}
        /> : null)}
      </div> : <div className="nutrient-food-scenarios__source-no-chart">Known recorded amounts are zero, so percentage shares are unavailable.</div>}
      <div className="nutrient-food-scenarios__source-legend" aria-label="Nutrient source contributions">
        {rows.map((source, index) => <div className="nutrient-food-scenarios__source-row" key={source.key}>
          <span className={`nutrient-food-scenarios__source-swatch source-color-${index % 6}`} aria-hidden="true" />
          <button type="button" className="nutrient-food-scenarios__source-name" aria-pressed={selectedSourceKey === source.key} onClick={() => setSelectedSourceKey(source.key)}>
            <span>{source.label}</span>
            <small>{formatSourceAmount(source, nutrientKey)} · {source.share === null ? "share unavailable" : `${Math.round(source.share * 100)}%`} · {sourceCoverage(source)}</small>
          </button>
          <button type="button" className="nutrient-food-scenarios__exclude" onClick={() => setSelectedSourceKey(source.key)}>Exclude</button>
        </div>)}
      </div>
      {selectedSource && exclusion ? <div className="nutrient-food-scenarios__source-detail" aria-live="polite">
        <div>
          <p className="eyebrow">Hypothetical exclusion</p>
          <h4>{exclusion.sourceLabel}</h4>
          <p>Removing this source from the calculation leaves {exclusion.remainingKnownAmount === null ? "an unknown" : `${formatAmount(exclusion.remainingKnownAmount, nutrientKey)} ${meta.unit}`} recorded known {meta.label.toLowerCase()}. Records are unchanged; this is a what-if view.</p>
          <p>{selectedSource.entryCount} matching portion{selectedSource.entryCount === 1 ? "" : "s"} across {selectedSource.dayCount} day{selectedSource.dayCount === 1 ? "" : "s"}; values below are from the logged portions.</p>
        </div>
        <div className="nutrient-food-scenarios__source-stats">
          <span><small>Source amount</small><strong>{exclusion.excludedKnownAmount === null ? "Unknown" : `${formatAmount(exclusion.excludedKnownAmount, nutrientKey)} ${meta.unit}`}</strong></span>
          <span><small>Unknown values removed</small><strong>{exclusion.excludedUnknownItemCount}</strong></span>
        </div>
        <h5>Matching entries</h5>
        <ul className="nutrient-food-scenarios__source-entries">
          {selectedSource.entries.map((entry, index) => <li key={`${entry.entryId}-${entry.date}-${index}`}><span><strong>{entry.itemName}</strong><small>{formatDate(entry.date)} · {formatTime(entry.consumedAt)}{entry.quantity === null ? "" : ` · ${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`}</small></span><strong>{entry.value === null ? "Unknown" : `${formatAmount(entry.value, nutrientKey)} ${meta.unit}`}</strong></li>)}
        </ul>
      </div> : null}
    </> : <div className="nutrient-food-scenarios__empty" role="status">No food entries are available in this date range.</div>}
  </article>;
}

export function NutrientFoodScenarios({ entries, currentDate, goals, focusedNutrient = null }: NutrientFoodScenariosProps) {
  return <section className="panel nutrient-food-scenarios" id="nutrient-food-scenarios" aria-labelledby="nutrient-food-scenarios-title">
    <div className="nutrient-food-scenarios__title">
      <h2 id="nutrient-food-scenarios-title">Nutrition food insights</h2>
      <p>Use recorded food portions to explore practical nutrient changes and see which foods supply the nutrients you track.</p>
    </div>
    <div className="nutrient-food-scenarios__panels">
      <FoodScenarioPanel key={`food-scenario-${focusedNutrient ?? "none"}`} entries={entries} currentDate={currentDate} goals={goals} focusedNutrient={focusedNutrient} />
      <SourceDependencePanel key={`source-dependence-${focusedNutrient ?? "none"}`} entries={entries} currentDate={currentDate} focusedNutrient={focusedNutrient} />
    </div>
  </section>;
}
