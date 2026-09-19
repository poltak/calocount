"use client";

import { useMemo, useState } from "react";
import type { InsightDay, InsightEntry } from "./types";
import {
  calculateWaterfall,
  calculateWeeklyChanges,
  type WaterfallContribution,
  type WeeklyMetricKey,
} from "./weekly-changes-calculations";

export type WeeklyChangesProps = {
  days: InsightDay[];
  entries: InsightEntry[];
  currentDate: string;
};

const metricMeta: Record<WeeklyMetricKey, { label: string; unit: string; digits: number }> = {
  calories: { label: "Calories", unit: "kcal", digits: 0 },
  proteinG: { label: "Protein", unit: "g", digits: 1 },
  fiberG: { label: "Fiber", unit: "g", digits: 1 },
  sodiumMg: { label: "Sodium", unit: "mg", digits: 0 },
  caffeineMg: { label: "Caffeine", unit: "mg", digits: 0 },
};

function format(value: number | null, key: WeeklyMetricKey, signed = false) {
  if (value === null) return "Unavailable";
  const meta = metricMeta[key];
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: meta.digits,
    minimumFractionDigits: 0,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
  return `${amount} ${meta.unit}`;
}

function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function periodLabel(start: string, end: string) {
  return `${shortDate(start)}–${shortDate(end)}`;
}

function coverage(itemCount: number | null, totalCount: number | null) {
  if (itemCount === null || totalCount === null) return null;
  return `${itemCount} of ${totalCount} items have values`;
}

