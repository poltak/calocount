import { cx } from "../../core/utils/class-names.js";
import {
  calculateTargetPercent,
  compareAverageToTarget,
} from "../utils/dashboard-calculations.js";
import {
  formatNumber,
  fullDateLabel,
} from "../../core/utils/dashboard-format.js";
import { dayTotals } from "../utils/entry-view.js";
import { useDashboard } from "./dashboard-context.js";

function MetricRing({
  percent,
  label,
  className,
}: {
  percent: number;
  label: string;
  className: string;
}) {
  return (
    <div
      className={`metric-ring ${className}`}
      aria-label={label}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An img element cannot hold the percentage in its centre.
      role="img"
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="metric-ring-track" cx="18" cy="18" r="15.5" />
        {percent > 0 && (
          <circle
            className="metric-ring-value"
            cx="18"
            cy="18"
            r="15.5"
            pathLength={100}
            strokeDasharray={`${percent} 100`}
          />
        )}
      </svg>
      <strong>{`${percent}%`}</strong>
    </div>
  );
}

function CardLabel({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="card-label-row">
      <span className={`metric-dot ${dot}`} aria-hidden="true" />
      <span className="card-label">{label}</span>
    </div>
  );
}

/** The calories, the protein and the seven-day average of the day in view. */
export function SummaryGrid() {
  const { dashboard } = useDashboard();
  const { state } = dashboard;
  const totals = dayTotals(state.entries);
  const calorieGoal = state.targets.calories;
  const proteinGoal = state.proteinGoal?.targetG ?? null;
  const remainingCalories = calorieGoal - totals.calories;
  const comparison = compareAverageToTarget(state.averageCalories, calorieGoal);
  const caloriePercent = calculateTargetPercent(totals.calories, calorieGoal);
  const weightDate = state.proteinGoal?.weightDate ?? null;
  const remainingProtein =
    proteinGoal === null ? 0 : proteinGoal - totals.protein;
  return (
    <section
      className="summary-grid"
      aria-label="Daily calorie and protein summary"
    >
      <article className="summary-card calories-card">
        <div className="summary-copy">
          <CardLabel dot="calorie-dot" label="Calories" />
          <p className="metric-value">
            {`${formatNumber(Math.round(totals.calories))} `}
            <span>{`/ ${formatNumber(Math.round(calorieGoal))}`}</span>
          </p>
          <p className={cx("metric-subtitle", remainingCalories < 0 && "over")}>
            {remainingCalories >= 0
              ? `${formatNumber(Math.round(remainingCalories))} kcal left today`
              : `${formatNumber(Math.round(Math.abs(remainingCalories)))} kcal over target`}
          </p>
        </div>
        <MetricRing
          className={cx("calorie-ring", remainingCalories < 0 && "is-over")}
          percent={caloriePercent}
          label={`${caloriePercent} percent of calorie target`}
        />
      </article>

      <article className="summary-card protein-card">
        {proteinGoal === null ? (
          <div className="summary-copy protein-goal-unavailable">
            <CardLabel dot="protein-dot" label="Protein" />
            <p className="metric-value">Goal unavailable</p>
            <p className="metric-subtitle">
              Record a weight to calculate your daily protein goal.
            </p>
            <a className="secondary-button protein-goal-link" href="#weight">
              Record weight
            </a>
          </div>
        ) : (
          <>
            <div className="summary-copy">
              <CardLabel dot="protein-dot" label="Protein" />
              <p className="metric-value">
                {`${formatNumber(Math.round(totals.protein))}g `}
                <span>{`/ ${formatNumber(Math.round(proteinGoal))}g`}</span>
              </p>
              <p className="metric-subtitle">
                {remainingProtein >= 0
                  ? `${formatNumber(Math.round(remainingProtein))}g left to reach your target`
                  : `${formatNumber(Math.round(Math.abs(remainingProtein)))}g above target`}
              </p>
              {weightDate !== null && weightDate !== state.selectedDate && (
                <span className="protein-goal-hint">
                  {`Using weight from ${fullDateLabel(weightDate)}`}
                </span>
              )}
            </div>
            <MetricRing
              className="protein-ring"
              percent={calculateTargetPercent(totals.protein, proteinGoal)}
              label={`${calculateTargetPercent(totals.protein, proteinGoal)} percent of protein target`}
            />
          </>
        )}
      </article>

      <article className="summary-card average-card">
        <div>
          <CardLabel dot="average-dot" label="7 day average" />
          <p className="metric-value">
            {`${formatNumber(Math.round(state.averageCalories))} `}
            <span>kcal</span>
          </p>
          <p
            className={cx(
              "metric-subtitle",
              comparison.direction === "above" ? "over" : "positive",
            )}
          >
            {comparison.direction === "at" ? (
              "At your target average"
            ) : (
              <>
                <span aria-hidden="true">
                  {comparison.direction === "below" ? "↘" : "↗"}
                </span>
                {` ${comparison.percentage}% ${comparison.direction} your target`}
              </>
            )}
          </p>
        </div>
        <div className="mini-bars" aria-hidden="true">
          {state.days.map((day) => (
            <span
              key={day.date}
              className={
                day.date === state.selectedDate ? "is-selected" : undefined
              }
              style={{
                height: `${Math.max(22, (day.calories / 2600) * 100)}%`,
              }}
            />
          ))}
        </div>
      </article>
    </section>
  );
}
