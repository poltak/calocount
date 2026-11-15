import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { cx } from "../../core/utils/class-names.js";
import { nutrientLabel } from "../../core/utils/nutrient-format.js";
import { formatShortDate } from "../utils/insight-format.js";
import {
  dayStatusDescription,
  dayStatusLabel,
  explicitNutrientOrigin,
  formatAmount,
  shortfallTrendLabel,
  sourceRows,
  type AttentionModel,
  type CoverageRow,
} from "./attention-format.js";
import {
  BlockHeading,
  EmptyState,
  MissingList,
  ReferenceDetails,
  SourceItem,
} from "./attention-parts.js";
import { useInsights } from "./insights-context.js";

const detailId = (nutrient: NutrientKey) =>
  `nutrition-attention-shortfall-detail-${nutrient}`;

/** The nutrients that stayed below their minimum reference over the window. */
export function ShortfallBlock({
  model,
  coverage,
}: {
  model: AttentionModel;
  coverage: CoverageRow[];
}) {
  const { logic, state } = useInsights();
  const { entries, shortfallNutrient, shortfallDate, showAllShortfalls } =
    state;
  const all = model.findings.filter((finding) => finding.kind === "shortfall");
  const findings = showAllShortfalls ? all : all.slice(0, 3);
  const fact = shortfallNutrient ? model.nutrients[shortfallNutrient] : null;
  const data = fact?.shortfall ?? null;
  const days = fact?.days ?? [];
  const selectedDay =
    days.find((day) => day.date === shortfallDate) ??
    days.toReversed().find((day) => day.status !== "unlogged") ??
    days.at(-1) ??
    null;
  const sources = sourceRows({
    entries,
    key: shortfallNutrient ?? "fiberG",
    date: selectedDay?.date ?? null,
  });

  return (
    <section
      className="nutrition-attention__block"
      aria-labelledby="nutrition-shortfalls-title"
    >
      <div className="nutrition-attention__block-heading">
        <BlockHeading
          eyebrow="Needs a closer look"
          title="Persistent shortfalls"
          titleId="nutrition-shortfalls-title"
        />
        <span className="panel-meta">minimum references</span>
      </div>
      <p className="nutrition-attention__hint">
        Ranked from complete logged days. A low recorded amount is a reason to
        inspect the pattern, not a diagnosis.
      </p>
      {findings.length === 0 ? (
        <EmptyState
          title="No persistent shortfalls yet"
          detail={`Complete nutrient values across at least ${model.minimumEligibleDays} logged days, with two eligible weeks below a reference, are needed for this finding.`}
        />
      ) : (
        <div className="nutrition-attention__findings">
          {findings.map((finding, index) => {
            const findingFact = model.nutrients[finding.nutrient];
            const shortfall = findingFact.shortfall;
            const label = nutrientLabel(finding.nutrient);
            const open = shortfallNutrient === finding.nutrient;
            const percent = shortfall.meanPercent ?? 0;
            const missingEntries =
              coverage.find((row) => row.key === finding.nutrient)
                ?.missingEntries ?? [];
            return (
              <div
                key={finding.nutrient}
                className={`nutrition-finding ${open ? "is-selected" : ""}`}
              >
                <button
                  type="button"
                  className="nutrition-finding__button"
                  aria-expanded={open}
                  aria-controls={detailId(finding.nutrient)}
                  onClick={() =>
                    logic.choose({
                      shortfallNutrient: open ? null : finding.nutrient,
                      shortfallDate: null,
                    })
                  }
                >
                  <span className="nutrition-finding__rank">{index + 1}</span>
                  <span className="nutrition-finding__main">
                    <span className="nutrition-finding__label">
                      <strong>{label}</strong>
                      <small>{`${finding.weeksBelowReference} eligible weeks below reference · ${shortfall.eligibleDays} complete days`}</small>
                    </span>
                    <span
                      className="nutrition-finding__bar"
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A progress element cannot hold the styled bar.
                      role="progressbar"
                      aria-label={`${label}: ${Math.round(percent)}% of reference`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.round(percent))}
                    >
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, percent))}%`,
                        }}
                      />
                      <i aria-hidden="true" />
                    </span>
                  </span>
                  <span className="nutrition-finding__value">
                    {formatAmount(shortfall.mean, finding.nutrient)}
                    <small>{`${Math.round(percent)}% of ${formatAmount(finding.reference.value, finding.nutrient)}`}</small>
                  </span>
                </button>
                {open && data && (
                  <div
                    className="nutrition-finding__detail"
                    id={detailId(finding.nutrient)}
                    aria-live="polite"
                  >
                    <p>
                      <strong>{label}</strong>
                      {` averaged ${formatAmount(data.mean, finding.nutrient)} across ${data.eligibleDays} complete logged days. That is ${shortfallTrendLabel(findingFact)} across the selected window.`}
                    </p>
                    <p className="nutrition-attention__fine-print">
                      {`Coverage: ${findingFact.coverage.completeDays} complete days, ${findingFact.coverage.partialDays} partial days, ${findingFact.coverage.unknownLoggedDays} logged days with no usable value, and ${findingFact.coverage.unloggedDays} unlogged days. The mean excludes every day without complete item values.`}
                    </p>
                    {data.reference && (
                      <ReferenceDetails
                        reference={data.reference}
                        nutrient={finding.nutrient}
                      />
                    )}
                    <button
                      type="button"
                      className="nutrition-attention__compare"
                      onClick={() =>
                        logic.compareFoodChange({ nutrient: finding.nutrient })
                      }
                    >
                      {`Compare a food change for ${label}`}
                    </button>
                    <div className="nutrition-attention__daily-heading">
                      <div>
                        <strong>Daily recorded values</strong>
                        <span>
                          Complete days enter the mean; partial, unknown, and
                          unlogged dates stay visible as exclusions.
                        </span>
                      </div>
                      <span>{`${data.eligibleDays} of ${model.windowDays} dates included`}</span>
                    </div>
                    <div
                      className="nutrition-attention__daily-list"
                      aria-label={`${label} daily recorded values`}
                    >
                      {days.toReversed().map((day) => {
                        const selected = selectedDay?.date === day.date;
                        const reference = data.reference;
                        const percentOfReference =
                          day.amount !== null && reference
                            ? (day.amount / reference.value) * 100
                            : null;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            className={cx(
                              "nutrition-attention__daily-row",
                              `is-${day.status}`,
                              selected && "is-selected",
                            )}
                            aria-label={dayStatusDescription({
                              day,
                              key: finding.nutrient,
                              reference,
                            })}
                            aria-pressed={selected}
                            onClick={() =>
                              logic.choose({ shortfallDate: day.date })
                            }
                          >
                            <span className="nutrition-attention__daily-date">
                              {formatShortDate(day.date)}
                            </span>
                            <span className="nutrition-attention__daily-bar">
                              <i
                                style={{
                                  width: `${percentOfReference === null ? 0 : Math.min(100, Math.max(4, percentOfReference))}%`,
                                }}
                              />
                            </span>
                            <strong>
                              {formatAmount(day.amount, finding.nutrient)}
                            </strong>
                            <small>{dayStatusLabel(day.status)}</small>
                          </button>
                        );
                      })}
                    </div>
                    {selectedDay && (
                      <div className="nutrition-attention__day-detail">
                        <div className="nutrition-source-detail__heading">
                          <div>
                            <p className="eyebrow">Selected day</p>
                            <h4>{formatShortDate(selectedDay.date)}</h4>
                          </div>
                          <span>{`${selectedDay.knownItemCount} of ${selectedDay.totalItemCount} item values present`}</span>
                        </div>
                        <p className="nutrition-attention__fine-print">
                          {dayStatusDescription({
                            day: selectedDay,
                            key: finding.nutrient,
                            reference: data.reference,
                          })}
                        </p>
                        {sources.length === 0 ? (
                          <p className="nutrition-attention__fine-print">
                            {`No known ${label.toLowerCase()} contributions are available for this day.`}
                          </p>
                        ) : (
                          <ul className="nutrition-source-list">
                            {sources.map((source) => (
                              <SourceItem
                                key={`${source.entry.id}-${source.index}`}
                                source={source}
                                id={`shortfall-${source.entry.id}-${source.index}`}
                                amountText={formatAmount(
                                  source.value,
                                  finding.nutrient,
                                )}
                                share={
                                  selectedDay.amount
                                    ? Math.round(
                                        (source.value / selectedDay.amount) *
                                          100,
                                      )
                                    : null
                                }
                                origin={explicitNutrientOrigin(
                                  source.item,
                                  finding.nutrient,
                                )}
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {missingEntries.length > 0 && (
                      <details>
                        <summary>{`${missingEntries.length} entries missing ${label} values`}</summary>
                        <MissingList entries={missingEntries} limit={6} />
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {all.length > 3 && (
        <button
          type="button"
          className="nutrition-attention__show-all"
          onClick={() =>
            logic.choose({ showAllShortfalls: !showAllShortfalls })
          }
        >
          {showAllShortfalls
            ? "Show top 3 shortfalls"
            : `Show all ${all.length} shortfalls`}
        </button>
      )}
    </section>
  );
}
