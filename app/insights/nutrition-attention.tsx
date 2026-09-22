"use client";

import { useMemo, useState } from "react";
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
} from "./nutrition-attention-calculations";
import type { InsightDay, InsightEntry } from "./types";

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

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
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
  if (reference.type === "guideline") return `the ${reference.label.toLowerCase()}`;
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

function ReferenceDetails({ reference, nutrient }: { reference: NutrientReference; nutrient: NutrientKey }) {
  return <details className="nutrition-attention__reference-details">
    <summary>Reference details</summary>
    <p><strong>{reference.label}</strong> · {formatAmount(reference.value, nutrient, reference.unit)} · {reference.authority}</p>
    {reference.type === "personal-goal" ? <p>This is the personal maximum or minimum selected in your settings.</p> : reference.type === "upper-limit" ? <p>This is a published tolerable upper intake level. It only applies to the stated population, source scope, and nutrient form.</p> : <p>This is a labelled intake reference or reduction guideline. It is not a diagnosis or a toxicity threshold.</p>}
    <p>Applies to: {reference.population ?? "unspecified population"} · {reference.sourceScope.replaceAll("-", " ")}{reference.formScope ? ` · ${reference.formScope}` : ""}{reference.referenceVersion ? ` · ${reference.referenceVersion}` : ""}</p>
    {reference.sourceUrl ? <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : null}
  </details>;
}

function UnsupportedUpperLimitDetails({ entries }: { entries: readonly { key: NutrientKey; upperLimit: NutritionAttentionNutrientFact["excess"]["upperLimit"] }[] }) {
  return <details className="nutrition-attention__reference-details">
    <summary>Why some nutrients have no upper-limit alert</summary>
    <p>This view only compares nutrients with an explicitly configured guideline, personal maximum, or supported upper limit. A recommendation alone is not an upper limit.</p>
    {entries.length > 0 ? <ul className="nutrition-attention__upper-limit-list">{entries.map(({ key, upperLimit }) => <li key={key}><strong>{nutrientMeta(key).label} · upper-limit status</strong><span>{upperLimitReasonText(key, upperLimit)}</span></li>)}</ul> : <p>Other tracked nutrients remain descriptive until a reference with the right population, source, form, and unit scope is available.</p>}
  </details>;
}

function InspectEntryAction({ entry, currentDate, onInspectEntry }: { entry: MissingEntry | InsightEntry; currentDate: string; onInspectEntry?: (entryId: string, date: string) => void }) {
  // Owner mode can fetch an older entry from the history endpoint; public mode
  // leaves this callback unset, so missing-entry rows stay read-only there.
  if (!onInspectEntry || entry.date > currentDate) return null;
  return <button type="button" className="nutrition-attention__inspect-entry" onClick={() => onInspectEntry(entry.id, entry.date)}>Inspect entry</button>;
}

function statusDescription(day: NutritionAttentionDayFact, key: NutrientKey, threshold: number, unit?: string) {
  if (day.status === "unlogged") return `${formatDate(day.date)}: no records`;
  if (day.amount !== null && day.amount > threshold) return `${formatDate(day.date)}: ${formatAmount(day.amount, key, unit)}, above ${formatAmount(threshold, key, unit)}`;
  if (day.status === "partial" || day.status === "unknown") return `${formatDate(day.date)}: ${formatAmount(day.amount, key, unit)}, incomplete item data`;
  return `${formatDate(day.date)}: ${formatAmount(day.amount, key, unit)}, within ${formatAmount(threshold, key, unit)}`;
}

