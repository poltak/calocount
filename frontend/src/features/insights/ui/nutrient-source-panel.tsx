import {
  calculateNutrientSourceDependence,
  calculateNutrientSourceExclusion,
  type NutrientSource,
  type NutrientSourceDependenceResult,
} from "@app/common/features/entries/utils/insights/nutrient-sources";
import { insightDateRange } from "@app/common/features/entries/utils/insights/nutrient-food-scenario";
import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";
import { useMemo } from "react";
import {
  formatClock,
  formatDateRange,
  formatShortDate,
  plural,
} from "../utils/insight-format.js";
import { formatAmount } from "./food-scenario-format.js";
import { RangeButtons } from "./food-scenario-panel.js";
import { useInsights } from "./insights-context.js";

const META = new Map<string, (typeof NUTRIENT_META)[number]>(
  NUTRIENT_META.map((meta) => [meta.key, meta]),
);

function formatSourceAmount(source: NutrientSource, key: NutrientKey) {
  return source.amount === null
    ? "Unknown"
    : `${formatAmount(source.amount, key)} ${META.get(key)?.unit ?? ""}`;
}

function sourceCoverage(source: NutrientSource) {
  const itemCoverage = source.unknownItemCount
    ? `${source.knownItemCount} of ${source.totalItemCount} values known`
    : `${source.totalItemCount} values`;
  return `${source.entryCount} portion${plural(source.entryCount)} · ${source.dayCount} day${plural(source.dayCount)} · ${itemCoverage}`;
}

function concentrationText(
  result: NutrientSourceDependenceResult,
  nutrientLabel: string,
) {
  const largest = result.allSources[0];
  if (!largest || result.largestSourceShare === null) {
    return `Concentration is unavailable because there is no positive known recorded ${nutrientLabel.toLowerCase()} amount.`;
  }
  const largestShare = Math.round(result.largestSourceShare * 100);
  const topThree =
    result.topThreeSourceShare === null
      ? null
      : Math.round(result.topThreeSourceShare * 100);
  const habit = `The largest recorded source is ${largest.label}, appearing in ${largest.entryCount} portion${plural(largest.entryCount)} across ${largest.dayCount} day${plural(largest.dayCount)}.`;
  return `${largest.label} provides ${largestShare}% of known recorded ${nutrientLabel.toLowerCase()}; ${topThree === null ? "the top-three share is unavailable" : `the top three sources provide ${topThree}%`}. ${habit} This describes concentration in the log, not a health score.`;
}

