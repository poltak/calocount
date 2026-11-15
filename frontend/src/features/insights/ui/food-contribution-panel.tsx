import { useMemo } from "react";
import {
  FOOD_CONTRIBUTION_METRICS,
  calculateFoodContributions,
  type FoodContributionMetric,
} from "../utils/food-contribution.js";
import { useInsights } from "./insights-context.js";

function oneDecimal(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function metricOf(value: string): FoodContributionMetric {
  return (
    FOOD_CONTRIBUTION_METRICS.find((metric) => metric.key === value)?.key ??
    "calories"
  );
}

/** The foods that add the most of one metric over the last 7 or 30 days. */
export function FoodContributionPanel() {
  const { logic, state } = useInsights();
  const {
    entries,
    today,
    contributionRange: range,
    contributionMetric: metric,
  } = state;
  const rows = useMemo(
    () =>
      calculateFoodContributions({
        entries,
        currentDate: today ?? "",
        range,
        metric,
      }),
    [entries, today, range, metric],
  );
  const meta =
    FOOD_CONTRIBUTION_METRICS.find((candidate) => candidate.key === metric) ??
    FOOD_CONTRIBUTION_METRICS[0];
  const max = rows[0]?.value ?? 1;
  return (
    <section
      className="panel chart-panel food-contribution-panel"
      aria-labelledby="food-contribution-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">What drives your totals</p>
          <h2 id="food-contribution-title">Top food contributors</h2>
        </div>
        <div className="frequency-portion__controls">
          <div
            className="frequency-portion__range"
            aria-label="Top food contributors date range"
          >
            {([7, 30] as const).map((value) => (
              <button
                key={value}
                className={range === value ? "is-active" : ""}
                type="button"
                aria-pressed={range === value}
                onClick={() => logic.choose({ contributionRange: value })}
              >
                {`${value} days`}
              </button>
            ))}
          </div>
          <label className="compact-select">
            Show
            <select
              value={metric}
              onChange={(event) =>
                logic.choose({
                  contributionMetric: metricOf(event.target.value),
                })
              }
            >
              {FOOD_CONTRIBUTION_METRICS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {rows.length > 0 ? (
        <div
          className="contribution-list"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The rows are grids, which a list element cannot lay out here.
          role="list"
          aria-label={`Foods contributing the most ${meta.label.toLocaleLowerCase()}`}
        >
          {rows.map((row) => (
            <div
              className="contribution-row"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- See the list above.
              role="listitem"
              key={row.label}
            >
              <div className="contribution-label">
                <strong title={row.label}>{row.label}</strong>
                <span>{`${row.occurrences} ${row.occurrences === 1 ? "entry" : "entries"}`}</span>
              </div>
              <div
                className="contribution-bar"
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An img element cannot hold the bar that grows inside it.
                role="img"
                aria-label={`${Math.round((row.value / max) * 100)}% of the top contributor`}
              >
                <i style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
              <span className="contribution-value">{`${oneDecimal(row.value)} ${meta.unit}`}</span>
            </div>
          ))}
        </div>
      ) : (
        <output className="chart-empty compact-empty">
          <strong>{`No ${meta.label.toLocaleLowerCase()} data in this range`}</strong>
          <span>Logged food items will appear here.</span>
        </output>
      )}
    </section>
  );
}
