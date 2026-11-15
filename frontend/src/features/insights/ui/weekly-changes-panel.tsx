import {
  calculateWaterfall,
  calculateWeeklyChanges,
  type ContributionSource,
  type WaterfallContribution,
  type WeeklyMetricKey,
} from "@app/common/features/entries/utils/insights/weekly-changes";
import { useMemo } from "react";
import { cx } from "../../core/utils/class-names.js";
import { formatDateRange, formatShortDate } from "../utils/insight-format.js";
import { useInsights } from "./insights-context.js";

const METRIC_META: Record<
  WeeklyMetricKey,
  { label: string; unit: string; digits: number }
> = {
  calories: { label: "Calories", unit: "kcal", digits: 0 },
  proteinG: { label: "Protein", unit: "g", digits: 1 },
  fiberG: { label: "Fiber", unit: "g", digits: 1 },
  sodiumMg: { label: "Sodium", unit: "mg", digits: 0 },
  caffeineMg: { label: "Caffeine", unit: "mg", digits: 0 },
};
const METRIC_KEYS = Object.keys(METRIC_META) as WeeklyMetricKey[];

function format(value: number | null, key: WeeklyMetricKey, signed = false) {
  if (value === null) {
    return "Unavailable";
  }
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: METRIC_META[key].digits,
    minimumFractionDigits: 0,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
  return `${amount} ${METRIC_META[key].unit}`;
}

function coverage(itemCount: number | null, totalCount: number | null) {
  if (itemCount === null || totalCount === null) {
    return null;
  }
  return `${itemCount} of ${totalCount} items have values`;
}

function Waterfall({
  before,
  after,
  items,
  selected,
  metric,
  onSelect,
}: {
  before: number;
  after: number;
  items: WaterfallContribution[];
  selected: string | null;
  metric: WeeklyMetricKey;
  onSelect: (key: string) => void;
}) {
  const geometry = items.map((item, index) => {
    const start =
      before +
      items
        .slice(0, index)
        .reduce((sum, earlier) => sum + earlier.difference, 0);
    return { item, start, end: start + item.difference };
  });
  const values = [
    0,
    before,
    after,
    ...geometry.flatMap((g) => [g.start, g.end]),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const plotTop = 30;
  const plotHeight = 170;
  const y = (value: number) => plotTop + ((max - value) / span) * plotHeight;
  const plotLeft = 62;
  const step = 520 / (items.length + 2);
  const width = Math.min(50, step * 0.58);
  const bars = [
    { key: "before", label: "Before", start: 0, end: before, total: true },
    ...geometry.map(({ item, start, end }) => ({
      key: item.key,
      label: item.label,
      start,
      end,
      total: false,
    })),
    { key: "after", label: "After", start: 0, end: after, total: true },
  ];
  return (
    <svg
      className="weekly-waterfall"
      viewBox="0 0 600 260"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The svg chart needs the img role and a label.
      role="img"
      aria-label={`${METRIC_META[metric].label} average change waterfall`}
    >
      {[max, (max + min) / 2, min].map((tick) => (
        <g key={tick}>
          <line
            x1={plotLeft}
            x2={582}
            y1={y(tick)}
            y2={y(tick)}
            className="weekly-waterfall-grid"
          />
          <text x="55" y={y(tick) + 4} textAnchor="end">
            {format(tick, metric)}
          </text>
        </g>
      ))}
      <line
        x1={plotLeft}
        x2="582"
        y1={y(0)}
        y2={y(0)}
        className="weekly-waterfall-zero"
      />
      {bars.map((bar, index) => {
        const top = Math.min(y(bar.start), y(bar.end));
        const height = Math.abs(y(bar.start) - y(bar.end));
        const x = plotLeft + step * index + step / 2 - width / 2;
        const contribution = items.find((item) => item.key === bar.key);
        const content = (
          <>
            {index > 0 && !bar.total && (
              <line
                x1={x - step + width}
                x2={x}
                y1={y(bar.start)}
                y2={y(bar.start)}
                className="weekly-waterfall-connector"
              />
            )}
            {height > 0.01 ? (
              <rect
                x={x}
                y={top}
                width={width}
                height={height}
                rx="1.5"
                className={`${bar.total ? "total" : bar.end >= bar.start ? "increase" : "decrease"}${selected === bar.key ? " selected" : ""}`}
              />
            ) : (
              <line
                x1={x}
                x2={x + width}
                y1={y(bar.start)}
                y2={y(bar.start)}
                className="weekly-waterfall-neutral"
              />
            )}
            <text x={x + width / 2} y="225" textAnchor="middle">
              {bar.total ? bar.label : String(index)}
            </text>
          </>
        );
        return contribution ? (
          <g
            key={bar.key}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A button cannot hold SVG shapes.
            role="button"
            tabIndex={0}
            aria-label={`${bar.label}, ${format(contribution.difference, metric, true)}. Show source entries.`}
            onClick={() => onSelect(bar.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(bar.key);
              }
            }}
          >
            {content}
          </g>
        ) : (
          <g key={bar.key}>{content}</g>
        );
      })}
      <text x="62" y="250">
        {`Daily average (${METRIC_META[metric].unit})`}
      </text>
    </svg>
  );
}