/** Which foods supplied a nutrient, and what the total would be without one of them. */
export function NutrientSourcePanel() {
  const { logic, state } = useInsights();
  const {
    entries,
    today,
    focusedNutrient,
    sourceRange: range,
    sourceNutrient: nutrientKey,
    sourceKey,
  } = state;
  const currentDate = today ?? "";
  const result = useMemo(
    () =>
      calculateNutrientSourceDependence({
        entries,
        currentDate,
        range,
        nutrientKey,
      }),
    [entries, currentDate, range, nutrientKey],
  );
  const rows = result.other
    ? [...result.sources, result.other]
    : result.sources;
  const selectedSource =
    sourceKey === null
      ? null
      : (rows.find((source) => source.key === sourceKey) ??
        result.allSources.find((source) => source.key === sourceKey) ??
        null);
  const exclusion = selectedSource
    ? calculateNutrientSourceExclusion(result, selectedSource.key)
    : null;
  const meta = META.get(nutrientKey);
  const label = meta?.label ?? nutrientKey;
  const unit = meta?.unit ?? "";
  const nutrientName = label.toLowerCase();
  const { startDate, endDate } = insightDateRange(currentDate, range);
  const select = (key: string) => logic.choose({ sourceKey: key });

  return (
    <article
      className="nutrient-food-scenarios__panel"
      aria-labelledby="nutrient-source-title"
    >
      <div className="nutrient-food-scenarios__heading">
        <div>
          <p className="eyebrow">Food sources</p>
          <h3 id="nutrient-source-title">Where a nutrient comes from</h3>
        </div>
        <RangeButtons
          range={range}
          label="Nutrient source date range"
          onChange={(value) => logic.choose({ sourceRange: value })}
        />
      </div>
      <div className="nutrient-food-scenarios__source-controls">
        <label className="nutrient-food-scenarios__select-label">
          <span>Nutrient</span>
          <select
            value={nutrientKey}
            onChange={(event) =>
              logic.choose({
                sourceNutrient:
                  NUTRIENT_KEYS.find((key) => key === event.target.value) ??
                  "fiberG",
                sourceKey: null,
              })
            }
          >
            {NUTRIENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {META.get(key)?.label ?? key}
              </option>
            ))}
          </select>
        </label>
        <p className="nutrient-food-scenarios__source-coverage">
          {`${formatDateRange(startDate, endDate)} · ${result.knownTotal === null ? "No known recorded amount" : `${formatAmount(result.knownTotal, nutrientKey)} ${unit} known`} · ${result.knownItemCount} of ${result.totalItemCount} item values known`}
        </p>
      </div>
      <p className="nutrient-food-scenarios__description">
        {`Sources use exact food names after trimming whitespace and ignoring case. Shares describe recorded known ${nutrientName} only; ${result.unknownItemCount ? `${result.unknownItemCount} item value${result.unknownItemCount === 1 ? " is" : "s are"} unknown.` : "all matching item values are known."}`}
      </p>
      {focusedNutrient && (
        <p className="nutrient-food-scenarios__focus-note">
          Showing sources for the selected <strong>{label}</strong> finding.
        </p>
      )}
      {rows.length > 0 ? (
        <>
          <div className="nutrient-food-scenarios__source-summary">
            <div>
              <small>Recorded entries</small>
              <strong>{`${result.recordedEntryCount} · ${result.recordedDayCount} days`}</strong>
            </div>
            <div>
              <small>Largest source</small>
              <strong>
                {result.largestSourceShare === null
                  ? "Unavailable"
                  : `${Math.round(result.largestSourceShare * 100)}%`}
              </strong>
            </div>
            <div>
              <small>Top three</small>
              <strong>
                {result.topThreeSourceShare === null
                  ? "Unavailable"
                  : `${Math.round(result.topThreeSourceShare * 100)}%`}
              </strong>
            </div>
            <p>{concentrationText(result, label)}</p>
          </div>
          {rows.some((source) => source.share !== null && source.share > 0) ? (
            <div
              className="nutrient-food-scenarios__stack"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart or list.
              role="group"
              aria-label={`Recorded ${nutrientName} contributions by food source`}
            >
              {rows.map((source, index) =>
                source.share !== null && source.share > 0 ? (
                  <button
                    key={source.key}
                    type="button"
                    className={`nutrient-food-scenarios__stack-segment source-color-${index % 6}`}
                    style={{ width: `${source.share * 100}%` }}
                    aria-label={`${source.label}: ${Math.round(source.share * 100)}% of known recorded ${nutrientName}. Select to inspect.`}
                    onClick={() => select(source.key)}
                  />
                ) : null,
              )}
            </div>
          ) : (
            <div className="nutrient-food-scenarios__source-no-chart">
              Known recorded amounts are zero, so percentage shares are
              unavailable.
            </div>
          )}
          <div
            className="nutrient-food-scenarios__source-legend"
            aria-label="Nutrient source contributions"
          >
            {rows.map((source, index) => (
              <div
                key={source.key}
                className="nutrient-food-scenarios__source-row"
              >
                <span
                  className={`nutrient-food-scenarios__source-swatch source-color-${index % 6}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="nutrient-food-scenarios__source-name"
                  aria-pressed={sourceKey === source.key}
                  onClick={() => select(source.key)}
                >
                  <span>{source.label}</span>
                  <small>
                    {`${formatSourceAmount(source, nutrientKey)} · ${source.share === null ? "share unavailable" : `${Math.round(source.share * 100)}%`} · ${sourceCoverage(source)}`}
                  </small>
                </button>
                <button
                  type="button"
                  className="nutrient-food-scenarios__exclude"
                  onClick={() => select(source.key)}
                >
                  Exclude
                </button>
              </div>
            ))}
          </div>
          {selectedSource && exclusion && (
            <div
              className="nutrient-food-scenarios__source-detail"
              aria-live="polite"
            >
              <div>
                <p className="eyebrow">Hypothetical exclusion</p>
                <h4>{exclusion.sourceLabel}</h4>
                <p>
                  {`Removing this source from the calculation leaves ${exclusion.remainingKnownAmount === null ? "an unknown" : `${formatAmount(exclusion.remainingKnownAmount, nutrientKey)} ${unit}`} recorded known ${nutrientName}. Records are unchanged; this is a what-if view.`}
                </p>
                <p>
                  {`${selectedSource.entryCount} matching portion${plural(selectedSource.entryCount)} across ${selectedSource.dayCount} day${plural(selectedSource.dayCount)}; values below are from the logged portions.`}
                </p>
              </div>
              <div className="nutrient-food-scenarios__source-stats">
                <span>
                  <small>Source amount</small>
                  <strong>
                    {exclusion.excludedKnownAmount === null
                      ? "Unknown"
                      : `${formatAmount(exclusion.excludedKnownAmount, nutrientKey)} ${unit}`}
                  </strong>
                </span>
                <span>
                  <small>Unknown values removed</small>
                  <strong>{exclusion.excludedUnknownItemCount}</strong>
                </span>
              </div>
              <h5>Matching entries</h5>
              <ul className="nutrient-food-scenarios__source-entries">
                {selectedSource.entries.map((entry, index) => (
                  <li key={`${entry.entryId}-${index}`}>
                    <span>
                      <strong>{entry.itemName}</strong>
                      <small>
                        {`${formatShortDate(entry.date)} · ${formatClock(entry.consumedAt)}${entry.quantity === null ? "" : ` · ${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`}`}
                      </small>
                    </span>
                    <strong>
                      {entry.value === null
                        ? "Unknown"
                        : `${formatAmount(entry.value, nutrientKey)} ${unit}`}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An output element would change the layout that the panel styles set.
        <div className="nutrient-food-scenarios__empty" role="status">
          No food entries are available in this date range.
        </div>
      )}
    </article>
  );
}
