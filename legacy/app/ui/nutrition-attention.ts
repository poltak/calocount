import { component, cx, h, memo, type Component } from "./dom";
import type { NutrientKey } from "../../domain/nutrients";
import { NUTRIENT_UPPER_LIMIT_META, type NutrientUpperLimitKey } from "../../domain/nutrients";
import { nutrientValueOriginLabel } from "../../domain/nutrient-provenance";
import {
  formatNutrientAmount,
  nutrientKeys,
  nutrientMeta,
  type NutrientGoalMap,
} from "../nutrition/nutrient-meta";
import type { NutrientReference, NutrientUpperLimitApplicabilityOptions } from "../../domain/nutrient-references";
import {
  getNutritionAttention,
  type NutritionAttentionDayFact,
  type NutritionAttentionNutrientFact,
  type NutritionAttentionWindow,
} from "../insights/nutrition-attention-calculations";
import type { InsightDay, InsightEntry } from "../insights/types";

export type NutritionAttentionProps = {
  days: InsightDay[];
  entries: InsightEntry[];
  currentDate: string;
  goals: NutrientGoalMap;
  /** Open the owning entry in the recent dashboard editor or historical editor. */
  onInspectEntry?: (entryId: string, date: string) => void;
  /** Open the food-change comparison focused on the selected nutrient. */
  onSelectFoodChange?: (nutrient: NutrientKey) => void;
  /** Explicit profile confirmations used to opt into a supported UL comparison. */
  referenceSettings?: NutrientUpperLimitApplicabilityOptions;
};

type AttentionRange = NutritionAttentionWindow;
type CoverageState = "complete" | "partial" | "unknown";

type MissingEntry = {
  id: string;
  date: string;
  names: string[];
};

type CoverageRow = {
  key: NutrientKey;
  state: CoverageState;
  completeDays: number;
  partialDays: number;
  unknownLoggedDays: number;
  unloggedDays: number;
  loggedDays: number;
  knownItems: number;
  totalItems: number;
  missingEntries: MissingEntry[];
};

