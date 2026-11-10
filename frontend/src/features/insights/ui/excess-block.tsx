import type { NutritionAttentionNutrientFact } from "@app/common/features/entries/utils/insights/nutrition-attention-types";
import type { NutrientReference } from "@app/common/features/entries/utils/insights/nutrient-references";
import {
  NUTRIENT_KEYS,
  type NutrientKey,
} from "@app/common/features/entries/utils/nutrients";
import { NUTRIENT_UPPER_LIMIT_LABELS } from "@app/common/features/entries/utils/insights/nutrient-references";
import { cx } from "../../core/utils/class-names.js";
import { nutrientLabel } from "../../core/utils/nutrient-format.js";
import { formatShortDate } from "../utils/insight-format.js";
import {
  excessDayStatus,
  explicitNutrientOrigin,
  formatAmount,
  referenceDescriptor,
  sourceRows,
  statusDescription,
  type AttentionModel,
  type UpperLimit,
} from "./attention-format.js";
import {
  BlockHeading,
  EmptyState,
  ReferenceDetails,
  SourceItem,
  UnsupportedUpperLimits,
} from "./attention-parts.js";
import { useInsights } from "./insights-context.js";

const EXCESS_KEYS: NutrientKey[] = ["sodiumMg", "saturatedFatG"];

interface ExcessComparison {
  key: NutrientKey;
  kind: "guideline" | "upper-limit";
  fact: NutritionAttentionNutrientFact;
  summary: NutritionAttentionNutrientFact["excess"] | UpperLimit;
  reference: NutrientReference;
}

