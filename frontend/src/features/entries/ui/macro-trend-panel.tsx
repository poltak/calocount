import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import { cx } from "../../core/utils/class-names.js";
import {
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import { calculateMacroTrend } from "../utils/dashboard-calculations.js";
import { useDashboard } from "./dashboard-context.js";

/** The calorie-weighted split of carbs, protein and fat on each day of the trend range. */
export function MacroTrendPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, trendRange } = dashboard.state;
  const values = calculateMacroTrend(dashboard.logic.visibleTrendDays);
  return (
    <section
      className="panel chart-panel macro-trend-panel"
      aria-labelledby="macro-trend-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">A quick view</p>
          <h2 id="macro-trend-title">Macros trend</h2>
        </div>
        <TrendRangeSelect
          value={trendRange}
          onChange={(range) => dashboard.logic.setTrendRange({ range })}
          label="Macros trend"
        />
      </div>
      {values.some((day) => day.hasData) ? (
        <>
          <div className="chart-legend macro-trend-legend">
            <span>
              <i className="legend-swatch macro-carbs-swatch" /> Carbs
            </span>
            <span>
              <i className="legend-swatch macro-protein-swatch" /> Protein
            </span>
            <span>
              <i className="legend-swatch macro-fat-swatch" /> Fat
            </span>
          </div>
          <div
            className={cx("macro-trend-chart", trendRange === 30 && "is-month")}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart grid.
            role="group"
            aria-label={`Calorie-weighted carbohydrate, protein, and fat split for the past ${trendRange} days; days without macro data are shown as gaps`}
          >
            <div className="macro-trend-y-axis" aria-hidden="true">
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
            <div className="macro-trend-plot">
              <div className="macro-mid-line" aria-hidden="true" />
              <div className="macro-trend-bars">
                {values.map((day, index) => {
                  const { carbs, protein, fat } = day.percentages;
                  const label = trendDateLabel(day.date);
                  return (
                    <button
                      key={day.date}
                      className={cx(
                        "macro-trend-column",
                        !day.hasData && "missing",
                        day.date === selectedDate && "is-selected",
                      )}
                      type="button"
                      aria-label={
                        day.hasData
                          ? `${label}: ${carbs}% carbohydrates, ${protein}% protein, ${fat}% fat`
                          : `${label}: no macro data`
                      }
                    >
                      <span className="macro-tooltip">
                        {day.hasData
                          ? `${carbs}% C · ${protein}% P · ${fat}% F`
                          : "No data"}
                      </span>
                      <div
                        className="macro-stack"
                        title={
                          day.hasData
                            ? `${carbs}% carbs · ${protein}% protein · ${fat}% fat`
                            : "No macro data"
                        }
                      >
                        {day.hasData ? (
                          <>
                            <span
                              className="macro-segment fat"
                              style={{ height: `${fat}%` }}
                            />
                            <span
                              className="macro-segment protein"
                              style={{ height: `${protein}%` }}
                            />
                            <span
                              className="macro-segment carbs"
                              style={{ height: `${carbs}%` }}
                            />
                          </>
                        ) : (
                          <span className="macro-gap" aria-hidden="true">
                            —
                          </span>
                        )}
                      </div>
                      <span>
                        {showTrendDateLabel(index, values.length) ? label : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <output className="chart-empty">
          <strong>{`No macro records for the past ${trendRange} days`}</strong>
          <span>
            Add protein, carbs, or fat to an entry to see the daily split.
          </span>
        </output>
      )}
    </section>
  );
}
