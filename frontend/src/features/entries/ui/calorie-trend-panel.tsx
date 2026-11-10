import { cx } from "../../core/utils/class-names.js";
import { calculateCalorieChartScale } from "../utils/dashboard-calculations.js";
import {
  formatNumber,
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import { useDashboard } from "./dashboard-context.js";

function formatChartTick(value: number): string {
  return value === 0 ? "0" : `${(value / 1000).toFixed(1)}k`;
}

/** The calories of each day in the trend range against the goal. */
export function CalorieTrendPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, targets, trendRange } = dashboard.state;
  const days = dashboard.logic.visibleTrendDays;
  const goal = targets.calories;
  const scale = calculateCalorieChartScale(
    days.map((day) => day.calories),
    goal,
  );
  return (
    <section
      className="panel chart-panel"
      id="trend"
      aria-labelledby="trend-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">A quick view</p>
          <h2 id="trend-title">Calorie trend</h2>
        </div>
        <TrendRangeSelect
          value={trendRange}
          onChange={(range) => dashboard.logic.setTrendRange({ range })}
          label="Calorie trend"
        />
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-swatch calorie-swatch" /> Calories
        </span>
        <span>
          <i className="legend-line" />
          {` Target ${formatNumber(goal)}`}
        </span>
      </div>
      <div
        className={cx("bar-chart", trendRange === 30 && "is-month")}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart grid.
        role="group"
        aria-label={`Calorie intake for the past ${days.length} days compared with a ${goal} calorie target`}
      >
        <div className="chart-y-axis" aria-hidden="true">
          {scale.tickValues.map((value) => (
            <span key={value}>{formatChartTick(value)}</span>
          ))}
        </div>
        <div className="chart-plot">
          <div
            className="target-line"
            style={{ top: `${scale.targetLineTopPercent}%` }}
          >
            <span>{formatNumber(goal)}</span>
          </div>
          <div className="grid-line line-one" />
          <div className="grid-line line-two" />
          <div className="grid-line line-three" />
          <div className="bars">
            {days.map((day, index) => (
              <button
                key={day.date}
                className={cx(
                  "bar-column",
                  day.date === selectedDate && "is-selected",
                )}
                type="button"
                aria-label={`${trendDateLabel(day.date)}: ${day.calories.toLocaleString()} kilocalories`}
              >
                <span className="bar-value">
                  {day.calories.toLocaleString()}
                </span>
                <span
                  className={cx("bar", day.calories <= 0 && "bar-empty")}
                  style={{
                    height:
                      day.calories > 0
                        ? `${Math.max(12, scale.valueHeightPercents[index] ?? 0)}%`
                        : "0",
                  }}
                />
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
    </section>
  );
}