function SourceList({
  label,
  sources,
  metric,
}: {
  label: string;
  sources: ContributionSource[];
  metric: WeeklyMetricKey;
}) {
  return (
    <div>
      <h5>{label}</h5>
      {sources.length > 0 ? (
        <ul>
          {sources.map((source, index) => (
            <li key={`${source.id}-${index}`}>
              <span>{`${source.name} · ${formatShortDate(source.date)}`}</span>
              <strong>
                {`${format(source.amount, metric)} logged · ${format(source.contribution, metric)}/recorded day`}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>No matching entry details.</p>
      )}
    </div>
  );
}

/** The change of the daily averages between the last two weeks, and the foods that explain it. */
export function WeeklyChangesPanel() {
  const { logic, state } = useInsights();
  const {
    days,
    entries,
    today,
    weeklyMetric: selectedMetric,
    weeklyKey,
  } = state;
  const result = useMemo(
    () => calculateWeeklyChanges(days, entries, today ?? ""),
    [days, entries, today],
  );
  const waterfall = calculateWaterfall(
    result.previous,
    result.current,
    selectedMetric,
  );
  const selected = waterfall.find((item) => item.key === weeklyKey) ?? null;
  const before = result.metrics[selectedMetric].previous.average;
  const after = result.metrics[selectedMetric].current.average;
  const meta = METRIC_META[selectedMetric];

  return (
    <section
      className="panel weekly-changes"
      aria-labelledby="weekly-changes-title"
    >
      <div className="panel-heading weekly-changes-heading">
        <div>
          <h2 id="weekly-changes-title">What changed this week?</h2>
          <p className="panel-meta">
            Daily averages use recorded days only. Today is excluded.
          </p>
        </div>
      </div>

      <div className="weekly-period-key" aria-label="Compared periods">
        <span>
          <i className="previous" />
          {`Before · ${formatDateRange(result.previous.start, result.previous.end)} · ${result.previous.days.length}/7 recorded days`}
        </span>
        <span>
          <i className="current" />
          {`After · ${formatDateRange(result.current.start, result.current.end)} · ${result.current.days.length}/7 recorded days`}
        </span>
      </div>

      <div className="weekly-metrics">
        {METRIC_KEYS.map((key) => {
          const comparison = result.metrics[key];
          const nutrient = key !== "calories" && key !== "proteinG";
          const difference =
            comparison.previous.average === null ||
            comparison.current.average === null
              ? null
              : comparison.current.average - comparison.previous.average;
          return (
            <article
              key={key}
              className={cx(
                "weekly-metric",
                selectedMetric === key && "selected",
              )}
            >
              <button
                type="button"
                aria-pressed={selectedMetric === key}
                onClick={() =>
                  logic.choose({ weeklyMetric: key, weeklyKey: null })
                }
              >
                <h3>
                  {METRIC_META[key].label}
                  {nutrient && <small>known logged amount</small>}
                </h3>
                <div className="weekly-metric-values">
                  <span>
                    <small>Before</small>
                    <strong>{format(comparison.previous.average, key)}</strong>
                  </span>
                  <span>
                    <small>After</small>
                    <strong>{format(comparison.current.average, key)}</strong>
                  </span>
                </div>
                <p>
                  {difference === null
                    ? "Change unavailable"
                    : `${format(difference, key, true)} per recorded day`}
                </p>
                {nutrient && (
                  <p className="weekly-coverage">
                    {`Coverage: ${coverage(comparison.previous.knownItemCount, comparison.previous.totalItemCount) ?? ""} before; ${coverage(comparison.current.knownItemCount, comparison.current.totalItemCount) ?? ""} after.`}
                  </p>
                )}
              </button>
            </article>
          );
        })}
      </div>

      <div className="weekly-breakdown">
        <div>
          <h3>{`What contributed to the ${meta.label.toLowerCase()} change?`}</h3>
          <p>{`Matching food and drink names are grouped. Values are ${meta.unit} per recorded day.`}</p>
        </div>
        {before === null || after === null ? (
          <div className="weekly-unavailable">
            A comparison needs at least one recorded day in both periods.
          </div>
        ) : (
          <>
            <div className="weekly-waterfall-legend">
              <span className="total">Period totals</span>
              <span className="increase">Increase</span>
              <span className="decrease">Decrease</span>
            </div>
            <Waterfall
              before={before}
              after={after}
              items={waterfall}
              selected={weeklyKey}
              metric={selectedMetric}
              onSelect={(key) => logic.choose({ weeklyKey: key })}
            />
            <ol className="weekly-contribution-list">
              {waterfall.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    aria-pressed={weeklyKey === item.key}
                    onClick={() => logic.choose({ weeklyKey: item.key })}
                  >
                    <span>
                      <b>{index + 1}</b>
                      {item.label}
                    </span>
                    <strong
                      className={item.difference >= 0 ? "increase" : "decrease"}
                    >
                      {format(item.difference, selectedMetric, true)}
                    </strong>
                    <small>
                      {`${format(item.previous, selectedMetric)} → ${format(item.current, selectedMetric)}`}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
            {selected && (
              <div className="weekly-source-detail" aria-live="polite">
                <h4>{selected.label}</h4>
                <p>{`Before ${format(selected.previous, selectedMetric)} · After ${format(selected.current, selectedMetric)}`}</p>
                {selected.kind === "unavailable" ? (
                  <p>
                    Available entry details do not fully match the recorded
                    daily totals, so this amount cannot be assigned to a food or
                    drink.
                  </p>
                ) : (
                  <div className="weekly-source-columns">
                    <SourceList
                      label="Before sources"
                      sources={selected.previousSources}
                      metric={selectedMetric}
                    />
                    <SourceList
                      label="After sources"
                      sources={selected.currentSources}
                      metric={selectedMetric}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
