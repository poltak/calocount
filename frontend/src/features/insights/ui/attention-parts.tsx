import type { NutrientReference } from "@app/common/features/entries/utils/insights/nutrient-references";
import type { NutrientKey } from "@app/common/features/entries/utils/nutrients";
import { nutrientLabel } from "../../core/utils/nutrient-format.js";
import { formatShortDate } from "../utils/insight-format.js";
import {
  formatAmount,
  upperLimitReasonText,
  type MissingEntry,
  type SourceRow,
  type UpperLimit,
} from "./attention-format.js";
import { useInsights } from "./insights-context.js";

export function BlockHeading({
  eyebrow,
  title,
  titleId,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
}) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h3 id={titleId}>{title}</h3>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An output element would change the layout that the panel styles set.
    <div className="nutrition-attention__empty" role="status">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function ReferenceDetails({
  reference,
  nutrient,
}: {
  reference: NutrientReference;
  nutrient: NutrientKey;
}) {
  return (
    <details className="nutrition-attention__reference-details">
      <summary>Reference details</summary>
      <p>
        <strong>{reference.label}</strong>
        {` · ${formatAmount(reference.value, nutrient, reference.unit)} · ${reference.authority}`}
      </p>
      <p>
        {reference.type === "personal-goal"
          ? "This is the personal maximum or minimum selected in your settings."
          : reference.type === "upper-limit"
            ? "This is a published tolerable upper intake level. It only applies to the stated population, source scope, and nutrient form."
            : "This is a labelled intake reference or reduction guideline. It is not a diagnosis or a toxicity threshold."}
      </p>
      <p>
        {`Applies to: ${reference.population ?? "unspecified population"} · ${reference.sourceScope.replaceAll("-", " ")}${reference.formScope ? ` · ${reference.formScope}` : ""}${reference.referenceVersion ? ` · ${reference.referenceVersion}` : ""}`}
      </p>
      {reference.sourceUrl && (
        <a href={reference.sourceUrl} target="_blank" rel="noreferrer">
          Open source
        </a>
      )}
    </details>
  );
}

export function UnsupportedUpperLimits({
  entries,
}: {
  entries: readonly { key: NutrientKey; upperLimit: UpperLimit }[];
}) {
  return (
    <details className="nutrition-attention__reference-details">
      <summary>Why some nutrients have no upper-limit alert</summary>
      <p>
        This view only compares nutrients with an explicitly configured
        guideline, personal maximum, or supported upper limit. A recommendation
        alone is not an upper limit.
      </p>
      {entries.length > 0 ? (
        <ul className="nutrition-attention__upper-limit-list">
          {entries.map(({ key, upperLimit }) => (
            <li key={key}>
              <strong>{`${nutrientLabel(key)} · upper-limit status`}</strong>
              <span>{upperLimitReasonText(key, upperLimit)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Other tracked nutrients remain descriptive until a reference with the
          right population, source, form, and unit scope is available.
        </p>
      )}
    </details>
  );
}

export function MissingList({
  entries,
  limit,
}: {
  entries: MissingEntry[];
  limit: number;
}) {
  return (
    <ul className="nutrition-attention__missing-list">
      {entries.slice(0, limit).map((entry) => (
        <li key={entry.id}>
          <span>{formatShortDate(entry.date)}</span>
          <strong>{entry.names.join(", ")}</strong>
        </li>
      ))}
    </ul>
  );
}

/** One food that supplied the nutrient on the selected day. It opens to show where the value came from. */
export function SourceItem({
  source,
  id,
  amountText,
  share,
  origin,
}: {
  source: SourceRow;
  id: string;
  amountText: string;
  share: number | null;
  origin: string | null;
}) {
  const { logic, state } = useInsights();
  const open = state.expandedSourceId === id;
  const { item, entry } = source;
  const quantity =
    item.quantity != null
      ? `${item.quantity}${item.unit ? ` ${item.unit} · ` : " · "}`
      : "";
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => logic.choose({ expandedSourceId: open ? null : id })}
      >
        <span>{item.name}</span>
        <strong>
          {amountText}
          {share !== null && <small>{` · ${share}%`}</small>}
        </strong>
      </button>
      {open && (
        <small>
          {`${formatShortDate(entry.date)} · ${quantity}${item.calories.toLocaleString("en-US")} kcal · recorded item${origin ? ` · value origin: ${origin}` : ""}`}
        </small>
      )}
    </li>
  );
}
