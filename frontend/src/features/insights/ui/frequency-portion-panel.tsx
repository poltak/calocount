import {
  calculateFrequencyPortion,
  frequencyAxisMaximum,
  frequencyPortionMetrics,
  type FrequencyPortionMetric,
} from "@app/common/features/entries/utils/insights/frequency-portion";
import { useMemo } from "react";
import { cx } from "../../core/utils/class-names.js";
import { formatDecimal, formatShortDate } from "../utils/insight-format.js";
import { useInsights } from "./insights-context.js";

const WIDTH = 720;
const HEIGHT = 340;
const PLOT = { left: 104, right: 22, top: 22, bottom: 54 };

function ticks(max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, index) => (max * index) / count);
}

function metricOf(value: string): FrequencyPortionMetric {
  return (
    frequencyPortionMetrics.find((metric) => metric.key === value)?.key ??
    "calories"
  );
}

/** How often each exact food name was logged, and how much of a nutrient one log entry holds. */
export function FrequencyPortionPanel() {
  const { logic, state } = useInsights();
  const {
    days,
    entries,
    today,
    frequencyRange: range,
    frequencyMetric: metric,
    frequencyKey,
  } = state;
  const result = useMemo(
    () =>
      calculateFrequencyPortion({
        entries,
        currentDate: today ?? "",
        range,
        metric,
      }),
    [entries, today, range, metric],
  );
  const metricMeta =
    frequencyPortionMetrics.find((candidate) => candidate.key === metric) ??
    frequencyPortionMetrics[0];
  const metricName = metricMeta.label.toLowerCase();
  const plotted = result.points.filter((point) => point.averageValue !== null);
  const selected =
    result.points.find((point) => point.key === frequencyKey) ??
    result.points[0] ??
    null;
  const maxX = frequencyAxisMaximum(
    plotted.map((point) => point.occurrencesPerWeek),
  );
  const maxY = frequencyAxisMaximum(
    plotted.map((point) => point.averageValue ?? 0),
  );
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const loggedDays = days.filter(
    (day) =>
      day.date >= result.startDate &&
      day.date <= result.endDate &&
      day.mealCount > 0,
  ).length;
  const choose = (key: string) => logic.choose({ frequencyKey: key });

  return (
    <section
      className="panel frequency-portion"
      aria-labelledby="frequency-portion-title"
    >
      <div className="frequency-portion__heading">
        <div>
          <p className="eyebrow">Food patterns</p>
          <h2 id="frequency-portion-title">Frequency &amp; amount</h2>
        </div>
        <div className="frequency-portion__controls">
          <div
            className="frequency-portion__range"
            aria-label="Frequency and amount date range"
          >
            {([7, 30] as const).map((value) => (
              <button
                key={value}
                className={range === value ? "is-active" : ""}
                type="button"
                aria-pressed={range === value}
                onClick={() => logic.choose({ frequencyRange: value })}
              >
                {`${value} days`}
              </button>
            ))}
          </div>
          <label>
            Amount
            <select
              value={metric}
              onChange={(event) =>
                logic.choose({ frequencyMetric: metricOf(event.target.value) })
              }
            >
              {frequencyPortionMetrics.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="frequency-portion__explanation">
        {`Each dot is one exact food name. Frequency uses all ${result.elapsedDays} calendar days ending yesterday; amount is the average known ${metricName} per log entry, not a standard serving or per-gram value.`}
      </p>
      <p className="frequency-portion__coverage">
        {`${formatShortDate(result.startDate)}–${formatShortDate(result.endDate)} · ${loggedDays} of ${result.elapsedDays} days have logs`}
      </p>

      {result.points.length > 0 ? (
        <div className="frequency-portion__layout">
          <div className="frequency-portion__visual">
            {plotted.length > 0 ? (
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The svg chart needs the img role and a label.
                role="img"
                aria-labelledby="frequency-portion-chart-title frequency-portion-chart-desc"
              >
                <title id="frequency-portion-chart-title">
                  {`Food logging frequency versus average ${metricName}`}
                </title>
                <desc id="frequency-portion-chart-desc">
                  {`Horizontal axis shows occurrences per week across the full ${range}-day window. Vertical axis shows average known ${metricName} per log entry. Use the food list below to select overlapping points.`}
                </desc>
                {ticks(maxY).map((tick) => {
                  const y = PLOT.top + plotHeight - (tick / maxY) * plotHeight;
                  return (
                    <g
                      key={`y${tick}`}
                      className="frequency-portion__tick frequency-portion__tick--y"
                    >
                      <line
                        x1={PLOT.left}
                        x2={WIDTH - PLOT.right}
                        y1={y}
                        y2={y}
                      />
                      <text x={PLOT.left - 10} y={y + 4} textAnchor="end">
                        {formatDecimal(tick)}
                      </text>
                    </g>
                  );
                })}
                {ticks(maxX).map((tick) => {
                  const x = PLOT.left + (tick / maxX) * plotWidth;
                  return (
                    <g key={`x${tick}`} className="frequency-portion__tick">
                      <line
                        x1={x}
                        x2={x}
                        y1={PLOT.top}
                        y2={HEIGHT - PLOT.bottom}
                      />
                      <text
                        x={x}
                        y={HEIGHT - PLOT.bottom + 22}
                        textAnchor="middle"
                      >
                        {formatDecimal(tick)}
                      </text>
                    </g>
                  );
                })}
                <text
                  className="frequency-portion__axis-label"
                  x={PLOT.left + plotWidth / 2}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                >
                  {`Occurrences per week (${range}-day window)`}
                </text>
                <text
                  className="frequency-portion__axis-label"
                  transform={`translate(16 ${PLOT.top + plotHeight / 2}) rotate(-90)`}
                  textAnchor="middle"
                >
                  {`Avg ${metricName} per logged entry (${metricMeta.unit})`}
                </text>
                {plotted.map((point) => {
                  const x =
                    PLOT.left + (point.occurrencesPerWeek / maxX) * plotWidth;
                  const y =
                    PLOT.top +
                    plotHeight -
                    ((point.averageValue ?? 0) / maxY) * plotHeight;
                  const active = selected?.key === point.key;
                  return (
                    <g
                      key={point.key}
                      className={cx(
                        "frequency-portion__point",
                        active && "is-active",
                      )}
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A button cannot hold SVG shapes.
                      role="button"
                      tabIndex={0}
                      aria-label={`${point.label}: ${formatDecimal(point.occurrencesPerWeek)} occurrences per week, average ${formatDecimal(point.averageValue ?? 0)} ${metricMeta.unit} per logged entry`}
                      aria-pressed={active}
                      onClick={() => choose(point.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          choose(point.key);
                        }
                      }}
                      transform={`translate(${x} ${y})`}
                    >
                      <circle r={active ? 9 : 7} />
                    </g>
                  );
                })}
              </svg>
            ) : (
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An output element would change the layout that the panel styles set.
              <div className="frequency-portion__empty" role="status">
                {`No known ${metricName} values in this range.`}
              </div>
            )}

            <div
              className="frequency-portion__food-list"
              aria-label="Select a food, including points that overlap"
            >
              {result.points.map((point) => (
                <button
                  key={point.key}
                  type="button"
                  className={selected?.key === point.key ? "is-active" : ""}
                  aria-pressed={selected?.key === point.key}
                  onClick={() => choose(point.key)}
                >
                  <span>{point.label}</span>
                  <small>
                    {`${formatDecimal(point.occurrencesPerWeek)}×/week · ${point.averageValue === null ? `${metricMeta.label} unknown` : `${formatDecimal(point.averageValue)} ${metricMeta.unit} avg`}`}
                  </small>
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <aside className="frequency-portion__details" aria-live="polite">
              <p className="eyebrow">Selected food</p>
              <h3>{selected.label}</h3>
              <dl className="frequency-portion__stats">
                <div>
                  <dt>Times logged</dt>
                  <dd>{selected.occurrences}</dd>
                </div>
                <div>
                  <dt>Avg amount</dt>
                  <dd>
                    {selected.averageValue === null
                      ? "Unknown"
                      : `${formatDecimal(selected.averageValue)} ${metricMeta.unit}`}
                  </dd>
                </div>
                <div>
                  <dt>Total contribution</dt>
                  <dd>
                    {selected.totalValue === null
                      ? "Unknown"
                      : `${formatDecimal(selected.totalValue)} ${metricMeta.unit}`}
                  </dd>
                </div>
                <div>
                  <dt>Known coverage</dt>
                  <dd>
                    {`${selected.knownCount} of ${selected.occurrences} entries${selected.completeKnownCount < selected.knownCount ? ` · ${selected.knownCount - selected.completeKnownCount} partial` : ""}`}
                  </dd>
                </div>
                {selected.averageQuantity !== null && (
                  <div>
                    <dt>Avg logged quantity</dt>
                    <dd>{`${formatDecimal(selected.averageQuantity)} ${selected.quantityUnit}`}</dd>
                  </div>
                )}
              </dl>
              <h4>Source entries</h4>
              <ul className="frequency-portion__sources">
                {selected.sources.map((source) => (
                  <li key={`${source.entryId}-${source.date}`}>
                    <span>
                      {`${formatShortDate(source.date)}${source.quantity !== null ? ` · ${formatDecimal(source.quantity)}${source.unit ? ` ${source.unit}` : ""}` : ""}`}
                    </span>
                    <strong>
                      {source.value === null
                        ? "Unknown"
                        : `${formatDecimal(source.value)} ${metricMeta.unit}${source.knownItemCount < source.totalItemCount ? " · partial" : ""}`}
                    </strong>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An output element would change the layout that the panel styles set.
        <div className="frequency-portion__empty" role="status">
          <strong>No foods logged in this range</strong>
          <span>
            Food and drink entries will appear here after they are logged.
          </span>
        </div>
      )}
    </section>
  );
}
