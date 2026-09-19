"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  calculateFrequencyPortion,
  frequencyAxisMaximum,
  frequencyPortionMetrics,
  type FrequencyPortionMetric,
  type FrequencyPortionRange,
} from "./frequency-portion-calculations";
import type { InsightDay, InsightEntry } from "./types";

const WIDTH = 720;
const HEIGHT = 340;
const PLOT = { left: 104, right: 22, top: 22, bottom: 54 };

function format(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
}

function ticks(max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, index) => (max * index) / count);
}

export function FrequencyPortion({
  entries,
  days,
  currentDate,
}: {
  entries: InsightEntry[];
  days: InsightDay[];
  currentDate: string;
}) {
  const [range, setRange] = useState<FrequencyPortionRange>(30);
  const [metric, setMetric] = useState<FrequencyPortionMetric>("calories");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const result = useMemo(
    () => calculateFrequencyPortion({ entries, currentDate, range, metric }),
    [currentDate, entries, metric, range],
  );
  const metricMeta = frequencyPortionMetrics.find((candidate) => candidate.key === metric) ?? frequencyPortionMetrics[0];
  const plotted = result.points.filter((point) => point.averageValue !== null);
  const selected = result.points.find((point) => point.key === selectedKey) ?? result.points[0] ?? null;
  const maxX = frequencyAxisMaximum(plotted.map((point) => point.occurrencesPerWeek));
  const maxY = frequencyAxisMaximum(plotted.map((point) => point.averageValue ?? 0));
  const xTicks = ticks(maxX);
  const yTicks = ticks(maxY);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const selectedDays = days.filter((day) => day.date >= result.startDate && day.date <= result.endDate);
  const loggedDays = selectedDays.filter((day) => day.mealCount > 0).length;

  function choose(key: string) {
    setSelectedKey(key);
  }

  function pointKeyDown(event: KeyboardEvent<SVGGElement>, key: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(key);
    }
  }

  return <section className="panel frequency-portion" aria-labelledby="frequency-portion-title">
    <div className="frequency-portion__heading">
      <div>
        <p className="eyebrow">Food patterns</p>
        <h2 id="frequency-portion-title">Frequency &amp; amount</h2>
      </div>
      <div className="frequency-portion__controls">
        <div className="frequency-portion__range" aria-label="Frequency and amount date range">
          {([7, 30] as const).map((value) => <button
            className={range === value ? "is-active" : ""}
            type="button"
            aria-pressed={range === value}
            onClick={() => setRange(value)}
            key={value}
          >{value} days</button>)}
        </div>
        <label>Amount
          <select value={metric} onChange={(event) => setMetric(event.target.value as FrequencyPortionMetric)}>
            {frequencyPortionMetrics.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </div>

    <p className="frequency-portion__explanation">
      Each dot is one exact food name. Frequency uses all {result.elapsedDays} calendar days ending yesterday; amount is the average known {metricMeta.label.toLowerCase()} per log entry, not a standard serving or per-gram value.
    </p>
    <p className="frequency-portion__coverage">
      {formatDate(result.startDate)}–{formatDate(result.endDate)} · {loggedDays} of {result.elapsedDays} days have logs
    </p>

    {result.points.length ? <div className="frequency-portion__layout">
      <div className="frequency-portion__visual">
        {plotted.length ? <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="frequency-portion-chart-title frequency-portion-chart-desc">
          <title id="frequency-portion-chart-title">Food logging frequency versus average {metricMeta.label.toLowerCase()}</title>
          <desc id="frequency-portion-chart-desc">Horizontal axis shows occurrences per week across the full {range}-day window. Vertical axis shows average known {metricMeta.label.toLowerCase()} per log entry. Use the food list below to select overlapping points.</desc>
          {yTicks.map((tick) => {
            const y = PLOT.top + plotHeight - (tick / maxY) * plotHeight;
            return <g className="frequency-portion__tick frequency-portion__tick--y" key={`y-${tick}`}>
              <line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} />
              <text x={PLOT.left - 10} y={y + 4} textAnchor="end">{format(tick)}</text>
            </g>;
          })}
          {xTicks.map((tick) => {
            const x = PLOT.left + (tick / maxX) * plotWidth;
            return <g className="frequency-portion__tick" key={`x-${tick}`}>
              <line x1={x} x2={x} y1={PLOT.top} y2={HEIGHT - PLOT.bottom} />
              <text x={x} y={HEIGHT - PLOT.bottom + 22} textAnchor="middle">{format(tick)}</text>
            </g>;
          })}
          <text className="frequency-portion__axis-label" x={PLOT.left + plotWidth / 2} y={HEIGHT - 8} textAnchor="middle">Occurrences per week ({range}-day window)</text>
          <text className="frequency-portion__axis-label" transform={`translate(16 ${PLOT.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">Avg {metricMeta.label.toLowerCase()} per logged entry ({metricMeta.unit})</text>
          {plotted.map((point) => {
            const x = PLOT.left + (point.occurrencesPerWeek / maxX) * plotWidth;
            const y = PLOT.top + plotHeight - ((point.averageValue ?? 0) / maxY) * plotHeight;
            const active = selected?.key === point.key;
            return <g
              className={`frequency-portion__point${active ? " is-active" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`${point.label}: ${format(point.occurrencesPerWeek)} occurrences per week, average ${format(point.averageValue ?? 0)} ${metricMeta.unit} per logged entry`}
              aria-pressed={active}
              onClick={() => choose(point.key)}
              onKeyDown={(event) => pointKeyDown(event, point.key)}
              transform={`translate(${x} ${y})`}
              key={point.key}
            >
              <circle r={active ? 9 : 7} />
            </g>;
          })}
        </svg> : <div className="frequency-portion__empty" role="status">No known {metricMeta.label.toLowerCase()} values in this range.</div>}

        <div className="frequency-portion__food-list" aria-label="Select a food, including points that overlap">
          {result.points.map((point) => <button
            type="button"
            className={selected?.key === point.key ? "is-active" : ""}
            aria-pressed={selected?.key === point.key}
            onClick={() => choose(point.key)}
            key={point.key}
          >
            <span>{point.label}</span>
            <small>{format(point.occurrencesPerWeek)}×/week · {point.averageValue === null ? `${metricMeta.label} unknown` : `${format(point.averageValue)} ${metricMeta.unit} avg`}</small>
          </button>)}
        </div>
      </div>

      {selected ? <aside className="frequency-portion__details" aria-live="polite">
        <p className="eyebrow">Selected food</p>
        <h3>{selected.label}</h3>
        <dl className="frequency-portion__stats">
          <div><dt>Times logged</dt><dd>{selected.occurrences}</dd></div>
          <div><dt>Avg amount</dt><dd>{selected.averageValue === null ? "Unknown" : `${format(selected.averageValue)} ${metricMeta.unit}`}</dd></div>
          <div><dt>Total contribution</dt><dd>{selected.totalValue === null ? "Unknown" : `${format(selected.totalValue)} ${metricMeta.unit}`}</dd></div>
          <div><dt>Known coverage</dt><dd>{selected.knownCount} of {selected.occurrences} entries{selected.completeKnownCount < selected.knownCount ? ` · ${selected.knownCount - selected.completeKnownCount} partial` : ""}</dd></div>
          {selected.averageQuantity !== null ? <div><dt>Avg logged quantity</dt><dd>{format(selected.averageQuantity)} {selected.quantityUnit}</dd></div> : null}
        </dl>
        <h4>Source entries</h4>
        <ul className="frequency-portion__sources">
          {selected.sources.map((source) => <li key={`${source.entryId}-${source.date}`}>
            <span>{formatDate(source.date)}{source.quantity !== null ? ` · ${format(source.quantity)}${source.unit ? ` ${source.unit}` : ""}` : ""}</span>
            <strong>{source.value === null ? "Unknown" : `${format(source.value)} ${metricMeta.unit}${source.knownItemCount < source.totalItemCount ? " · partial" : ""}`}</strong>
          </li>)}
        </ul>
      </aside> : null}
    </div> : <div className="frequency-portion__empty" role="status">
      <strong>No foods logged in this range</strong>
      <span>Food and drink entries will appear here after they are logged.</span>
    </div>}
  </section>;
}