function WaterfallChart({ before, after, items, selected, metric, onSelect }: {
  before: number;
  after: number;
  items: WaterfallContribution[];
  selected: string | null;
  metric: WeeklyMetricKey;
  onSelect: (key: string) => void;
}) {
  const built = items.reduce((state, item) => {
    const end = state.running + item.difference;
    return {
      running: end,
      geometry: [...state.geometry, { item, start: state.running, end }],
      values: [...state.values, state.running, end],
    };
  }, {
    running: before,
    geometry: [] as Array<{ item: WaterfallContribution; start: number; end: number }>,
    values: [0, before, after],
  });
  const { geometry, values } = built;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const plotTop = 30;
  const plotHeight = 170;
  const y = (value: number) => plotTop + ((max - value) / span) * plotHeight;
  const columns = items.length + 2;
  const plotLeft = 62;
  const plotWidth = 520;
  const step = plotWidth / columns;
  const width = Math.min(50, step * 0.58);
  const bars = [
    { key: "before", label: "Before", start: 0, end: before, total: true },
    ...geometry.map(({ item, start, end }) => ({ key: item.key, label: item.label, start, end, total: false })),
    { key: "after", label: "After", start: 0, end: after, total: true },
  ];
  return (
    <svg className="weekly-waterfall" viewBox="0 0 600 260" role="img" aria-label={`${metricMeta[metric].label} average change waterfall`}>
      {[max, (max + min) / 2, min].map((tick) => <g key={tick}>
        <line x1={plotLeft} x2={582} y1={y(tick)} y2={y(tick)} className="weekly-waterfall-grid" />
        <text x="55" y={y(tick) + 4} textAnchor="end">{format(tick, metric)}</text>
      </g>)}
      <line x1={plotLeft} x2="582" y1={y(0)} y2={y(0)} className="weekly-waterfall-zero" />
      {bars.map((bar, index) => {
        const top = Math.min(y(bar.start), y(bar.end));
        const height = Math.abs(y(bar.start) - y(bar.end));
        const x = plotLeft + step * index + step / 2 - width / 2;
        const contribution = items.find((item) => item.key === bar.key);
        const interactive = Boolean(contribution);
        return (
          <g key={bar.key} role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${bar.label}, ${format(contribution?.difference ?? 0, metric, true)}. Show source entries.` : undefined}
            onClick={interactive ? () => onSelect(bar.key) : undefined}
            onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(bar.key); } } : undefined}>
            {index > 0 && !bar.total ? <line x1={x - step + width} x2={x} y1={y(bar.start)} y2={y(bar.start)} className="weekly-waterfall-connector" /> : null}
            {height > .01 ? <rect
              x={x} y={top} width={width} height={height} rx="1.5"
              className={`${bar.total ? "total" : bar.end >= bar.start ? "increase" : "decrease"}${selected === bar.key ? " selected" : ""}`}
            /> : <line x1={x} x2={x + width} y1={y(bar.start)} y2={y(bar.start)} className="weekly-waterfall-neutral" />}
            <text x={x + width / 2} y="225" textAnchor="middle">{bar.total ? bar.label : String(index)}</text>
          </g>
        );
      })}
      <text x="62" y="250">Daily average ({metricMeta[metric].unit})</text>
    </svg>
  );
}

export function WeeklyChanges({ days, entries, currentDate }: WeeklyChangesProps) {
  const result = useMemo(() => calculateWeeklyChanges(days, entries, currentDate), [days, entries, currentDate]);
  const [selectedMetric, setSelectedMetric] = useState<WeeklyMetricKey>("calories");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const waterfall = calculateWaterfall(result.previous, result.current, selectedMetric);
  const selected = waterfall.find((item) => item.key === selectedKey) ?? null;
  const before = result.metrics[selectedMetric].previous.average;
  const after = result.metrics[selectedMetric].current.average;
  const hasComparison = before !== null && after !== null;

  return (
    <section className="panel weekly-changes" aria-labelledby="weekly-changes-title">
      <div className="panel-heading weekly-changes-heading">
        <div>
          <h2 id="weekly-changes-title">What changed this week?</h2>
          <p className="panel-meta">Daily averages use recorded days only. Today is excluded.</p>
        </div>
      </div>

      <div className="weekly-period-key" aria-label="Compared periods">
        <span><i className="previous" />Before · {periodLabel(result.previous.start, result.previous.end)} · {result.previous.days.length}/7 recorded days</span>
        <span><i className="current" />After · {periodLabel(result.current.start, result.current.end)} · {result.current.days.length}/7 recorded days</span>
      </div>

      <div className="weekly-metrics">
        {(Object.keys(metricMeta) as WeeklyMetricKey[]).map((key) => {
          const comparison = result.metrics[key];
          const nutrient = key !== "calories" && key !== "proteinG";
          const difference = comparison.previous.average === null || comparison.current.average === null
            ? null : comparison.current.average - comparison.previous.average;
          return (
            <article className={`weekly-metric${selectedMetric === key ? " selected" : ""}`} key={key}>
              <button type="button" aria-pressed={selectedMetric === key} onClick={() => { setSelectedMetric(key); setSelectedKey(null); }}>
              <h3>{metricMeta[key].label}{nutrient ? <small>known logged amount</small> : null}</h3>
              <div className="weekly-metric-values">
                <span><small>Before</small><strong>{format(comparison.previous.average, key)}</strong></span>
                <span><small>After</small><strong>{format(comparison.current.average, key)}</strong></span>
              </div>
              <p>{difference === null ? "Change unavailable" : `${format(difference, key, true)} per recorded day`}</p>
              {nutrient ? (
                <p className="weekly-coverage">Coverage: {coverage(comparison.previous.knownItemCount, comparison.previous.totalItemCount)} before; {coverage(comparison.current.knownItemCount, comparison.current.totalItemCount)} after.</p>
              ) : null}
              </button>
            </article>
          );
        })}
      </div>

      <div className="weekly-breakdown">
        <div>
          <h3>What contributed to the {metricMeta[selectedMetric].label.toLowerCase()} change?</h3>
          <p>Matching food and drink names are grouped. Values are {metricMeta[selectedMetric].unit} per recorded day.</p>
        </div>
        {!hasComparison ? (
          <div className="weekly-unavailable">A comparison needs at least one recorded day in both periods.</div>
        ) : (
          <>
            <div className="weekly-waterfall-legend"><span className="total">Period totals</span><span className="increase">Increase</span><span className="decrease">Decrease</span></div>
            <WaterfallChart before={before} after={after} items={waterfall} selected={selectedKey} metric={selectedMetric} onSelect={setSelectedKey} />
            <ol className="weekly-contribution-list">
              {waterfall.map((item, index) => (
                <li key={item.key}>
                  <button type="button" aria-pressed={selectedKey === item.key} onClick={() => setSelectedKey(item.key)}>
                    <span><b>{index + 1}</b>{item.label}</span>
                    <strong className={item.difference >= 0 ? "increase" : "decrease"}>{format(item.difference, selectedMetric, true)}</strong>
                    <small>{format(item.previous, selectedMetric)} → {format(item.current, selectedMetric)}</small>
                  </button>
                </li>
              ))}
            </ol>
            {selected ? <ContributionDetails item={selected} metric={selectedMetric} /> : null}
          </>
        )}
      </div>
    </section>
  );
}

function ContributionDetails({ item, metric }: { item: WaterfallContribution; metric: WeeklyMetricKey }) {
  return (
    <div className="weekly-source-detail" aria-live="polite">
      <h4>{item.label}</h4>
      <p>Before {format(item.previous, metric)} · After {format(item.current, metric)}</p>
      {item.kind === "unavailable" ? <p>Available entry details do not fully match the recorded daily totals, so this amount cannot be assigned to a food or drink.</p> : (
        <div className="weekly-source-columns">
          <SourceList label="Before sources" sources={item.previousSources} metric={metric} />
          <SourceList label="After sources" sources={item.currentSources} metric={metric} />
        </div>
      )}
    </div>
  );
}

function SourceList({ label, sources, metric }: { label: string; sources: WaterfallContribution["previousSources"]; metric: WeeklyMetricKey }) {
  return (
    <div><h5>{label}</h5>{sources.length ? <ul>{sources.map((source, index) => (
      <li key={`${source.id}-${index}`}><span>{source.name} · {shortDate(source.date)}</span><strong>{format(source.amount, metric)} logged · {format(source.contribution, metric)}/recorded day</strong></li>
    ))}</ul> : <p>No matching entry details.</p>}</div>
  );
}