const EXCESS_KEYS: NutrientKey[] = ["sodiumMg", "saturatedFatG"];
type ExcessComparisonKind = "guideline" | "upper-limit";
type ExcessComparison = {
  key: NutrientKey;
  kind: ExcessComparisonKind;
  fact: NutritionAttentionNutrientFact;
  summary: NutritionAttentionNutrientFact["excess"] | NutritionAttentionNutrientFact["excess"]["upperLimit"];
  reference: NutrientReference;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function formatRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)}–${formatDate(endDate)}`;
}

function formatAmount(value: number | null, key: NutrientKey, unit?: string) {
  return value === null ? "Unknown" : `${formatNutrientAmount(value, key)} ${unit ?? nutrientMeta(key).unit}`;
}

function numberValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function missingEntriesFor(entries: readonly InsightEntry[], key: NutrientKey, startDate: string, endDate: string) {
  return entries
    .filter((entry) => entry.date >= startDate && entry.date <= endDate)
    .flatMap((entry) => {
      const names = entry.items.filter((item) => numberValue(item.nutrients?.[key]) === null).map((item) => item.name);
      return names.length ? [{ id: entry.id, date: entry.date, names }] : [];
    });
}

function stateLabel(state: CoverageState) {
  if (state === "complete") return "Complete for logged items";
  if (state === "partial") return "Partial data";
  return "No usable data";
}

function trendLabel(percent: number | null) {
  if (percent === null || Math.abs(percent) < 2) return "steady";
  return `${percent > 0 ? "up" : "down"} ${Math.abs(Math.round(percent))}%`;
}

function shortfallTrendLabel(fact: NutritionAttentionNutrientFact) {
  const means = fact.shortfall.weeklyMeans
    .map((week) => week.mean)
    .filter((mean): mean is number => mean !== null);
  if (means.length < 2 || means[0] === 0) return "steady";
  return trendLabel(((means.at(-1)! - means[0]) / means[0]) * 100);
}

function sourceRows(entries: readonly InsightEntry[], key: NutrientKey | NutrientUpperLimitKey, date: string | null) {
  if (!date) return [];
  return entries
    .filter((entry) => entry.date === date)
    .flatMap((entry) => entry.items.flatMap((item, index) => {
      const value = numberValue(item.nutrients?.[key]);
      return value !== null && value > 0 ? [{ entry, item, index, value }] : [];
    }))
    .sort((left, right) => right.value - left.value);
}

function explicitNutrientOrigin(item: InsightEntry["items"][number], key: NutrientKey) {
  const origin = item.nutrientProvenance?.[key];
  return origin ? nutrientValueOriginLabel(origin) : null;
}

function coverageDescription(row: CoverageRow) {
  if (row.loggedDays === 0) return "No logged days in this window";
  if (row.totalItems === 0) return `${row.loggedDays} logged day${row.loggedDays === 1 ? "" : "s"}; no item details available`;
  return `${row.completeDays} complete of ${row.loggedDays} logged days · ${row.knownItems} of ${row.totalItems} item values present`;
}

function coverageRowsFor(model: ReturnType<typeof getNutritionAttention>, entries: readonly InsightEntry[]) {
  return nutrientKeys.map((key): CoverageRow => {
    const fact = model.nutrients[key];
    const knownItems = fact.days.reduce((sum, day) => sum + day.knownItemCount, 0);
    const totalItems = fact.days.reduce((sum, day) => sum + day.totalItemCount, 0);
    const initialState: CoverageState = fact.coverage.loggedDays === 0 || fact.coverage.knownDays === 0
      ? "unknown"
      : fact.coverage.completeDays === fact.coverage.loggedDays ? "complete" : "partial";
    const missingEntries = missingEntriesFor(entries, key, model.startDate, model.endDate);
    return {
      key,
      state: initialState === "complete" && missingEntries.length > 0 ? "partial" : initialState,
      completeDays: fact.coverage.completeDays,
      partialDays: fact.coverage.partialDays,
      unknownLoggedDays: fact.coverage.unknownLoggedDays,
      unloggedDays: fact.coverage.unloggedDays,
      loggedDays: fact.coverage.loggedDays,
      knownItems,
      totalItems,
      missingEntries,
    };
  });
}

function excessDayStatus(day: NutritionAttentionDayFact, threshold: number) {
  if (day.status === "unlogged") return "unlogged";
  if (day.amount !== null && day.amount > threshold) return "above";
  if (day.status === "complete") return "within";
  return "incomplete";
}

function referenceDescriptor(reference: NutrientReference) {
  if (reference.type === "personal-goal") return "your personal goal";
  return `the ${reference.label.toLowerCase()}`;
}

function upperLimitReasonLabel(reason: string | null) {
  if (reason === "no-established-upper-limit") return "No established upper limit is available for this nutrient.";
  if (reason === "missing-applicability-data") return "A published upper limit exists, but this log does not yet record the population, source, form, or unit details needed to apply it.";
  return "No upper-limit reference is configured for this nutrient.";
}

function requirementLabel(requirement: string) {
  if (requirement === "population") return "population";
  if (requirement === "source") return "food versus supplement source";
  if (requirement === "form") return "nutrient form";
  return "reference unit";
}

function upperLimitReasonText(key: NutrientKey, upperLimit: NutritionAttentionNutrientFact["excess"]["upperLimit"]) {
  if (key === "vitaminB6Mg" && upperLimit.reason === "missing-applicability-data") {
    return "Available after confirming the U.S. adult 19+ profile; medical treatment doses are excluded.";
  }
  if (upperLimit.reason === "missing-applicability-data" && upperLimit.missingRequirements.length > 0) {
    return `${upperLimit.definition?.label ?? "Published upper limit"} needs ${upperLimit.missingRequirements.map(requirementLabel).join(", ")}.`;
  }
  return upperLimitReasonLabel(upperLimit.reason);
}

function dayStatusLabel(status: NutritionAttentionDayFact["status"]) {
  if (status === "complete") return "included in mean";
  if (status === "partial") return "excluded · partial values";
  if (status === "unknown") return "excluded · no usable value";
  return "unlogged · no record";
}

function dayStatusDescription(day: NutritionAttentionDayFact, key: NutrientKey, reference: NutrientReference | null) {
  if (day.status === "unlogged") return `${formatDate(day.date)}: no food log; excluded from the mean`;
  if (day.status === "unknown") return `${formatDate(day.date)}: logged, but no usable ${nutrientMeta(key).label.toLowerCase()} value; excluded from the mean`;
  if (day.status === "partial") return `${formatDate(day.date)}: ${formatAmount(day.amount, key)} known across ${day.knownItemCount} of ${day.totalItemCount} items; excluded from the mean`;
  return `${formatDate(day.date)}: ${formatAmount(day.amount, key)}; included in the mean${reference ? ` against ${formatAmount(reference.value, key)} reference` : ""}`;
}

function statusDescription(day: NutritionAttentionDayFact, key: NutrientKey, threshold: number, unit?: string) {
  if (day.status === "unlogged") return `${formatDate(day.date)}: no records`;
  if (day.amount !== null && day.amount > threshold) return `${formatDate(day.date)}: ${formatAmount(day.amount, key, unit)}, above ${formatAmount(threshold, key, unit)}`;
  if (day.status === "partial" || day.status === "unknown") return `${formatDate(day.date)}: ${formatAmount(day.amount, key, unit)}, incomplete item data`;
  return `${formatDate(day.date)}: ${formatAmount(day.amount, key, unit)}, within ${formatAmount(threshold, key, unit)}`;
}

type InspectEntry = NutritionAttentionProps["onInspectEntry"];
type UpperLimit = NutritionAttentionNutrientFact["excess"]["upperLimit"];
type SourceRow = ReturnType<typeof sourceRows>[number];

function blockHeading({ eyebrow, title, titleId }: { eyebrow: string; title: string; titleId: string }) {
  return h("div", null, h("p", { class: "eyebrow" }, eyebrow), h("h3", { id: titleId }, title));
}

function emptyState(title: string, detail: string) {
  return h("div", { class: "nutrition-attention__empty", role: "status" }, h("strong", null, title), h("span", null, detail));
}

function referenceDetails({ reference, nutrient }: { reference: NutrientReference; nutrient: NutrientKey }) {
  return h("details", { class: "nutrition-attention__reference-details" },
    h("summary", null, "Reference details"),
    h("p", null, h("strong", null, reference.label), ` · ${formatAmount(reference.value, nutrient, reference.unit)} · ${reference.authority}`),
    h("p", null, reference.type === "personal-goal"
      ? "This is the personal maximum or minimum selected in your settings."
      : reference.type === "upper-limit"
        ? "This is a published tolerable upper intake level. It only applies to the stated population, source scope, and nutrient form."
        : "This is a labelled intake reference or reduction guideline. It is not a diagnosis or a toxicity threshold."),
    h("p", null, `Applies to: ${reference.population ?? "unspecified population"} · ${reference.sourceScope.replaceAll("-", " ")}${reference.formScope ? ` · ${reference.formScope}` : ""}${reference.referenceVersion ? ` · ${reference.referenceVersion}` : ""}`),
    reference.sourceUrl ? h("a", { href: reference.sourceUrl, target: "_blank", rel: "noreferrer" }, "Open source") : null,
  );
}

function unsupportedUpperLimitDetails(entries: readonly { key: NutrientKey; upperLimit: UpperLimit }[]) {
  return h("details", { class: "nutrition-attention__reference-details" },
    h("summary", null, "Why some nutrients have no upper-limit alert"),
    h("p", null, "This view only compares nutrients with an explicitly configured guideline, personal maximum, or supported upper limit. A recommendation alone is not an upper limit."),
    entries.length > 0
      ? h("ul", { class: "nutrition-attention__upper-limit-list" }, entries.map(({ key, upperLimit }) => h("li", null,
        h("strong", null, `${nutrientMeta(key).label} · upper-limit status`),
        h("span", null, upperLimitReasonText(key, upperLimit)),
      )))
      : h("p", null, "Other tracked nutrients remain descriptive until a reference with the right population, source, form, and unit scope is available."),
  );
}

function inspectEntryAction({ entry, currentDate, onInspectEntry }: { entry: MissingEntry | InsightEntry; currentDate: string; onInspectEntry: InspectEntry }) {
  // Owner mode can fetch an older entry from the history endpoint; public mode
  // leaves this callback unset, so missing-entry rows stay read-only there.
  if (!onInspectEntry || entry.date > currentDate) return null;
  return h("button", { type: "button", class: "nutrition-attention__inspect-entry", onclick: () => onInspectEntry(entry.id, entry.date) }, "Inspect entry");
}

function missingList({ entries, limit, currentDate, onInspectEntry }: { entries: MissingEntry[]; limit: number; currentDate: string; onInspectEntry: InspectEntry }) {
  return h("ul", { class: "nutrition-attention__missing-list" }, entries.slice(0, limit).map((entry) => h("li", null,
    h("span", null, formatDate(entry.date)),
    h("strong", null, entry.names.join(", ")),
    inspectEntryAction({ entry, currentDate, onInspectEntry }),
  )));
}

export function createNutritionAttention(): Component<NutritionAttentionProps> {
  let range: AttentionRange = 14;
  let selectedShortfall: NutrientKey | null = null;
  let selectedShortfallDate: string | null = null;
  let selectedExcessOption = "sodiumMg:guideline";
  let selectedExcessDate: string | null = null;
  let expandedSource: string | null = null;
  let showAllCoverage = false;
  let showAllShortfalls = false;
  const attention = memo((
    days: InsightDay[], entries: InsightEntry[], currentDate: string, goals: NutrientGoalMap,
    windowDays: AttentionRange, referenceSettings: NutrientUpperLimitApplicabilityOptions | undefined,
  ) => getNutritionAttention({ days, entries, currentDate, goals, windowDays, referenceSettings }));
  const coverageRows = memo(coverageRowsFor);

  const panel = component<NutritionAttentionProps>(
    h("section", { class: "panel nutrition-attention", "aria-labelledby": "nutrition-attention-title" }),
    ({ days, entries, currentDate, goals, onInspectEntry, onSelectFoodChange, referenceSettings }) => {
      const model = attention(days, entries, currentDate, goals, range, referenceSettings);
      const coverage = coverageRows(model, entries);
      const allShortfallFindings = model.findings.filter((finding) => finding.kind === "shortfall");
      const shortfallFindings = showAllShortfalls ? allShortfallFindings : allShortfallFindings.slice(0, 3);
      const selectedShortfallData = selectedShortfall ? model.nutrients[selectedShortfall]?.shortfall ?? null : null;
      const selectedShortfallFact = selectedShortfall ? model.nutrients[selectedShortfall] ?? null : null;
      const shortfallDays = selectedShortfallFact?.days ?? [];
      const selectedShortfallDay = shortfallDays.find((day) => day.date === selectedShortfallDate)
        ?? [...shortfallDays].reverse().find((day) => day.status !== "unlogged")
        ?? shortfallDays.at(-1)
        ?? null;
      const shortfallSources = sourceRows(entries, selectedShortfall ?? "fiberG", selectedShortfallDay?.date ?? null);
      const excessOptions = nutrientKeys.flatMap((key): ExcessComparison[] => {
        const fact = model.nutrients[key];
        const options: ExcessComparison[] = [];
        if (fact.excess.reference) options.push({ key, kind: "guideline", fact, summary: fact.excess, reference: fact.excess.reference });
        if (fact.excess.upperLimit.reference) options.push({ key, kind: "upper-limit", fact, summary: fact.excess.upperLimit, reference: fact.excess.upperLimit.reference });
        return options;
      });
      const preferredExcessOption = excessOptions.find((option) => option.key === "sodiumMg" && option.kind === "guideline") ?? excessOptions.find((option) => EXCESS_KEYS.includes(option.key)) ?? excessOptions[0] ?? null;
      const selectedExcessComparison = excessOptions.find((option) => `${option.key}:${option.kind}` === selectedExcessOption) ?? preferredExcessOption;
      const excess = selectedExcessComparison?.summary ?? null;
      const excessKey = selectedExcessComparison?.key ?? "sodiumMg";
      const excessDataKey = selectedExcessComparison?.kind === "upper-limit" ? selectedExcessComparison.fact.excess.upperLimit.dataKey : excessKey;
      const excessAmountLabel = excessDataKey === excessKey
        ? nutrientMeta(excessKey).label
        : NUTRIENT_UPPER_LIMIT_META.find((entry) => entry.key === excessDataKey)?.label ?? nutrientMeta(excessKey).label;
      const excessDays = excess?.dayClassifications.filter((day) => day.status !== "unlogged") ?? [];
      const selectedExcessDay = excessDays.find((day) => day.date === selectedExcessDate) ?? excessDays.at(-1) ?? null;
      const sources = sourceRows(entries, excessDataKey, selectedExcessDay?.date ?? null);
      const loggedDays = days.filter((day) => day.date >= model.startDate && day.date <= model.endDate && day.mealCount > 0).length;
      const attentionCoverage = coverage.filter((row) => row.state !== "complete" || row.missingEntries.length > 0);
      const defaultCoverage = attentionCoverage.slice(0, 8);
      const visibleCoverage = showAllCoverage ? coverage : defaultCoverage;
      const canToggleCoverage = coverage.length > defaultCoverage.length;
      const hiddenCoverageCount = coverage.length - defaultCoverage.length;
      const unsupportedUpperLimits = nutrientKeys
        .map((key) => ({ key, upperLimit: model.nutrients[key].excess.upperLimit }))
        .filter(({ upperLimit }) => upperLimit.reason === "missing-applicability-data" || upperLimit.reason === "no-established-upper-limit");
      const shortfallDetailId = (nutrient: NutrientKey) => `nutrition-attention-shortfall-detail-${nutrient}`;
      const excessUnit = excess?.reference?.unit;
      const excessThreshold = excess?.reference?.value ?? 0;

      /** One food that supplied the nutrient on the selected day. It opens to show where the value came from. */
      function sourceItem({ source, id, amountText, share, origin }: { source: SourceRow; id: string; amountText: string; share: number | null; origin: string | null }) {
        const open = expandedSource === id;
        const quantity = source.item.quantity != null ? `${source.item.quantity}${source.item.unit ? ` ${source.item.unit} · ` : " · "}` : "";
        return h("li", null,
          h("button", { type: "button", "aria-expanded": open, onclick: () => { expandedSource = open ? null : id; panel.rerender(); } },
            h("span", null, source.item.name),
            h("strong", null, amountText, share !== null ? h("small", null, ` · ${share}%`) : null),
          ),
          open ? h("small", null, `${formatDate(source.entry.date)} · ${quantity}${source.item.calories.toLocaleString("en-US")} kcal · recorded item${origin ? ` · value origin: ${origin}` : ""}`) : null,
          inspectEntryAction({ entry: source.entry, currentDate, onInspectEntry }),
        );
      }

      return [
        h("div", { class: "nutrition-attention__heading" },
          h("div", null,
            h("p", { class: "eyebrow" }, "Recorded diet signals"),
            h("h2", { id: "nutrition-attention-title" }, "Nutrition attention"),
            h("p", { class: "nutrition-attention__intro" }, "Look for persistent gaps, repeated high days, and the missing values that limit what your log can tell you."),
          ),
          h("div", { class: "nutrition-attention__controls", "aria-label": "Nutrition attention range" },
            h("span", null, "Window"),
            ([14, 28] as const).map((value) => h("button", {
              type: "button",
              class: range === value ? "is-active" : "",
              "aria-pressed": range === value,
              onclick: () => { range = value; panel.rerender(); },
            }, `${value} days`)),
          ),
        ),

        h("p", { class: "nutrition-attention__coverage-line" }, `${formatRange(model.startDate, model.endDate)} · ${loggedDays} of ${model.windowDays} days have logs · current day excluded`),

        h("div", { class: "nutrition-attention__grid" },
          h("section", { class: "nutrition-attention__block", "aria-labelledby": "nutrition-shortfalls-title" },
            h("div", { class: "nutrition-attention__block-heading" },
              blockHeading({ eyebrow: "Needs a closer look", title: "Persistent shortfalls", titleId: "nutrition-shortfalls-title" }),
              h("span", { class: "panel-meta" }, "minimum references"),
            ),
            h("p", { class: "nutrition-attention__hint" }, "Ranked from complete logged days. A low recorded amount is a reason to inspect the pattern, not a diagnosis."),
            shortfallFindings.length === 0
              ? emptyState("No persistent shortfalls yet", `Complete nutrient values across at least ${model.minimumEligibleDays} logged days, with two eligible weeks below a reference, are needed for this finding.`)
              : h("div", { class: "nutrition-attention__findings" }, shortfallFindings.map((finding, index) => {
                const fact = model.nutrients[finding.nutrient];
                const shortfall = fact.shortfall;
                const meta = nutrientMeta(finding.nutrient);
                const open = selectedShortfall === finding.nutrient;
                const percent = shortfall.meanPercent ?? 0;
                const missingEntries = coverage.find((row) => row.key === finding.nutrient)?.missingEntries ?? [];
                return h("div", { key: finding.nutrient, class: `nutrition-finding ${open ? "is-selected" : ""}` },
                  h("button", {
                    type: "button",
                    class: "nutrition-finding__button",
                    "aria-expanded": open,
                    "aria-controls": shortfallDetailId(finding.nutrient),
                    onclick: () => {
                      selectedShortfall = open ? null : finding.nutrient;
                      selectedShortfallDate = null;
                      panel.rerender();
                    },
                  },
                    h("span", { class: "nutrition-finding__rank" }, index + 1),
                    h("span", { class: "nutrition-finding__main" },
                      h("span", { class: "nutrition-finding__label" }, h("strong", null, meta.label), h("small", null, `${finding.weeksBelowReference} eligible weeks below reference · ${shortfall.eligibleDays} complete days`)),
                      h("span", { class: "nutrition-finding__bar", role: "progressbar", "aria-label": `${meta.label}: ${Math.round(percent)}% of reference`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.min(100, Math.round(percent)) },
                        h("span", { style: { width: `${Math.min(100, Math.max(0, percent))}%` } }),
                        h("i", { "aria-hidden": "true" }),
                      ),
                    ),
                    h("span", { class: "nutrition-finding__value" }, formatAmount(shortfall.mean, finding.nutrient), h("small", null, `${Math.round(percent)}% of ${formatAmount(finding.reference.value, finding.nutrient)}`)),
                  ),
                  open && selectedShortfallData ? h("div", { class: "nutrition-finding__detail", id: shortfallDetailId(finding.nutrient), "aria-live": "polite" },
                    h("p", null, h("strong", null, meta.label), ` averaged ${formatAmount(selectedShortfallData.mean, finding.nutrient)} across ${selectedShortfallData.eligibleDays} complete logged days. That is ${shortfallTrendLabel(fact)} across the selected window.`),
                    h("p", { class: "nutrition-attention__fine-print" }, `Coverage: ${fact.coverage.completeDays} complete days, ${fact.coverage.partialDays} partial days, ${fact.coverage.unknownLoggedDays} logged days with no usable value, and ${fact.coverage.unloggedDays} unlogged days. The mean excludes every day without complete item values.`),
                    selectedShortfallData.reference ? referenceDetails({ reference: selectedShortfallData.reference, nutrient: finding.nutrient }) : null,
                    onSelectFoodChange ? h("button", { type: "button", class: "nutrition-attention__compare", onclick: () => onSelectFoodChange(finding.nutrient) }, `Compare a food change for ${meta.label}`) : null,
                    h("div", { class: "nutrition-attention__daily-heading" },
                      h("div", null, h("strong", null, "Daily recorded values"), h("span", null, "Complete days enter the mean; partial, unknown, and unlogged dates stay visible as exclusions.")),
                      h("span", null, `${selectedShortfallData.eligibleDays} of ${model.windowDays} dates included`),
                    ),
                    h("div", { class: "nutrition-attention__daily-list", "aria-label": `${meta.label} daily recorded values` },
                      [...shortfallDays].reverse().map((day) => {
                        const selected = selectedShortfallDay?.date === day.date;
                        const percentOfReference = day.amount !== null && selectedShortfallData.reference
                          ? day.amount / selectedShortfallData.reference.value * 100
                          : null;
                        return h("button", {
                          type: "button",
                          class: cx("nutrition-attention__daily-row", `is-${day.status}`, selected && "is-selected"),
                          "aria-label": dayStatusDescription(day, finding.nutrient, selectedShortfallData.reference),
                          "aria-pressed": selected,
                          onclick: () => { selectedShortfallDate = day.date; panel.rerender(); },
                        },
                          h("span", { class: "nutrition-attention__daily-date" }, formatDate(day.date)),
                          h("span", { class: "nutrition-attention__daily-bar" }, h("i", { style: { width: `${percentOfReference === null ? 0 : Math.min(100, Math.max(4, percentOfReference))}%` } })),
                          h("strong", null, formatAmount(day.amount, finding.nutrient)),
                          h("small", null, dayStatusLabel(day.status)),
                        );
                      }),
                    ),
                    selectedShortfallDay ? h("div", { class: "nutrition-attention__day-detail" },
                      h("div", { class: "nutrition-source-detail__heading" },
                        h("div", null, h("p", { class: "eyebrow" }, "Selected day"), h("h4", null, formatDate(selectedShortfallDay.date))),
                        h("span", null, `${selectedShortfallDay.knownItemCount} of ${selectedShortfallDay.totalItemCount} item values present`),
                      ),
                      h("p", { class: "nutrition-attention__fine-print" }, dayStatusDescription(selectedShortfallDay, finding.nutrient, selectedShortfallData.reference)),
                      shortfallSources.length === 0
                        ? h("p", { class: "nutrition-attention__fine-print" }, `No known ${meta.label.toLowerCase()} contributions are available for this day.`)
                        : h("ul", { class: "nutrition-source-list" }, shortfallSources.map((source) => sourceItem({
                          source,
                          id: `shortfall-${source.entry.id}-${source.index}`,
                          amountText: formatAmount(source.value, finding.nutrient),
                          share: selectedShortfallDay.amount ? Math.round(source.value / selectedShortfallDay.amount * 100) : null,
                          origin: explicitNutrientOrigin(source.item, finding.nutrient),
                        }))),
                    ) : null,
                    missingEntries.length ? h("details", null,
                      h("summary", null, `${missingEntries.length} entries missing ${meta.label} values`),
                      missingList({ entries: missingEntries, limit: 6, currentDate, onInspectEntry }),
                    ) : null,
                  ) : null,
                );
              })),
            allShortfallFindings.length > 3 ? h("button", { type: "button", class: "nutrition-attention__show-all", onclick: () => { showAllShortfalls = !showAllShortfalls; panel.rerender(); } }, showAllShortfalls ? "Show top 3 shortfalls" : `Show all ${allShortfallFindings.length} shortfalls`) : null,
          ),

          h("section", { class: "nutrition-attention__block nutrition-attention__excess", "aria-labelledby": "nutrition-excess-title" },
            h("div", { class: "nutrition-attention__block-heading" },
              blockHeading({ eyebrow: "Repeated high days", title: "Recorded excess", titleId: "nutrition-excess-title" }),
              h("label", { class: "nutrition-attention__select-label" }, "Comparison", h("select", {
                value: selectedExcessComparison ? `${selectedExcessComparison.key}:${selectedExcessComparison.kind}` : "",
                onchange: (event: Event) => {
                  selectedExcessOption = (event.target as HTMLSelectElement).value;
                  selectedExcessDate = null;
                  panel.rerender();
                },
                "aria-label": "Select excess nutrient",
              }, excessOptions.map((option) => h("option", { value: `${option.key}:${option.kind}` }, `${nutrientMeta(option.key).label} · ${option.kind === "upper-limit" ? "upper limit" : option.reference.label.toLowerCase()}`)))),
            ),
            !excess ? [
              emptyState("No excess thresholds configured", "Sodium and saturated fat comparisons will appear when their goals are enabled."),
              unsupportedUpperLimitDetails(unsupportedUpperLimits),
            ] : [
              h("p", { class: "nutrition-attention__hint" }, `Finished days above ${referenceDescriptor(excess.reference!)} are shown individually. A partial day above the threshold still counts as an observed crossing; an incomplete day at or below it stays indeterminate.`),
              excess.reference ? referenceDetails({ reference: excess.reference, nutrient: excessKey }) : null,
              unsupportedUpperLimitDetails(unsupportedUpperLimits),
              h("div", { class: "nutrition-excess-summary" },
                h("div", null, h("span", null, "High days"), h("strong", null, `${excess.observedAboveDays} of ${excess.observedDays} observed days above ${formatAmount(excess.reference?.value ?? null, excessKey, excessUnit)}`)),
                h("div", null, h("span", null, "Mean recorded"), h("strong", null, formatAmount(excess.averageKnown, excessKey, excessUnit)), h("small", null, `across ${excess.observedDays} observed days`)),
                h("div", null, h("span", null, "Maximum recorded"), h("strong", null, formatAmount(excess.maximumRecorded, excessKey, excessUnit)), h("small", null, "individual day")),
              ),
              excess.indeterminateDays > 0 || excess.unloggedDays > 0 ? h("p", { class: "nutrition-attention__fine-print" }, `${excess.indeterminateDays} logged day${excess.indeterminateDays === 1 ? " has" : "s have"} incomplete data · ${excess.unloggedDays} unlogged day${excess.unloggedDays === 1 ? " is" : "s are"} unobserved. Neither group is counted as compliant.`) : null,
              h("div", { class: `nutrition-current-observation ${excess.current.aboveReference === true ? "is-above" : ""}`, role: "status" },
                h("span", null, h("strong", null, "Current day"), " · still in progress"),
                h("strong", null, excess.current.status === "unlogged"
                  ? "No record yet"
                  : excess.current.status === "unknown"
                    ? `No ${excessAmountLabel.toLowerCase()} value recorded yet`
                    : excess.current.aboveReference === true
                      ? `${formatAmount(excess.current.amount, excessKey, excessUnit)} already above ${referenceDescriptor(excess.reference!)}`
                      : excess.current.status === "complete"
                        ? `${formatAmount(excess.current.amount, excessKey, excessUnit)} recorded so far`
                        : `${formatAmount(excess.current.amount, excessKey, excessUnit)} recorded so far · incomplete data`),
              ),
              excessDays.length === 0
                ? emptyState("No logged days in this window", "High day detail will appear once food has been recorded.")
                : h("div", { class: "nutrition-excess-days", "aria-label": `${nutrientMeta(excessKey).label} daily detail` }, excessDays.map((day) => {
                  const dayStatus = excessDayStatus(day, excessThreshold);
                  const selected = selectedExcessDay?.date === day.date;
                  return h("button", {
                    key: day.date,
                    type: "button",
                    class: cx("nutrition-excess-day", `is-${dayStatus}`, selected && "is-selected"),
                    "aria-pressed": selected,
                    "aria-label": statusDescription(day, excessKey, excessThreshold, excessUnit),
                    onclick: () => { selectedExcessDate = day.date; panel.rerender(); },
                  },
                    h("span", { class: "nutrition-excess-day__date" }, formatDate(day.date)),
                    h("span", { class: "nutrition-excess-day__bar" }, h("i", { style: { width: `${day.amount === null || !excess.reference ? 0 : Math.min(100, Math.max(4, (day.amount / excess.reference.value) * 100))}%` } })),
                    h("strong", null, formatAmount(day.amount, excessKey, excessUnit)),
                    h("small", null, dayStatus === "above" ? "above" : dayStatus === "within" ? "within" : "incomplete"),
                  );
                })),
              selectedExcessDay ? h("div", { class: "nutrition-source-detail", "aria-live": "polite" },
                h("div", { class: "nutrition-source-detail__heading" },
                  h("div", null, h("p", { class: "eyebrow" }, "Source drilldown"), h("h4", null, formatDate(selectedExcessDay.date))),
                  h("span", null, `${formatAmount(selectedExcessDay.amount, excessKey, excessUnit)} recorded · ${selectedExcessDay.knownItemCount} of ${selectedExcessDay.totalItemCount} item values present`),
                ),
                h("p", { class: "nutrition-attention__fine-print" }, `${statusDescription(selectedExcessDay, excessKey, excessThreshold, excessUnit)}. Known contributions below are shares of the recorded amount for this day.`),
                sources.length === 0
                  ? h("p", { class: "nutrition-attention__fine-print" }, `No known ${excessAmountLabel.toLowerCase()} contributions are available for this day.`)
                  : h("ul", { class: "nutrition-source-list" }, sources.map((source) => sourceItem({
                    source,
                    id: `${source.entry.id}-${source.index}`,
                    amountText: formatAmount(source.value, excessKey, excessUnit),
                    share: selectedExcessDay.amount ? Math.round(source.value / selectedExcessDay.amount * 100) : null,
                    origin: excessDataKey === excessKey ? explicitNutrientOrigin(source.item, excessKey) : null,
                  }))),
              ) : null,
            ],
          ),
        ),

        h("section", { class: "nutrition-attention__coverage", "aria-labelledby": "nutrition-coverage-title" },
          h("div", { class: "nutrition-attention__block-heading" },
            blockHeading({ eyebrow: "Trust the context", title: "Data coverage", titleId: "nutrition-coverage-title" }),
            h("span", { class: "panel-meta" }, "logged items only"),
          ),
          h("p", { class: "nutrition-attention__hint" }, "Complete means every logged item has a value for that nutrient. It does not confirm that every meal was recorded or that an estimate is accurate."),
          h("details", { class: "nutrition-attention__coverage-help" },
            h("summary", null, "How to read coverage and provenance"),
            h("p", null, h("strong", null, "Logged day"), " means at least one item was recorded. ", h("strong", null, "Complete"), " means every loaded item has a value for the nutrient. ", h("strong", null, "Partial"), " means only some item values are present, and ", h("strong", null, "unknown"), " means the day is logged but no usable value is available. Unlogged days remain unobserved rather than zero."),
            h("p", null, "When available, the explicit nutrientProvenance field identifies whether a value came from a label, database, manual estimate, or AI estimate; it appears in the selected item detail. Generic item source labels are not treated as nutrient provenance. Populated fields are therefore recorded values, not verified measurements."),
          ),
          visibleCoverage.length === 0
            ? emptyState("No coverage issues in this window", "All logged nutrient fields are populated.")
            : h("div", { class: "nutrition-coverage-list" }, visibleCoverage.map((row) => h("details", { key: row.key, class: `nutrition-coverage-row is-${row.state}` },
              h("summary", null,
                h("span", { class: "nutrition-coverage-row__name" }, h("strong", null, nutrientMeta(row.key).label), h("small", null, coverageDescription(row))),
                h("span", { class: "nutrition-coverage-row__state" }, stateLabel(row.state)),
              ),
              h("div", { class: "nutrition-coverage-row__detail" },
                h("p", null, `${row.completeDays} complete · ${row.partialDays} partial · ${row.unknownLoggedDays} logged with no usable value · ${row.unloggedDays} unlogged in the ${model.windowDays}-day window.`),
                h("p", null, `${row.totalItems > 0 ? `${row.knownItems} of ${row.totalItems} item values are present.` : "No item-level nutrient details are available for this window."} These counts describe fields, not the share of nutrient intake captured.`),
                row.missingEntries.length > 0 ? [
                  h("p", null, `${row.missingEntries.length} logged entr${row.missingEntries.length === 1 ? "y is" : "ies are"} missing a ${nutrientMeta(row.key).label} value:`),
                  missingList({ entries: row.missingEntries, limit: 8, currentDate, onInspectEntry }),
                ] : h("p", null, "No individual missing entries were found in the loaded history."),
              ),
            ))),
          canToggleCoverage ? h("button", { type: "button", class: "nutrition-attention__show-all", onclick: () => { showAllCoverage = !showAllCoverage; panel.rerender(); } }, showAllCoverage ? "Show coverage needing attention" : `Show all coverage (${hiddenCoverageCount} more)`) : null,
        ),

        h("p", { class: "nutrition-attention__note" }, "These comparisons describe recorded intake and current goals. They do not measure nutrient status in the body or establish deficiency, toxicity, or medical risk."),
      ];
    },
  );
  return panel;
}
