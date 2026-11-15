import type { CSSProperties } from "react";
import { cx } from "../../core/utils/class-names.js";
import { trendDateLabel } from "../../core/utils/dashboard-format.js";
import {
  nutrientLabel,
  nutrientUnit,
} from "../../core/utils/nutrient-format.js";
import {
  MATRIX_NUTRIENTS,
  calculateMatrixCell,
} from "../utils/dashboard-calculations.js";
import { useDashboard } from "./dashboard-context.js";

function oneDecimal(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** The last seven days against the goal of six nutrients. */
export function NutrientConsistencyPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, targets } = dashboard.state;
  const days = dashboard.logic.visibleTrendDays.slice(-7);
  return (
    <section
      className="panel chart-panel consistency-panel"
      aria-labelledby="consistency-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Seven-day pattern</p>
          <h2 id="consistency-title">Nutrient consistency</h2>
        </div>
        <span className="panel-meta">target progress</span>
      </div>
      <div className="matrix-legend" aria-hidden="true">
        <span>
          <i className="matrix-key low" /> Below goal
        </span>
        <span>
          <i className="matrix-key met" /> On target
        </span>
        <span>
          <i className="matrix-key over" /> Over limit
        </span>
        <span>
          <i className="matrix-key partial" /> Partial data
        </span>
      </div>
      <div className="consistency-scroll">
        <div
          className="consistency-matrix"
          style={{ "--matrix-columns": days.length } as CSSProperties}
        >
          <div />
          {days.map((day) => (
            <strong
              key={day.date}
              className={cx(
                "matrix-date",
                day.date === selectedDate && "is-selected",
              )}
            >
              {trendDateLabel(day.date).replace(" ", "\n")}
            </strong>
          ))}
          {MATRIX_NUTRIENTS.map((key) => {
            const goal = targets.nutrients[key];
            const unit = nutrientUnit(key);
            const word = goal.direction === "maximum" ? "limit" : "goal";
            return (
              <div className="matrix-row" key={key}>
                <div className="matrix-label">
                  <strong>{nutrientLabel(key)}</strong>
                  <span>{`${word} ${goal.value ? `${oneDecimal(goal.value)} ${unit}` : "off"}`}</span>
                </div>
                {days.map((day) => {
                  const aggregate = day.nutrients[key];
                  const cell = calculateMatrixCell({ aggregate, goal });
                  const description =
                    cell.progress === null
                      ? "unknown"
                      : `${oneDecimal(aggregate.amount ?? 0)} ${unit}, ${Math.round(cell.progress)}% of ${word}`;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={cx(
                        "matrix-cell",
                        cell.state,
                        cell.coverage < 1 &&
                          cell.progress !== null &&
                          "partial",
                      )}
                      style={
                        {
                          "--cell-intensity": `${cell.intensity}%`,
                          "--cell-coverage": cell.coverage,
                        } as CSSProperties
                      }
                      aria-label={`${trendDateLabel(day.date)}, ${nutrientLabel(key)}: ${description}`}
                    >
                      <span>
                        {cell.progress === null
                          ? "—"
                          : `${Math.round(cell.progress)}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