export function NutritionAttention({ days, entries, currentDate, goals, onInspectEntry, onSelectFoodChange, referenceSettings }: NutritionAttentionProps) {
  const [range, setRange] = useState<AttentionRange>(14);
  const [selectedShortfall, setSelectedShortfall] = useState<NutrientKey | null>(null);
  const [selectedShortfallDate, setSelectedShortfallDate] = useState<string | null>(null);
  const [selectedExcessOption, setSelectedExcessOption] = useState("sodiumMg:guideline");
  const [selectedExcessDate, setSelectedExcessDate] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [showAllCoverage, setShowAllCoverage] = useState(false);
  const [showAllShortfalls, setShowAllShortfalls] = useState(false);
  const model = useMemo(() => getNutritionAttention({ days, entries, currentDate, goals, windowDays: range, referenceSettings }), [days, entries, currentDate, goals, range, referenceSettings]);
  const coverage = useMemo(() => coverageRowsFor(model, entries), [model, entries]);
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
  const visibleCoverage = showAllCoverage
    ? coverage
    : defaultCoverage;
  const canToggleCoverage = coverage.length > defaultCoverage.length;
  const hiddenCoverageCount = coverage.length - defaultCoverage.length;
  const unsupportedUpperLimits = nutrientKeys
    .map((key) => ({ key, upperLimit: model.nutrients[key].excess.upperLimit }))
    .filter(({ upperLimit }) => upperLimit.reason === "missing-applicability-data" || upperLimit.reason === "no-established-upper-limit");
  const shortfallDetailId = (nutrient: NutrientKey) => `nutrition-attention-shortfall-detail-${nutrient}`;

  return <section className="panel nutrition-attention" aria-labelledby="nutrition-attention-title">
    <div className="nutrition-attention__heading">
      <div>
        <p className="eyebrow">Recorded diet signals</p>
        <h2 id="nutrition-attention-title">Nutrition attention</h2>
        <p className="nutrition-attention__intro">Look for persistent gaps, repeated high days, and the missing values that limit what your log can tell you.</p>
      </div>
      <div className="nutrition-attention__controls" aria-label="Nutrition attention range">
        <span>Window</span>
        {([14, 28] as const).map((value) => <button
          key={value}
          type="button"
          className={range === value ? "is-active" : ""}
          aria-pressed={range === value}
          onClick={() => setRange(value)}
        >{value} days</button>)}
      </div>
    </div>

    <p className="nutrition-attention__coverage-line">{formatRange(model.startDate, model.endDate)} · {loggedDays} of {model.windowDays} days have logs · current day excluded</p>

    <div className="nutrition-attention__grid">
      <section className="nutrition-attention__block" aria-labelledby="nutrition-shortfalls-title">
        <div className="nutrition-attention__block-heading">
          <div><p className="eyebrow">Needs a closer look</p><h3 id="nutrition-shortfalls-title">Persistent shortfalls</h3></div>
          <span className="panel-meta">minimum references</span>
        </div>
        <p className="nutrition-attention__hint">Ranked from complete logged days. A low recorded amount is a reason to inspect the pattern, not a diagnosis.</p>
        {shortfallFindings.length === 0 ? <div className="nutrition-attention__empty" role="status">
          <strong>No persistent shortfalls yet</strong>
          <span>Complete nutrient values across at least {model.minimumEligibleDays} logged days, with two eligible weeks below a reference, are needed for this finding.</span>
        </div> : <div className="nutrition-attention__findings">
          {shortfallFindings.map((finding, index) => {
            const fact = model.nutrients[finding.nutrient];
            const shortfall = fact.shortfall;
            const meta = nutrientMeta(finding.nutrient);
            const open = selectedShortfall === finding.nutrient;
            const percent = shortfall.meanPercent ?? 0;
            return <div className={`nutrition-finding ${open ? "is-selected" : ""}`} key={finding.nutrient}>
              <button
                type="button"
                className="nutrition-finding__button"
                aria-expanded={open}
                aria-controls={shortfallDetailId(finding.nutrient)}
                onClick={() => {
                  setSelectedShortfall(open ? null : finding.nutrient);
                  setSelectedShortfallDate(null);
                }}
              >
                <span className="nutrition-finding__rank">{index + 1}</span>
                <span className="nutrition-finding__main">
                  <span className="nutrition-finding__label"><strong>{meta.label}</strong><small>{finding.weeksBelowReference} eligible weeks below reference · {shortfall.eligibleDays} complete days</small></span>
                  <span className="nutrition-finding__bar" role="progressbar" aria-label={`${meta.label}: ${Math.round(percent)}% of reference`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(percent))}>
                    <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                    <i aria-hidden="true" />
                  </span>
                </span>
                <span className="nutrition-finding__value">{formatAmount(shortfall.mean, finding.nutrient)}<small>{Math.round(percent)}% of {formatAmount(finding.reference.value, finding.nutrient)}</small></span>
              </button>
              {open && selectedShortfallData ? <div className="nutrition-finding__detail" id={shortfallDetailId(finding.nutrient)} aria-live="polite">
                <p><strong>{meta.label}</strong> averaged {formatAmount(selectedShortfallData.mean, finding.nutrient)} across {selectedShortfallData.eligibleDays} complete logged days. That is {shortfallTrendLabel(fact)} across the selected window.</p>
                <p className="nutrition-attention__fine-print">Coverage: {fact.coverage.completeDays} complete days, {fact.coverage.partialDays} partial days, {fact.coverage.unknownLoggedDays} logged days with no usable value, and {fact.coverage.unloggedDays} unlogged days. The mean excludes every day without complete item values.</p>
                {selectedShortfallData.reference ? <ReferenceDetails reference={selectedShortfallData.reference} nutrient={finding.nutrient} /> : null}
                {onSelectFoodChange ? <button type="button" className="nutrition-attention__compare" onClick={() => onSelectFoodChange(finding.nutrient)}>Compare a food change for {meta.label}</button> : null}
                <div className="nutrition-attention__daily-heading"><div><strong>Daily recorded values</strong><span>Complete days enter the mean; partial, unknown, and unlogged dates stay visible as exclusions.</span></div><span>{selectedShortfallData.eligibleDays} of {model.windowDays} dates included</span></div>
                <div className="nutrition-attention__daily-list" aria-label={`${meta.label} daily recorded values`}>
                  {[...shortfallDays].reverse().map((day) => {
                    const selected = selectedShortfallDay?.date === day.date;
                    const percentOfReference = day.amount !== null && selectedShortfallData.reference
                      ? day.amount / selectedShortfallData.reference.value * 100
                      : null;
                    return <button
                      type="button"
                      key={day.date}
                      className={`nutrition-attention__daily-row is-${day.status}${selected ? " is-selected" : ""}`}
                      aria-label={dayStatusDescription(day, finding.nutrient, selectedShortfallData.reference)}
                      aria-pressed={selected}
                      onClick={() => setSelectedShortfallDate(day.date)}
                    >
                      <span className="nutrition-attention__daily-date">{formatDate(day.date)}</span>
                      <span className="nutrition-attention__daily-bar"><i style={{ width: `${percentOfReference === null ? 0 : Math.min(100, Math.max(4, percentOfReference))}%` }} /></span>
                      <strong>{formatAmount(day.amount, finding.nutrient)}</strong>
                      <small>{dayStatusLabel(day.status)}</small>
                    </button>;
                  })}
                </div>
                {selectedShortfallDay ? <div className="nutrition-attention__day-detail">
                  <div className="nutrition-source-detail__heading"><div><p className="eyebrow">Selected day</p><h4>{formatDate(selectedShortfallDay.date)}</h4></div><span>{selectedShortfallDay.knownItemCount} of {selectedShortfallDay.totalItemCount} item values present</span></div>
                  <p className="nutrition-attention__fine-print">{dayStatusDescription(selectedShortfallDay, finding.nutrient, selectedShortfallData.reference)}</p>
                  {shortfallSources.length === 0 ? <p className="nutrition-attention__fine-print">No known {meta.label.toLowerCase()} contributions are available for this day.</p> : <ul className="nutrition-source-list">{shortfallSources.map((source) => {
                    const id = `shortfall-${source.entry.id}-${source.index}`;
                    const openSource = expandedSource === id;
                    const dayAmount = selectedShortfallDay.amount;
                    const origin = explicitNutrientOrigin(source.item, finding.nutrient);
                    return <li key={id}><button type="button" aria-expanded={openSource} onClick={() => setExpandedSource(openSource ? null : id)}><span>{source.item.name}</span><strong>{formatAmount(source.value, finding.nutrient)}{dayAmount ? <small> · {Math.round(source.value / dayAmount * 100)}%</small> : null}</strong></button>{openSource ? <small>{formatDate(source.entry.date)} · {source.item.quantity != null ? `${source.item.quantity}${source.item.unit ? ` ${source.item.unit} · ` : " · "}` : ""}{source.item.calories.toLocaleString("en-US")} kcal · recorded item{origin ? ` · value origin: ${origin}` : ""}</small> : null}<InspectEntryAction entry={source.entry} currentDate={currentDate} onInspectEntry={onInspectEntry} /></li>;
                  })}</ul>}
                </div> : null}
                {coverage.find((row) => row.key === finding.nutrient)?.missingEntries.length ? <details>
                  <summary>{coverage.find((row) => row.key === finding.nutrient)?.missingEntries.length} entries missing {meta.label} values</summary>
                  <ul className="nutrition-attention__missing-list">{coverage.find((row) => row.key === finding.nutrient)?.missingEntries.slice(0, 6).map((entry) => <li key={entry.id}><span>{formatDate(entry.date)}</span><strong>{entry.names.join(", ")}</strong><InspectEntryAction entry={entry} currentDate={currentDate} onInspectEntry={onInspectEntry} /></li>)}</ul>
                </details> : null}
              </div> : null}
            </div>;
          })}
        </div>}
        {allShortfallFindings.length > 3 ? <button type="button" className="nutrition-attention__show-all" onClick={() => setShowAllShortfalls((shown) => !shown)}>{showAllShortfalls ? "Show top 3 shortfalls" : `Show all ${allShortfallFindings.length} shortfalls`}</button> : null}
      </section>

      <section className="nutrition-attention__block nutrition-attention__excess" aria-labelledby="nutrition-excess-title">
        <div className="nutrition-attention__block-heading">
          <div><p className="eyebrow">Repeated high days</p><h3 id="nutrition-excess-title">Recorded excess</h3></div>
          <label className="nutrition-attention__select-label">Comparison<select value={selectedExcessComparison ? `${selectedExcessComparison.key}:${selectedExcessComparison.kind}` : ""} onChange={(event) => { setSelectedExcessOption(event.target.value); setSelectedExcessDate(null); }} aria-label="Select excess nutrient">{excessOptions.map((option) => <option key={`${option.key}:${option.kind}`} value={`${option.key}:${option.kind}`}>{nutrientMeta(option.key).label} · {option.kind === "upper-limit" ? "upper limit" : option.reference.label.toLowerCase()}</option>)}</select></label>
        </div>
        {!excess ? <><div className="nutrition-attention__empty" role="status"><strong>No excess thresholds configured</strong><span>Sodium and saturated fat comparisons will appear when their goals are enabled.</span></div><UnsupportedUpperLimitDetails entries={unsupportedUpperLimits} /></> : <>
          <p className="nutrition-attention__hint">Finished days above {referenceDescriptor(excess.reference!)} are shown individually. A partial day above the threshold still counts as an observed crossing; an incomplete day at or below it stays indeterminate.</p>
          {excess.reference ? <ReferenceDetails reference={excess.reference} nutrient={excessKey} /> : null}
          <UnsupportedUpperLimitDetails entries={unsupportedUpperLimits} />
          <div className="nutrition-excess-summary">
            <div><span>High days</span><strong>{excess.observedAboveDays} of {excess.observedDays} observed days above {formatAmount(excess.reference?.value ?? null, excessKey, excess.reference?.unit)}</strong></div>
            <div><span>Mean recorded</span><strong>{formatAmount(excess.averageKnown, excessKey, excess.reference?.unit)}</strong><small>across {excess.observedDays} observed days</small></div>
            <div><span>Maximum recorded</span><strong>{formatAmount(excess.maximumRecorded, excessKey, excess.reference?.unit)}</strong><small>individual day</small></div>
          </div>
          {excess.indeterminateDays > 0 || excess.unloggedDays > 0 ? <p className="nutrition-attention__fine-print">{excess.indeterminateDays} logged day{excess.indeterminateDays === 1 ? " has" : "s have"} incomplete data · {excess.unloggedDays} unlogged day{excess.unloggedDays === 1 ? " is" : "s are"} unobserved. Neither group is counted as compliant.</p> : null}
          <div className={`nutrition-current-observation ${excess.current.aboveReference === true ? "is-above" : ""}`} role="status">
            <span><strong>Current day</strong> · still in progress</span>
            {excess.current.status === "unlogged" ? <strong>No record yet</strong> : excess.current.status === "unknown" ? <strong>No {excessAmountLabel.toLowerCase()} value recorded yet</strong> : excess.current.aboveReference === true ? <strong>{formatAmount(excess.current.amount, excessKey, excess.reference?.unit)} already above {referenceDescriptor(excess.reference!)}</strong> : excess.current.status === "complete" ? <strong>{formatAmount(excess.current.amount, excessKey, excess.reference?.unit)} recorded so far</strong> : <strong>{formatAmount(excess.current.amount, excessKey, excess.reference?.unit)} recorded so far · incomplete data</strong>}
          </div>
          {excessDays.length === 0 ? <div className="nutrition-attention__empty" role="status"><strong>No logged days in this window</strong><span>High day detail will appear once food has been recorded.</span></div> : <div className="nutrition-excess-days" aria-label={`${nutrientMeta(excessKey).label} daily detail`}>
            {excessDays.map((day) => {
              const dayStatus = excessDayStatus(day, excess.reference?.value ?? 0);
              return <button
              key={day.date}
              type="button"
              className={`nutrition-excess-day is-${dayStatus}${selectedExcessDay?.date === day.date ? " is-selected" : ""}`}
              aria-pressed={selectedExcessDay?.date === day.date}
              aria-label={statusDescription(day, excessKey, excess.reference?.value ?? 0, excess.reference?.unit)}
              onClick={() => setSelectedExcessDate(day.date)}
            >
              <span className="nutrition-excess-day__date">{formatDate(day.date)}</span>
              <span className="nutrition-excess-day__bar"><i style={{ width: `${day.amount === null || !excess.reference ? 0 : Math.min(100, Math.max(4, (day.amount / excess.reference.value) * 100))}%` }} /></span>
              <strong>{formatAmount(day.amount, excessKey, excess.reference?.unit)}</strong>
              <small>{dayStatus === "above" ? "above" : dayStatus === "within" ? "within" : "incomplete"}</small>
            </button>;
            })}
          </div>}
          {selectedExcessDay ? <div className="nutrition-source-detail" aria-live="polite">
            <div className="nutrition-source-detail__heading"><div><p className="eyebrow">Source drilldown</p><h4>{formatDate(selectedExcessDay.date)}</h4></div><span>{formatAmount(selectedExcessDay.amount, excessKey, excess.reference?.unit)} recorded · {selectedExcessDay.knownItemCount} of {selectedExcessDay.totalItemCount} item values present</span></div>
            <p className="nutrition-attention__fine-print">{statusDescription(selectedExcessDay, excessKey, excess.reference?.value ?? 0, excess.reference?.unit)}. Known contributions below are shares of the recorded amount for this day.</p>
            {sources.length === 0 ? <p className="nutrition-attention__fine-print">No known {excessAmountLabel.toLowerCase()} contributions are available for this day.</p> : <ul className="nutrition-source-list">{sources.map((source) => {
              const id = `${source.entry.id}-${source.index}`;
              const open = expandedSource === id;
              const origin = excessDataKey === excessKey ? explicitNutrientOrigin(source.item, excessKey) : null;
              return <li key={id}><button type="button" aria-expanded={open} onClick={() => setExpandedSource(open ? null : id)}><span>{source.item.name}</span><strong>{formatAmount(source.value, excessKey, excess.reference?.unit)}{selectedExcessDay.amount ? <small> · {Math.round(source.value / selectedExcessDay.amount * 100)}%</small> : null}</strong></button>{open ? <small>{formatDate(source.entry.date)} · {source.item.quantity != null ? `${source.item.quantity}${source.item.unit ? ` ${source.item.unit} · ` : " · "}` : ""}{source.item.calories.toLocaleString("en-US")} kcal · recorded item{origin ? ` · value origin: ${origin}` : ""}</small> : null}<InspectEntryAction entry={source.entry} currentDate={currentDate} onInspectEntry={onInspectEntry} /></li>;
            })}</ul>}
          </div> : null}
        </>}
      </section>
    </div>

    <section className="nutrition-attention__coverage" aria-labelledby="nutrition-coverage-title">
      <div className="nutrition-attention__block-heading"><div><p className="eyebrow">Trust the context</p><h3 id="nutrition-coverage-title">Data coverage</h3></div><span className="panel-meta">logged items only</span></div>
      <p className="nutrition-attention__hint">Complete means every logged item has a value for that nutrient. It does not confirm that every meal was recorded or that an estimate is accurate.</p>
      <details className="nutrition-attention__coverage-help">
        <summary>How to read coverage and provenance</summary>
        <p><strong>Logged day</strong> means at least one item was recorded. <strong>Complete</strong> means every loaded item has a value for the nutrient. <strong>Partial</strong> means only some item values are present, and <strong>unknown</strong> means the day is logged but no usable value is available. Unlogged days remain unobserved rather than zero.</p>
        <p>When available, the explicit nutrientProvenance field identifies whether a value came from a label, database, manual estimate, or AI estimate; it appears in the selected item detail. Generic item source labels are not treated as nutrient provenance. Populated fields are therefore recorded values, not verified measurements.</p>
      </details>
      {visibleCoverage.length === 0 ? <div className="nutrition-attention__empty" role="status"><strong>No coverage issues in this window</strong><span>All logged nutrient fields are populated.</span></div> : <div className="nutrition-coverage-list">{visibleCoverage.map((row) => <details className={`nutrition-coverage-row is-${row.state}`} key={row.key}>
        <summary><span className="nutrition-coverage-row__name"><strong>{nutrientMeta(row.key).label}</strong><small>{coverageDescription(row)}</small></span><span className="nutrition-coverage-row__state">{stateLabel(row.state)}</span></summary>
        <div className="nutrition-coverage-row__detail"><p>{row.completeDays} complete · {row.partialDays} partial · {row.unknownLoggedDays} logged with no usable value · {row.unloggedDays} unlogged in the {model.windowDays}-day window.</p><p>{row.totalItems > 0 ? `${row.knownItems} of ${row.totalItems} item values are present.` : "No item-level nutrient details are available for this window."} These counts describe fields, not the share of nutrient intake captured.</p>{row.missingEntries.length > 0 ? <><p>{row.missingEntries.length} logged entr{row.missingEntries.length === 1 ? "y is" : "ies are"} missing a {nutrientMeta(row.key).label} value:</p><ul className="nutrition-attention__missing-list">{row.missingEntries.slice(0, 8).map((entry) => <li key={entry.id}><span>{formatDate(entry.date)}</span><strong>{entry.names.join(", ")}</strong><InspectEntryAction entry={entry} currentDate={currentDate} onInspectEntry={onInspectEntry} /></li>)}</ul></> : <p>No individual missing entries were found in the loaded history.</p>}</div>
      </details>)}</div>}
      {canToggleCoverage ? <button type="button" className="nutrition-attention__show-all" onClick={() => setShowAllCoverage((shown) => !shown)}>{showAllCoverage ? "Show coverage needing attention" : `Show all coverage (${hiddenCoverageCount} more)`}</button> : null}
    </section>

    <p className="nutrition-attention__note">These comparisons describe recorded intake and current goals. They do not measure nutrient status in the body or establish deficiency, toxicity, or medical risk.</p>
  </section>;
}