/** The days above a maximum reference or a supported upper limit, and the foods behind them. */
export function ExcessBlock({ model }: { model: AttentionModel }) {
  const { logic, state } = useInsights();
  const { entries, excessOption, excessDate } = state;
  const options = NUTRIENT_KEYS.flatMap((key): ExcessComparison[] => {
    const fact = model.nutrients[key];
    const result: ExcessComparison[] = [];
    if (fact.excess.reference) {
      result.push({
        key,
        kind: "guideline",
        fact,
        summary: fact.excess,
        reference: fact.excess.reference,
      });
    }
    if (fact.excess.upperLimit.reference) {
      result.push({
        key,
        kind: "upper-limit",
        fact,
        summary: fact.excess.upperLimit,
        reference: fact.excess.upperLimit.reference,
      });
    }
    return result;
  });
  const preferred =
    options.find((o) => o.key === "sodiumMg" && o.kind === "guideline") ??
    options.find((o) => EXCESS_KEYS.includes(o.key)) ??
    options[0] ??
    null;
  const selected =
    options.find((o) => `${o.key}:${o.kind}` === excessOption) ?? preferred;
  const excess = selected?.summary ?? null;
  const excessKey = selected?.key ?? "sodiumMg";
  const dataKey =
    selected?.kind === "upper-limit"
      ? selected.fact.excess.upperLimit.dataKey
      : excessKey;
  const amountLabel =
    dataKey === excessKey
      ? nutrientLabel(excessKey)
      : (NUTRIENT_UPPER_LIMIT_LABELS[
          dataKey as keyof typeof NUTRIENT_UPPER_LIMIT_LABELS
        ] ?? nutrientLabel(excessKey));
  const days =
    excess?.dayClassifications.filter((day) => day.status !== "unlogged") ?? [];
  const selectedDay =
    days.find((day) => day.date === excessDate) ?? days.at(-1) ?? null;
  const sources = sourceRows({
    entries,
    key: dataKey,
    date: selectedDay?.date ?? null,
  });
  const unsupported = NUTRIENT_KEYS.map((key) => ({
    key,
    upperLimit: model.nutrients[key].excess.upperLimit,
  })).filter(
    ({ upperLimit }) =>
      upperLimit.reason === "missing-applicability-data" ||
      upperLimit.reason === "no-established-upper-limit",
  );
  const unit = excess?.reference?.unit;
  const threshold = excess?.reference?.value ?? 0;

  return (
    <section
      className="nutrition-attention__block nutrition-attention__excess"
      aria-labelledby="nutrition-excess-title"
    >
      <div className="nutrition-attention__block-heading">
        <BlockHeading
          eyebrow="Repeated high days"
          title="Recorded excess"
          titleId="nutrition-excess-title"
        />
        <label className="nutrition-attention__select-label">
          Comparison
          <select
            value={selected ? `${selected.key}:${selected.kind}` : ""}
            onChange={(event) =>
              logic.choose({
                excessOption: event.target.value,
                excessDate: null,
              })
            }
            aria-label="Select excess nutrient"
          >
            {options.map((option) => (
              <option
                key={`${option.key}:${option.kind}`}
                value={`${option.key}:${option.kind}`}
              >
                {`${nutrientLabel(option.key)} · ${option.kind === "upper-limit" ? "upper limit" : option.reference.label.toLowerCase()}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!excess || !excess.reference ? (
        <>
          <EmptyState
            title="No excess thresholds configured"
            detail="Sodium and saturated fat comparisons will appear when their goals are enabled."
          />
          <UnsupportedUpperLimits entries={unsupported} />
        </>
      ) : (
        <>
          <p className="nutrition-attention__hint">
            {`Finished days above ${referenceDescriptor(excess.reference)} are shown individually. A partial day above the threshold still counts as an observed crossing; an incomplete day at or below it stays indeterminate.`}
          </p>
          <ReferenceDetails reference={excess.reference} nutrient={excessKey} />
          <UnsupportedUpperLimits entries={unsupported} />
          <div className="nutrition-excess-summary">
            <div>
              <span>High days</span>
              <strong>{`${excess.observedAboveDays} of ${excess.observedDays} observed days above ${formatAmount(excess.reference.value, excessKey, unit)}`}</strong>
            </div>
            <div>
              <span>Mean recorded</span>
              <strong>
                {formatAmount(excess.averageKnown, excessKey, unit)}
              </strong>
              <small>{`across ${excess.observedDays} observed days`}</small>
            </div>
            <div>
              <span>Maximum recorded</span>
              <strong>
                {formatAmount(excess.maximumRecorded, excessKey, unit)}
              </strong>
              <small>individual day</small>
            </div>
          </div>
          {(excess.indeterminateDays > 0 || excess.unloggedDays > 0) && (
            <p className="nutrition-attention__fine-print">
              {`${excess.indeterminateDays} logged day${excess.indeterminateDays === 1 ? " has" : "s have"} incomplete data · ${excess.unloggedDays} unlogged day${excess.unloggedDays === 1 ? " is" : "s are"} unobserved. Neither group is counted as compliant.`}
            </p>
          )}
          <div
            className={`nutrition-current-observation ${excess.current.aboveReference === true ? "is-above" : ""}`}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An output element would change the layout that the panel styles set.
            role="status"
          >
            <span>
              <strong>Current day</strong> · still in progress
            </span>
            <strong>
              {excess.current.status === "unlogged"
                ? "No record yet"
                : excess.current.status === "unknown"
                  ? `No ${amountLabel.toLowerCase()} value recorded yet`
                  : excess.current.aboveReference === true
                    ? `${formatAmount(excess.current.amount, excessKey, unit)} already above ${referenceDescriptor(excess.reference)}`
                    : excess.current.status === "complete"
                      ? `${formatAmount(excess.current.amount, excessKey, unit)} recorded so far`
                      : `${formatAmount(excess.current.amount, excessKey, unit)} recorded so far · incomplete data`}
            </strong>
          </div>
          {days.length === 0 ? (
            <EmptyState
              title="No logged days in this window"
              detail="High day detail will appear once food has been recorded."
            />
          ) : (
            <div
              className="nutrition-excess-days"
              aria-label={`${nutrientLabel(excessKey)} daily detail`}
            >
              {days.map((day) => {
                const status = excessDayStatus(day, threshold);
                const active = selectedDay?.date === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={cx(
                      "nutrition-excess-day",
                      `is-${status}`,
                      active && "is-selected",
                    )}
                    aria-pressed={active}
                    aria-label={statusDescription({
                      day,
                      key: excessKey,
                      threshold,
                      unit,
                    })}
                    onClick={() => logic.choose({ excessDate: day.date })}
                  >
                    <span className="nutrition-excess-day__date">
                      {formatShortDate(day.date)}
                    </span>
                    <span className="nutrition-excess-day__bar">
                      <i
                        style={{
                          width: `${day.amount === null ? 0 : Math.min(100, Math.max(4, (day.amount / threshold) * 100))}%`,
                        }}
                      />
                    </span>
                    <strong>{formatAmount(day.amount, excessKey, unit)}</strong>
                    <small>
                      {status === "above"
                        ? "above"
                        : status === "within"
                          ? "within"
                          : "incomplete"}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
          {selectedDay && (
            <div className="nutrition-source-detail" aria-live="polite">
              <div className="nutrition-source-detail__heading">
                <div>
                  <p className="eyebrow">Source drilldown</p>
                  <h4>{formatShortDate(selectedDay.date)}</h4>
                </div>
                <span>{`${formatAmount(selectedDay.amount, excessKey, unit)} recorded · ${selectedDay.knownItemCount} of ${selectedDay.totalItemCount} item values present`}</span>
              </div>
              <p className="nutrition-attention__fine-print">
                {`${statusDescription({ day: selectedDay, key: excessKey, threshold, unit })}. Known contributions below are shares of the recorded amount for this day.`}
              </p>
              {sources.length === 0 ? (
                <p className="nutrition-attention__fine-print">
                  {`No known ${amountLabel.toLowerCase()} contributions are available for this day.`}
                </p>
              ) : (
                <ul className="nutrition-source-list">
                  {sources.map((source) => (
                    <SourceItem
                      key={`${source.entry.id}-${source.index}`}
                      source={source}
                      id={`${source.entry.id}-${source.index}`}
                      amountText={formatAmount(source.value, excessKey, unit)}
                      share={
                        selectedDay.amount
                          ? Math.round(
                              (source.value / selectedDay.amount) * 100,
                            )
                          : null
                      }
                      origin={
                        dataKey === excessKey
                          ? explicitNutrientOrigin(source.item, excessKey)
                          : null
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
