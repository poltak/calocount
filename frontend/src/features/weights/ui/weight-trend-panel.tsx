import { cx } from "../../core/utils/class-names.js";
import {
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import {
  buildWeightChart,
  formatWeight,
  type WeightSlotData,
} from "../utils/weight-chart.js";

/** The weight of each recent day, with the 7-day average. A day without a weight is a gap. */
export function WeightTrendPanel({
  dates,
  weights,
  selectedDate,
}: WeightSlotData) {
  const chart = buildWeightChart({ dates, weights });
  const { days, ticks, rawSegments, averageLine, weeklyChange } = chart;
  return (
    <section
      className="panel chart-panel weight-trend-panel"
      aria-labelledby="weight-trend-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">A quick view</p>
          <h2 id="weight-trend-title">Weight trend</h2>
        </div>
      </div>
      {chart.hasData ? (
        <>
          <div className="chart-legend weight-chart-legend">
            <span>
              <i className="legend-swatch weight-swatch" /> Daily weight
            </span>
            <span>
              <i className="legend-line weight-average-line" /> 7-day average
            </span>
            {weeklyChange !== null && (
              <span className="weight-change">
                {`${weeklyChange > 0 ? "+" : ""}${formatWeight(weeklyChange)} kg vs 7 days earlier`}
              </span>
            )}
          </div>
          <div
            className="bar-chart weight-chart"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart grid.
            role="group"
            aria-label={`Recorded weight for the past ${days.length} days in kilograms; missing days are shown as gaps`}
          >
            <div className="chart-y-axis" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick}>{formatWeight(tick)}</span>
              ))}
            </div>
            <div className="chart-plot">
              <div className="grid-line line-one" />
              <div className="grid-line line-two" />
              <div className="grid-line line-three" />
              <svg
                className="weight-line"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient
                    id="weight-area-fill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop className="weight-area-start" offset="0" />
                    <stop className="weight-area-end" offset="1" />
                  </linearGradient>
                </defs>
                {averageLine.length > 1 && (
                  <polygon
                    className="weight-area"
                    points={`${averageLine.join(" ")} ${averageLine.at(-1)?.split(",")[0]},100 ${averageLine[0]?.split(",")[0]},100`}
                  />
                )}
                {rawSegments.map(
                  (points) =>
                    points.length > 1 && (
                      <polyline
                        key={points[0]}
                        className="weight-raw-line"
                        points={points.join(" ")}
                      />
                    ),
                )}
                {averageLine.length > 1 && (
                  <polyline
                    className="weight-average-path"
                    points={averageLine.join(" ")}
                  />
                )}
              </svg>
              <div className="weight-points">
                {days.map((day, index) => (
                  <button
                    key={day.date}
                    className={cx(
                      "weight-point-column",
                      day.value === null && "missing",
                      day.date === selectedDate && "is-selected",
                    )}
                    type="button"
                    aria-label={
                      day.value === null
                        ? `${trendDateLabel(day.date)}: no weight recorded`
                        : `${trendDateLabel(day.date)}: ${formatWeight(day.value)} kilograms`
                    }
                  >
                    <span className="weight-tooltip">
                      {day.value === null
                        ? "No record"
                        : `${formatWeight(day.value)} kg`}
                    </span>
                    {day.value !== null && (
                      <span
                        className="weight-point"
                        style={{
                          bottom: `calc(21px + ${(day.height ?? 0) * 0.902}%)`,
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <span>
                      {showTrendDateLabel(index, days.length)
                        ? trendDateLabel(day.date)
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <output className="chart-empty">
          <strong>No weight records for the past 7 days</strong>
          <span>Record a daily weight to see your trend.</span>
        </output>
      )}
    </section>
  );
}
