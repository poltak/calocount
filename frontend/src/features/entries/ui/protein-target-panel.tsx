import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import { cx } from "../../core/utils/class-names.js";
import {
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import { useDashboard } from "./dashboard-context.js";

function format(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** The protein of each day in the trend range against the target of that day. */
export function ProteinTargetPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, trendRange, proteinTargets } = dashboard.state;
  const targets = new Map(
    proteinTargets.map((entry) => [entry.date, entry.targetG]),
  );
  const values = dashboard.logic.visibleTrendDays.map((day) => ({
    ...day,
    target: targets.get(day.date) ?? null,
  }));
  const max =
    Math.max(1, ...values.flatMap((day) => [day.proteinG, day.target ?? 0])) *
    1.12;
  const knownDays = values.filter((day) => day.mealCount > 0);
  const average =
    knownDays.length > 0
      ? knownDays.reduce((sum, day) => sum + day.proteinG, 0) / knownDays.length
      : 0;
  const targetDays = knownDays.filter(
    (day) => day.target !== null && day.target > 0,
  );
  const hitDays = targetDays.filter(
    (day) => day.proteinG >= (day.target ?? Infinity),
  ).length;
  return (
    <section
      className="panel chart-panel protein-target-panel"
      aria-labelledby="protein-target-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Daily amount</p>
          <h2 id="protein-target-title">Protein vs target</h2>
        </div>
        <TrendRangeSelect
          value={trendRange}
          onChange={(range) => dashboard.logic.setTrendRange({ range })}
          label="Protein versus target"
        />
      </div>
      <div className="insight-summary">
        <span>
          <strong>{`${format(average)} g`}</strong> known-day average
        </span>
        <span>
          <strong>{`${hitDays} of ${targetDays.length}`}</strong> recorded days
          met target
        </span>
      </div>
      <div
        className={cx("protein-target-chart", trendRange === 30 && "is-month")}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart grid.
        role="group"
        aria-label={`Daily protein in grams compared with the protein target for the past ${trendRange} days`}
      >
        {values.map((day, index) => {
          const label = trendDateLabel(day.date);
          const targetPercent = day.target
            ? Math.min(100, (day.target / max) * 100)
            : null;
          return (
            <button
              key={day.date}
              className={cx(
                "protein-target-day",
                day.mealCount === 0 && "missing",
                day.date === selectedDate && "is-selected",
              )}
              type="button"
              aria-label={
                day.mealCount > 0
                  ? `${label}: ${format(day.proteinG)} grams protein${day.target ? `, target ${format(day.target)} grams` : ""}`
                  : `${label}: no entries recorded`
              }
            >
              <span className="protein-target-tooltip">
                {day.mealCount > 0
                  ? `${format(day.proteinG)}g${day.target ? ` / ${format(day.target)}g` : ""}`
                  : "No meals"}
              </span>
              <span className="protein-target-track" aria-hidden="true">
                {targetPercent !== null && (
                  <i
                    className="protein-target-marker"
                    style={{ bottom: `${targetPercent}%` }}
                  />
                )}
                <i
                  className="protein-target-fill"
                  style={{
                    height: `${Math.min(100, (day.proteinG / max) * 100)}%`,
                  }}
                />
              </span>
              <span>
                {showTrendDateLabel(index, values.length) ? label : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
