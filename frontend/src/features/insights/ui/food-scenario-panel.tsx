import {
  calculateFoodScenario,
  foodScenarioMultipliers,
  foodScenarioTradeoffText,
  insightDateRange,
  scenarioFoodCandidates,
  type FoodScenarioMetric,
  type FoodScenarioMode,
  type InsightRange,
  type ScenarioFoodCandidate,
} from "@app/common/features/entries/utils/insights/nutrient-food-scenario";
import { NUTRIENT_META } from "@app/common/features/entries/utils/nutrients";
import type { NutrientGoalMap } from "@app/common/features/entries/utils/nutrient-goals";
import { useMemo } from "react";
import { cx } from "../../core/utils/class-names.js";
import { formatDateRange } from "../utils/insight-format.js";
import {
  candidateLabel,
  formatDelta,
  formatMetricValue,
  goalLabel,
  orderedMetrics,
  referencePercent,
} from "./food-scenario-format.js";
import { useInsights } from "./insights-context.js";

const RANGES: readonly InsightRange[] = [14, 28];

export function RangeButtons({
  range,
  label,
  onChange,
}: {
  range: InsightRange;
  label: string;
  onChange: (range: InsightRange) => void;
}) {
  return (
    <div className="nutrient-food-scenarios__range" aria-label={label}>
      {RANGES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={range === value}
          className={range === value ? "is-active" : ""}
          onClick={() => onChange(value)}
        >
          {`${value} days`}
        </button>
      ))}
    </div>
  );
}

function ReferenceProgress({
  value,
  metric,
  goals,
  side,
}: {
  value: number | null;
  metric: FoodScenarioMetric;
  goals: NutrientGoalMap;
  side: "before" | "after";
}) {
  const reference = referencePercent(value, metric, goals);
  if (!reference) {
    return null;
  }
  const percent = Math.max(0, reference.value);
  const word = reference.direction === "minimum" ? "minimum" : "maximum";
  return (
    <span
      className={cx(
        "nutrient-food-scenarios__reference",
        reference.direction === "maximum" && percent > 100 && "is-over",
      )}
      aria-label={`${metric.label} ${side}: ${Math.round(percent)}% of ${word} reference`}
    >
      <span className="nutrient-food-scenarios__reference-label">
        {`${Math.round(percent)}% of ${word}`}
      </span>
      <span
        className="nutrient-food-scenarios__reference-bar"
        aria-hidden="true"
      >
        <i style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
    </span>
  );
}

