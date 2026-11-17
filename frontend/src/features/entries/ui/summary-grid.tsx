import { useNavigate } from "react-router";
import { cx } from "../../core/utils/class-names.js";
import { calculateTargetPercent } from "../utils/dashboard-calculations.js";
import {
  formatKcal,
  formatNumber,
  formatSignedWeightKg,
  formatWeightKg,
  fullDateLabel,
  trendDateLabel,
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

function WeightCard() {
  const { dashboard } = useDashboard();
  const { logic, state } = dashboard;
  const { weightChange, maintenanceEstimate } = logic;
  const latest = state.historyWeights.at(-1);
  const shown = state.weight?.weightKg ?? latest?.weightKg ?? null;
  const hintDate = state.weight === null ? (latest?.logicalDate ?? null) : null;
  return (
    <article className="summary-card weight-card" aria-label="Weight">
      <div className="summary-copy">
        <CardLabel dot="weight-dot" label="Weight" />
        <p className="metric-value">
          {shown === null ? (
            "No weight yet"
          ) : (
            <>
              {`${formatWeightKg(shown)} `}
              <span>kg</span>
            </>
          )}
        </p>
        {hintDate !== null && (
          <span className="weight-card-hint">{`on ${trendDateLabel(hintDate)}`}</span>
        )}
        <p className="metric-subtitle">
          {weightChange === null
            ? "The change shows after a week of weights"
            : `${formatSignedWeightKg(weightChange.changeKg)} kg since ${trendDateLabel(weightChange.fromDate)}`}
        </p>
        <p
          className="metric-subtitle maintenance-line"
          title={
            maintenanceEstimate === null
              ? undefined
              : "Estimated from your intake and weight trend over the last 28 days"
          }
        >
          {maintenanceEstimate === null ? (
            "Maintenance estimate needs 3 weeks of logs and weights"
          ) : (
            <>
              <span>{`Maintenance ≈ ${formatKcal(maintenanceEstimate.kcalPerDay)} kcal/day`}</span>
              <span className="sr-only">
                . Estimated from your intake and weight trend over the last 28
                days.
              </span>
            </>
          )}
        </p>
      </div>
    </article>
  );
}

/** The calories and the protein of the day in view, and the weight with the maintenance estimate. */
export function SummaryGrid() {
  const { dashboard, audience } = useDashboard();
  const navigate = useNavigate();
  const { state } = dashboard;
  const totals = dayTotals(state.entries);
  const calorieGoal = state.targets.calories;
  const proteinGoal = state.proteinGoal?.targetG ?? null;
  const remainingCalories = calorieGoal - totals.calories;
  const caloriePercent = calculateTargetPercent(totals.calories, calorieGoal);
  const weightDate = state.proteinGoal?.weightDate ?? null;
  const remainingProtein =
    proteinGoal === null ? 0 : proteinGoal - totals.protein;
  return (
    <section
      className="summary-grid"
      aria-label="Daily calorie, protein and weight summary"
    >
      <article className="summary-card calories-card">
        <div className="summary-copy">
          <CardLabel dot="calorie-dot" label="Calories" />
          <p className="metric-value">
            {`${formatKcal(Math.round(totals.calories))} `}
            <span>{`/ ${formatKcal(Math.round(calorieGoal))}`}</span>
          </p>
          <p className={cx("metric-subtitle", remainingCalories < 0 && "over")}>
            {remainingCalories >= 0
              ? `${formatKcal(Math.round(remainingCalories))} kcal left today`
              : `${formatKcal(Math.round(Math.abs(remainingCalories)))} kcal over target`}
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
            {audience === "public" ? (
              <span className="protein-goal-hint">
                Record a weight in the owner dashboard.
              </span>
            ) : (
              <a
                className="secondary-button protein-goal-link"
                href="#weight"
                onClick={(event) => {
                  // The browser would move the address first and take the focus from the form.
                  event.preventDefault();
                  dashboard.logic.requestWeightForm();
                  void navigate({ hash: "#weight" });
                }}
              >
                Record weight
              </a>
            )}
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

      <WeightCard />
    </section>
  );
}
