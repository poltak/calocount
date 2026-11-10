import type { InsightEntry } from "@app/common/features/entries/utils/insights/insight-types";
import type { getNutritionAttention } from "@app/common/features/entries/utils/insights/nutrition-attention";
import type {
  NutritionAttentionDayFact,
  NutritionAttentionNutrientFact,
} from "@app/common/features/entries/utils/insights/nutrition-attention-types";
import type { NutrientReference } from "@app/common/features/entries/utils/insights/nutrient-references";
import {
  NUTRIENT_KEYS,
  nullableNutrientValue,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "@app/common/features/entries/utils/nutrients";
import { nutrientValueOriginLabel } from "@app/common/features/entries/utils/nutrient-provenance";
import {
  formatNutrientAmount,
  nutrientLabel,
  nutrientUnit,
} from "../../core/utils/nutrient-format.js";
import { formatShortDate } from "../utils/insight-format.js";

export type CoverageState = "complete" | "partial" | "unknown";

export interface MissingEntry {
  id: string;
  date: string;
  names: string[];
}

export interface CoverageRow {
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
}

export type AttentionModel = ReturnType<typeof getNutritionAttention>;
export type UpperLimit = NutritionAttentionNutrientFact["excess"]["upperLimit"];

export function formatAmount(
  value: number | null,
  key: NutrientKey,
  unit?: string,
): string {
  return value === null
    ? "Unknown"
    : `${formatNutrientAmount(value, key)} ${unit ?? nutrientUnit(key)}`;
}

function missingEntriesFor({
  entries,
  key,
  startDate,
  endDate,
}: {
  entries: readonly InsightEntry[];
  key: NutrientKey;
  startDate: string;
  endDate: string;
}): MissingEntry[] {
  return entries
    .filter((entry) => entry.date >= startDate && entry.date <= endDate)
    .flatMap((entry) => {
      const names = entry.items
        .filter((item) => nullableNutrientValue(item.nutrients?.[key]) === null)
        .map((item) => item.name);
      return names.length > 0
        ? [{ id: entry.id, date: entry.date, names }]
        : [];
    });
}

export function stateLabel(state: CoverageState): string {
  if (state === "complete") {
    return "Complete for logged items";
  }
  return state === "partial" ? "Partial data" : "No usable data";
}

function trendLabel(percent: number | null): string {
  if (percent === null || Math.abs(percent) < 2) {
    return "steady";
  }
  return `${percent > 0 ? "up" : "down"} ${Math.abs(Math.round(percent))}%`;
}

export function shortfallTrendLabel(fact: NutritionAttentionNutrientFact) {
  const means = fact.shortfall.weeklyMeans
    .map((week) => week.mean)
    .filter((mean): mean is number => mean !== null);
  const first = means[0];
  const last = means.at(-1);
  if (
    means.length < 2 ||
    first === undefined ||
    last === undefined ||
    first === 0
  ) {
    return "steady";
  }
  return trendLabel(((last - first) / first) * 100);
}

export function sourceRows({
  entries,
  key,
  date,
}: {
  entries: readonly InsightEntry[];
  key: NutrientKey | NutrientUpperLimitKey;
  date: string | null;
}) {
  if (!date) {
    return [];
  }
  return entries
    .filter((entry) => entry.date === date)
    .flatMap((entry) =>
      entry.items.flatMap((item, index) => {
        const value = nullableNutrientValue(item.nutrients?.[key]);
        return value !== null && value > 0
          ? [{ entry, item, index, value }]
          : [];
      }),
    )
    .toSorted((left, right) => right.value - left.value);
}

export type SourceRow = ReturnType<typeof sourceRows>[number];

export function explicitNutrientOrigin(
  item: InsightEntry["items"][number],
  key: NutrientKey,
): string | null {
  const origin = item.nutrientProvenance?.[key];
  return origin ? nutrientValueOriginLabel(origin) : null;
}

export function coverageDescription(row: CoverageRow): string {
  if (row.loggedDays === 0) {
    return "No logged days in this window";
  }
  if (row.totalItems === 0) {
    return `${row.loggedDays} logged day${row.loggedDays === 1 ? "" : "s"}; no item details available`;
  }
  return `${row.completeDays} complete of ${row.loggedDays} logged days · ${row.knownItems} of ${row.totalItems} item values present`;
}

export function coverageRowsFor({
  model,
  entries,
}: {
  model: AttentionModel;
  entries: readonly InsightEntry[];
}): CoverageRow[] {
  return NUTRIENT_KEYS.map((key): CoverageRow => {
    const fact = model.nutrients[key];
    const knownItems = fact.days.reduce(
      (sum, day) => sum + day.knownItemCount,
      0,
    );
    const totalItems = fact.days.reduce(
      (sum, day) => sum + day.totalItemCount,
      0,
    );
    const initialState: CoverageState =
      fact.coverage.loggedDays === 0 || fact.coverage.knownDays === 0
        ? "unknown"
        : fact.coverage.completeDays === fact.coverage.loggedDays
          ? "complete"
          : "partial";
    const missingEntries = missingEntriesFor({
      entries,
      key,
      startDate: model.startDate,
      endDate: model.endDate,
    });
    return {
      key,
      state:
        initialState === "complete" && missingEntries.length > 0
          ? "partial"
          : initialState,
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

export function excessDayStatus(
  day: NutritionAttentionDayFact,
  threshold: number,
) {
  if (day.status === "unlogged") {
    return "unlogged";
  }
  if (day.amount !== null && day.amount > threshold) {
    return "above";
  }
  return day.status === "complete" ? "within" : "incomplete";
}

export function referenceDescriptor(reference: NutrientReference): string {
  return reference.type === "personal-goal"
    ? "your personal goal"
    : `the ${reference.label.toLowerCase()}`;
}

function upperLimitReasonLabel(reason: string | null): string {
  if (reason === "no-established-upper-limit") {
    return "No established upper limit is available for this nutrient.";
  }
  if (reason === "missing-applicability-data") {
    return "A published upper limit exists, but this log does not yet record the population, source, form, or unit details needed to apply it.";
  }
  return "No upper-limit reference is configured for this nutrient.";
}

function requirementLabel(requirement: string): string {
  if (requirement === "population") {
    return "population";
  }
  if (requirement === "source") {
    return "food versus supplement source";
  }
  return requirement === "form" ? "nutrient form" : "reference unit";
}

export function upperLimitReasonText(key: NutrientKey, upperLimit: UpperLimit) {
  if (
    key === "vitaminB6Mg" &&
    upperLimit.reason === "missing-applicability-data"
  ) {
    return "Available after confirming the U.S. adult 19+ profile; medical treatment doses are excluded.";
  }
  if (
    upperLimit.reason === "missing-applicability-data" &&
    upperLimit.missingRequirements.length > 0
  ) {
    return `${upperLimit.definition?.label ?? "Published upper limit"} needs ${upperLimit.missingRequirements.map(requirementLabel).join(", ")}.`;
  }
  return upperLimitReasonLabel(upperLimit.reason);
}

export function dayStatusLabel(status: NutritionAttentionDayFact["status"]) {
  if (status === "complete") {
    return "included in mean";
  }
  if (status === "partial") {
    return "excluded · partial values";
  }
  return status === "unknown"
    ? "excluded · no usable value"
    : "unlogged · no record";
}

export function dayStatusDescription({
  day,
  key,
  reference,
}: {
  day: NutritionAttentionDayFact;
  key: NutrientKey;
  reference: NutrientReference | null;
}): string {
  const date = formatShortDate(day.date);
  if (day.status === "unlogged") {
    return `${date}: no food log; excluded from the mean`;
  }
  if (day.status === "unknown") {
    return `${date}: logged, but no usable ${nutrientLabel(key).toLowerCase()} value; excluded from the mean`;
  }
  if (day.status === "partial") {
    return `${date}: ${formatAmount(day.amount, key)} known across ${day.knownItemCount} of ${day.totalItemCount} items; excluded from the mean`;
  }
  return `${date}: ${formatAmount(day.amount, key)}; included in the mean${reference ? ` against ${formatAmount(reference.value, key)} reference` : ""}`;
}

export function statusDescription({
  day,
  key,
  threshold,
  unit,
}: {
  day: NutritionAttentionDayFact;
  key: NutrientKey;
  threshold: number;
  unit: string | undefined;
}): string {
  const date = formatShortDate(day.date);
  if (day.status === "unlogged") {
    return `${date}: no records`;
  }
  if (day.amount !== null && day.amount > threshold) {
    return `${date}: ${formatAmount(day.amount, key, unit)}, above ${formatAmount(threshold, key, unit)}`;
  }
  if (day.status === "partial" || day.status === "unknown") {
    return `${date}: ${formatAmount(day.amount, key, unit)}, incomplete item data`;
  }
  return `${date}: ${formatAmount(day.amount, key, unit)}, within ${formatAmount(threshold, key, unit)}`;
}