function MetricTable({
  rows,
  caption,
  goals,
}: {
  rows: FoodScenarioMetric[];
  caption: string;
  goals: NutrientGoalMap;
}) {
  return (
    <table className="nutrient-food-scenarios__scenario-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {["Nutrient", "Before", "After", "Change"].map((heading) => (
            <th key={heading} scope="col">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((metric) => {
          const goal = goalLabel(metric, goals);
          return (
            <tr
              key={metric.key}
              className={metric.delta === null ? "is-unknown" : ""}
            >
              <th scope="row">
                <span>{metric.label}</span>
                {goal && <small>{goal}</small>}
              </th>
              <td data-label="Before">
                <span className="nutrient-food-scenarios__metric-value">
                  {formatMetricValue(metric.before, metric)}
                </span>
                <ReferenceProgress
                  value={metric.before}
                  metric={metric}
                  goals={goals}
                  side="before"
                />
              </td>
              <td data-label="After">
                <span className="nutrient-food-scenarios__metric-value">
                  {formatMetricValue(metric.after, metric)}
                </span>
                <ReferenceProgress
                  value={metric.after}
                  metric={metric}
                  goals={goals}
                  side="after"
                />
              </td>
              <td
                data-label="Change"
                className={
                  metric.delta === null
                    ? ""
                    : metric.delta > 0
                      ? "is-increase"
                      : metric.delta < 0
                        ? "is-decrease"
                        : ""
                }
              >
                {formatDelta(metric)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FoodSelect({
  label,
  candidates,
  value,
  onChange,
}: {
  label: string;
  candidates: ScenarioFoodCandidate[];
  value: ScenarioFoodCandidate | null;
  onChange: (id: string) => void;
}) {
  return (
    <label className="nutrient-food-scenarios__select-label">
      <span>{label}</span>
      <select
        value={value?.id ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={candidates.length === 0}
      >
        {candidates.length === 0 && (
          <option value="">No logged foods in this range</option>
        )}
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidateLabel(candidate)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** What one logged portion would add, or what one would change if it replaced another. */
export function FoodScenarioPanel() {
  const { logic, state } = useInsights();
  const {
    entries,
    today,
    nutrientGoals: goals,
    focusedNutrient,
    scenarioRange: range,
    scenarioMode: mode,
    scenarioMultiplier: multiplier,
    scenarioCandidateId,
    scenarioBeforeId,
    scenarioAfterId,
  } = state;
  const currentDate = today ?? "";
  const candidates = useMemo(
    () =>
      scenarioFoodCandidates({
        entries,
        currentDate,
        range,
        ...(focusedNutrient ? { prioritizeNutrient: focusedNutrient } : {}),
      }),
    [entries, currentDate, range, focusedNutrient],
  );
  const candidate =
    candidates.find((item) => item.id === scenarioCandidateId) ??
    candidates[0] ??
    null;
  const before =
    candidates.find((item) => item.id === scenarioBeforeId) ??
    candidates[0] ??
    null;
  const after =
    candidates.find((item) => item.id === scenarioAfterId) ??
    candidates.find(
      (item) =>
        item.label.toLocaleLowerCase() !== before?.label.toLocaleLowerCase(),
    ) ??
    candidates.find((item) => item.id !== before?.id) ??
    candidates[0] ??
    null;
  const scenario =
    mode === "addition"
      ? candidate
        ? calculateFoodScenario({ mode, item: candidate.item, multiplier })
        : null
      : before && after
        ? calculateFoodScenario({
            mode,
            before: before.item,
            after: after.item,
            multiplier,
          })
        : null;
  const ordered = scenario ? orderedMetrics(scenario.metrics, goals) : [];
  const known = ordered.filter((metric) => metric.delta !== null);
  const unavailable = ordered.filter((metric) => metric.delta === null);
  const { startDate, endDate } = insightDateRange(currentDate, range);
  const focusedLabel = NUTRIENT_META.find(
    (meta) => meta.key === focusedNutrient,
  )?.label;

  return (
    <article
      className="nutrient-food-scenarios__panel"
      aria-labelledby="nutrient-food-change-title"
    >
      <div className="nutrient-food-scenarios__heading">
        <div>
          <p className="eyebrow">Food changes</p>
          <h3 id="nutrient-food-change-title">Compare a food change</h3>
        </div>
        <RangeButtons
          range={range}
          label="Food change date range"
          onChange={(value) => logic.choose({ scenarioRange: value })}
        />
      </div>
      <p className="nutrient-food-scenarios__description">
        {`Choose a logged portion from ${formatDateRange(startDate, endDate)}. The comparison is hypothetical and does not log a meal or change your totals; missing nutrient values stay unknown.`}
      </p>
      {focusedLabel && (
        <p className="nutrient-food-scenarios__focus-note">
          Focused finding: <strong>{focusedLabel}</strong>. Logged candidates
          with a known amount of this nutrient are shown first.
        </p>
      )}
      <div className="nutrient-food-scenarios__scenario-controls">
        <label className="nutrient-food-scenarios__select-label">
          <span>Change type</span>
          <select
            value={mode}
            onChange={(event) =>
              logic.choose({
                scenarioMode: (event.target.value === "replacement"
                  ? "replacement"
                  : "addition") satisfies FoodScenarioMode,
              })
            }
          >
            <option value="addition">Add a logged food</option>
            <option value="replacement">Replace one logged food</option>
          </select>
        </label>
        {mode === "addition" ? (
          <FoodSelect
            label="Food to add"
            candidates={candidates}
            value={candidate}
            onChange={(id) => logic.choose({ scenarioCandidateId: id })}
          />
        ) : (
          <>
            <FoodSelect
              label="Food being replaced"
              candidates={candidates}
              value={before}
              onChange={(id) => logic.choose({ scenarioBeforeId: id })}
            />
            <FoodSelect
              label="Replacement food"
              candidates={candidates}
              value={after}
              onChange={(id) => logic.choose({ scenarioAfterId: id })}
            />
          </>
        )}
        <div
          className="nutrient-food-scenarios__multiplier"
          aria-label="Logged portion multiplier"
        >
          <span>Portion</span>
          <div>
            {foodScenarioMultipliers.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={multiplier === value}
                className={multiplier === value ? "is-active" : ""}
                onClick={() => logic.choose({ scenarioMultiplier: value })}
              >
                {`${value}×`}
              </button>
            ))}
          </div>
        </div>
      </div>
      {scenario ? (
        <div
          className="nutrient-food-scenarios__scenario-result"
          aria-live="polite"
        >
          <p className="nutrient-food-scenarios__scenario-summary">
            {`${scenario.mode === "addition" ? `Adding ${scenario.afterName}` : `Replacing ${scenario.beforeName ?? "the selected food"} with ${scenario.afterName}`} at ${scenario.multiplier}× the logged portion. `}
            <span>{`${scenario.knownMetricCount} of ${scenario.metrics.length} tracked values have a known change.`}</span>
          </p>
          <p className="nutrient-food-scenarios__tradeoff">
            <strong>Tradeoff:</strong>{" "}
            {foodScenarioTradeoffText(scenario, { focusedNutrient })}
          </p>
          <div className="nutrient-food-scenarios__table-wrap">
            <MetricTable
              rows={known}
              caption="Known recorded amounts for one hypothetical portion"
              goals={goals}
            />
            {unavailable.length > 0 && (
              <details className="nutrient-food-scenarios__unavailable">
                <summary>{`Show unavailable nutrients (${unavailable.length})`}</summary>
                <div className="nutrient-food-scenarios__unavailable-table">
                  <MetricTable
                    rows={unavailable}
                    caption="Unavailable nutrient values for one hypothetical portion"
                    goals={goals}
                  />
                </div>
              </details>
            )}
          </div>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An output element would change the layout that the panel styles set.
        <div className="nutrient-food-scenarios__empty" role="status">
          Log a food with this date range to compare a hypothetical change.
        </div>
      )}
    </article>
  );
}
