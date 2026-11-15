import { nutrientLabel } from "../../core/utils/nutrient-format.js";
import {
  coverageDescription,
  stateLabel,
  type AttentionModel,
  type CoverageRow,
} from "./attention-format.js";
import { BlockHeading, EmptyState, MissingList } from "./attention-parts.js";
import { useInsights } from "./insights-context.js";

/** How many item values each nutrient has, so the owner can see what the other blocks rest on. */
export function CoverageBlock({
  model,
  coverage,
}: {
  model: AttentionModel;
  coverage: CoverageRow[];
}) {
  const { logic, state } = useInsights();
  const { showAllCoverage } = state;
  const attention = coverage.filter(
    (row) => row.state !== "complete" || row.missingEntries.length > 0,
  );
  const defaultRows = attention.slice(0, 8);
  const visible = showAllCoverage ? coverage : defaultRows;
  const hiddenCount = coverage.length - defaultRows.length;

  return (
    <section
      className="nutrition-attention__coverage"
      aria-labelledby="nutrition-coverage-title"
    >
      <div className="nutrition-attention__block-heading">
        <BlockHeading
          eyebrow="Trust the context"
          title="Data coverage"
          titleId="nutrition-coverage-title"
        />
        <span className="panel-meta">logged items only</span>
      </div>
      <p className="nutrition-attention__hint">
        Complete means every logged item has a value for that nutrient. It does
        not confirm that every meal was recorded or that an estimate is
        accurate.
      </p>
      <details className="nutrition-attention__coverage-help">
        <summary>How to read coverage and provenance</summary>
        <p>
          <strong>Logged day</strong> means at least one item was recorded.{" "}
          <strong>Complete</strong> means every loaded item has a value for the
          nutrient. <strong>Partial</strong> means only some item values are
          present, and <strong>unknown</strong> means the day is logged but no
          usable value is available. Unlogged days remain unobserved rather than
          zero.
        </p>
        <p>
          When available, the explicit nutrientProvenance field identifies
          whether a value came from a label, database, manual estimate, or AI
          estimate; it appears in the selected item detail. Generic item source
          labels are not treated as nutrient provenance. Populated fields are
          therefore recorded values, not verified measurements.
        </p>
      </details>
      {visible.length === 0 ? (
        <EmptyState
          title="No coverage issues in this window"
          detail="All logged nutrient fields are populated."
        />
      ) : (
        <div className="nutrition-coverage-list">
          {visible.map((row) => (
            <details
              key={row.key}
              className={`nutrition-coverage-row is-${row.state}`}
            >
              <summary>
                <span className="nutrition-coverage-row__name">
                  <strong>{nutrientLabel(row.key)}</strong>
                  <small>{coverageDescription(row)}</small>
                </span>
                <span className="nutrition-coverage-row__state">
                  {stateLabel(row.state)}
                </span>
              </summary>
              <div className="nutrition-coverage-row__detail">
                <p>{`${row.completeDays} complete · ${row.partialDays} partial · ${row.unknownLoggedDays} logged with no usable value · ${row.unloggedDays} unlogged in the ${model.windowDays}-day window.`}</p>
                <p>
                  {`${row.totalItems > 0 ? `${row.knownItems} of ${row.totalItems} item values are present.` : "No item-level nutrient details are available for this window."} These counts describe fields, not the share of nutrient intake captured.`}
                </p>
                {row.missingEntries.length > 0 ? (
                  <>
                    <p>{`${row.missingEntries.length} logged entr${row.missingEntries.length === 1 ? "y is" : "ies are"} missing a ${nutrientLabel(row.key)} value:`}</p>
                    <MissingList entries={row.missingEntries} limit={8} />
                  </>
                ) : (
                  <p>
                    No individual missing entries were found in the loaded
                    history.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      {coverage.length > defaultRows.length && (
        <button
          type="button"
          className="nutrition-attention__show-all"
          onClick={() => logic.choose({ showAllCoverage: !showAllCoverage })}
        >
          {showAllCoverage
            ? "Show coverage needing attention"
            : `Show all coverage (${hiddenCount} more)`}
        </button>
      )}
    </section>
  );
}
