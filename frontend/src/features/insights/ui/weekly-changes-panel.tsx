import {
  calculateWeeklyChanges,
  type WeeklyMetricKey,
} from "@app/common/features/entries/utils/insights/weekly-changes";
import { useMemo } from "react";
import { formatDateRange } from "../utils/insight-format.js";
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
    useGrouping: METRIC_META[key].unit !== "kcal",
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

/** The change of the daily averages between the last two finished weeks. */
export function WeeklyChangesPanel() {
  const { state } = useInsights();
  const { days, today } = state;
  const result = useMemo(
    () => calculateWeeklyChanges(days, today ?? ""),
    [days, today],
  );

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
              className="weekly-metric"
              aria-labelledby={`weekly-metric-${key}`}
            >
              <h3 id={`weekly-metric-${key}`}>
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
