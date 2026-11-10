import { NUTRIENT_KEYS } from "@app/common/features/entries/utils/nutrients";
import {
  goalKindWord,
  nutrientGoalKind,
} from "@app/common/features/entries/utils/nutrient-goals";
import { cx } from "../../core/utils/class-names.js";
import {
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import {
  formatNutrientAmount,
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientUnit,
} from "../../core/utils/nutrient-format.js";
import { useDashboard } from "./dashboard-context.js";

function oneDecimal(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** One nutrient over the last seven days. A day without a value is a gap, not a zero. */
export function NutrientTrendPanel() {
  const { dashboard } = useDashboard();
  const { days, selectedDate, trendNutrient, targets } = dashboard.state;
  const goal = targets.nutrients[trendNutrient];
  const goalValue = goal.value;
  const goalWord = goalKindWord(nutrientGoalKind(trendNutrient, goal));
  const points = days.map((day) => ({
    date: day.date,
    amount: day.nutrients[trendNutrient].amount,
  }));
  const known = points.flatMap((point) =>
    point.amount === null ? [] : [point.amount],
  );
  const average =
    known.length > 0
      ? known.reduce((sum, amount) => sum + amount, 0) / known.length
      : null;
  const max = Math.max(1, goalValue ?? 0, ...known);
  const unit = nutrientUnit(trendNutrient);
  const label = nutrientLabel(trendNutrient);
  return (
    <section
      className="panel chart-panel nutrient-trend-panel"
      id="nutrient-trend"
      aria-labelledby="nutrient-trend-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">One nutrient at a time</p>
          <h2 id="nutrient-trend-title">Nutrient trend</h2>
        </div>
      </div>
      <div className="nutrient-trend-controls">
        <label htmlFor="nutrient-trend-selector">Show</label>
        <select
          id="nutrient-trend-selector"
          value={trendNutrient}
          onChange={(event) =>
            dashboard.logic.setTrendNutrient({
              key:
                NUTRIENT_KEYS.find((key) => key === event.target.value) ??
                "fiberG",
            })
          }
        >
          {groupedNutrientKeys().map(({ group, keys }) => (
            <optgroup key={group} label={nutrientGroupLabel(group)}>
              {keys.map((key) => (
                <option key={key} value={key}>
                  {nutrientLabel(key)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="panel-meta">{unit}</span>
      </div>
      {points.length > 0 ? (
        <>
          <div className="nutrient-trend-summary" aria-live="polite">
            <span>
              Known average{" "}
              <strong>
                {average === null ? "—" : `${oneDecimal(average)} ${unit}`}
              </strong>
            </span>
            {goalValue !== null ? (
              <span>
                {`Daily ${goalWord} `}
                <strong>
                  {`${formatNutrientAmount(goalValue, trendNutrient)} ${unit}`}
                </strong>
              </span>
            ) : (
              <span>No daily goal</span>
            )}
            <span
              className={
                known.length === points.length
                  ? "coverage-complete"
                  : "coverage-partial"
              }
            >
              {`${known.length} of ${points.length} days known${known.length === points.length ? "" : " · Partial"}`}
            </span>
          </div>
          <div
            className="nutrient-trend-chart"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart grid.
            role="group"
            aria-label={`${label} for the past ${points.length} days; missing days are shown as gaps`}
          >
            <div className="nutrient-trend-y-axis" aria-hidden="true">
              <span>{oneDecimal(max)}</span>
              <span>{oneDecimal(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="nutrient-trend-plot">
              <div className="grid-line line-one" />
              <div className="grid-line line-two" />
              <div className="grid-line line-three" />
              {goalValue !== null && (
                <div
                  className={`nutrient-trend-goal-line goal-${goalWord}`}
                  style={{
                    bottom: `${Math.min(100, (goalValue / max) * 100)}%`,
                  }}
                >
                  <span>{`${goalWord[0]?.toUpperCase()}${goalWord.slice(1)}`}</span>
                </div>
              )}
              <div className="nutrient-trend-bars">
                {points.map((point, index) => (
                  <button
                    key={point.date}
                    className={cx(
                      "nutrient-trend-column",
                      point.amount === null && "missing",
                      point.date === selectedDate && "is-selected",
                    )}
                    type="button"
                    aria-label={
                      point.amount === null
                        ? `${trendDateLabel(point.date)}: unknown`
                        : `${trendDateLabel(point.date)}: ${point.amount} ${unit}`
                    }
                  >
                    {point.amount === null ? (
                      <span className="nutrient-trend-gap" aria-hidden="true">
                        —
                      </span>
                    ) : (
                      <>
                        <div className="bar-value">
                          {oneDecimal(point.amount)}
                        </div>
                        <div
                          className="bar nutrient-trend-bar"
                          style={{
                            height: `${Math.max(8, (point.amount / max) * 100)}%`,
                          }}
                        />
                      </>
                    )}
                    <span>
                      {showTrendDateLabel(index, points.length)
                        ? trendDateLabel(point.date)
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
          <strong>No nutrient records for the past 7 days</strong>
          <span>Add nutrient estimates to see a trend.</span>
        </output>
      )}
    </section>
  );
}
