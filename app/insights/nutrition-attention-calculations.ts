import {
  NUTRIENT_KEYS,
  type NutrientKey,
  type NutrientUpperLimitKey,
} from "../../domain/nutrients";
import {
  nutrientReferenceForGoal,
  NUTRIENT_UPPER_LIMIT_TRACKING_KEYS,
  nutrientUpperLimitApplicability,
  type NutrientReference,
  type NutrientReferenceRequirement,
  type NutrientUpperLimitApplicabilityOptions,
  type NutrientUpperLimitDefinition,
  type NutrientUpperLimitUnsupportedReason,
} from "../../domain/nutrient-references";
import type { NutrientGoalMap } from "../../domain/nutrient-goals";
import type { InsightDay, InsightEntry } from "./types";

export type NutritionAttentionWindow = 14 | 28;
export type NutritionAttentionDayStatus = "unlogged" | "unknown" | "partial" | "complete";
export type NutritionAttentionShortfallStatus = "unsupported" | "insufficient-data" | "no-persistent-pattern" | "persistent";
export type NutritionAttentionExcessStatus = "unsupported" | "insufficient-data" | "no-excess-observed" | "observed" | "repeated";
export type NutritionAttentionExcessDayClassification = "unsupported" | "unlogged" | "indeterminate" | "at-or-below" | "above";

export type NutritionAttentionDayFact = {
  readonly date: string;
  readonly status: NutritionAttentionDayStatus;
  readonly amount: number | null;
  readonly knownItemCount: number;
  readonly totalItemCount: number;
};

export type NutritionAttentionCoverage = {
  readonly calendarDays: number;
  readonly loggedDays: number;
  readonly unloggedDays: number;
  readonly completeDays: number;
  readonly partialDays: number;
  readonly unknownLoggedDays: number;
  readonly knownDays: number;
};

export type NutritionAttentionWeek = {
  readonly startDate: string;
  readonly endDate: string;
  readonly eligibleDays: number;
  readonly mean: number | null;
  /** Null means that this week did not have the five complete days needed for comparison. */
  readonly belowReference: boolean | null;
};

export type NutritionAttentionShortfall = {
  readonly reference: NutrientReference | null;
  readonly status: NutritionAttentionShortfallStatus;
  readonly reason: "no-reference" | "insufficient-complete-days" | "no-persistent-pattern" | "persistent-shortfall";
  readonly eligibleDays: number;
  readonly minimumEligibleDays: number;
  readonly mean: number | null;
  readonly meanPercent: number | null;
  readonly proportionalShortfall: number | null;
  readonly meanBelowReference: boolean | null;
  readonly eligibleDates: readonly string[];
  readonly weeklyMeans: readonly NutritionAttentionWeek[];
  readonly weeksBelowReference: number;
  readonly persistent: boolean;
};

export type NutritionAttentionCurrentExcess = {
  readonly status: NutritionAttentionDayStatus;
  readonly amount: number | null;
  /** True is useful even when the current day is partial: recorded values already cross the reference. */
  readonly aboveReference: boolean | null;
};

export type NutritionAttentionExcessDay = {
  readonly date: string;
  readonly status: NutritionAttentionDayStatus;
  readonly amount: number | null;
  readonly knownItemCount: number;
  readonly totalItemCount: number;
  readonly threshold: number | null;
  readonly classification: NutritionAttentionExcessDayClassification;
};

export type NutritionAttentionThresholdSummary = {
  readonly reference: NutrientReference | null;
  readonly status: NutritionAttentionExcessStatus;
  readonly observedDays: number;
  readonly observedAboveDays: number;
  readonly completeAtOrBelowDays: number;
  readonly indeterminateDays: number;
  readonly unloggedDays: number;
  /** Mean of known complete and partial daily sums; denominator is observedDays. */
  readonly meanKnown: number | null;
  /** Backward-compatible alias for meanKnown. */
  readonly averageKnown: number | null;
  readonly maximumRecorded: number | null;
  readonly aboveDates: readonly string[];
  readonly dayClassifications: readonly NutritionAttentionExcessDay[];
  readonly current: NutritionAttentionCurrentExcess;
  readonly repeated: boolean;
};

export type NutritionAttentionUpperLimit = NutritionAttentionThresholdSummary & {
  /** A definition may be present even when it is not safe to apply. */
  readonly definition: NutrientUpperLimitDefinition | null;
  readonly reason: NutrientUpperLimitUnsupportedReason | null;
  readonly missingRequirements: readonly NutrientReferenceRequirement[];
  /** Regular total key for B6, or the explicit source/form field for other ULs. */
  readonly dataKey: NutrientKey | NutrientUpperLimitKey;
};

export type NutritionAttentionExcess = NutritionAttentionThresholdSummary & {
  /** Published vitamin/mineral UL assessment, kept separate from goal/guideline excess. */
  readonly upperLimit: NutritionAttentionUpperLimit;
};

export type NutritionAttentionNutrientFact = {
  readonly nutrient: NutrientKey;
  readonly coverage: NutritionAttentionCoverage;
  readonly days: readonly NutritionAttentionDayFact[];
  readonly currentDay: NutritionAttentionDayFact;
  readonly shortfall: NutritionAttentionShortfall;
  readonly excess: NutritionAttentionExcess;
};

export type NutritionAttentionFindingKind = "shortfall" | "excess";

export type NutritionAttentionFinding = {
  readonly rank: number;
  readonly nutrient: NutrientKey;
  readonly kind: NutritionAttentionFindingKind;
  readonly reason: "persistent-shortfall" | "repeated-excess";
  readonly reference: NutrientReference;
  readonly eligibleDays: number;
  readonly weeksBelowReference: number;
  readonly proportionalShortfall: number | null;
  readonly observedAboveDays: number;
  readonly maximumRatio: number | null;
};

export type NutritionAttentionResult = {
  readonly currentDate: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly windowDays: NutritionAttentionWindow;
  readonly minimumEligibleDays: number;
  readonly minimumEligibleDaysPerWeek: 5;
  readonly nutrients: Readonly<Record<NutrientKey, NutritionAttentionNutrientFact>>;
  readonly findings: readonly NutritionAttentionFinding[];
};

export type NutritionAttentionOptions = {
  readonly days: readonly InsightDay[];
  /** Private item entries are needed to evaluate source/form-specific ULs. */
  readonly entries?: readonly InsightEntry[];
  readonly currentDate: string;
  readonly goals: NutrientGoalMap;
  readonly windowDays: NutritionAttentionWindow;
  /** Explicit profile confirmations; absent means no UL opt-in. */
  readonly referenceSettings?: NutrientUpperLimitApplicabilityOptions;
};

type EvaluatedDay = NutritionAttentionDayFact;

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteCount(value: unknown): number {
  const parsed = finiteNonNegative(value);
  return parsed === null ? 0 : Math.floor(parsed);
}

function shiftIsoDate(date: string, offsetDays: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function evaluateDay(day: InsightDay | undefined, nutrient: NutrientKey, date: string): EvaluatedDay {
  if (!day || !Number.isFinite(day.mealCount) || day.mealCount <= 0) {
    return { date, status: "unlogged", amount: null, knownItemCount: 0, totalItemCount: 0 };
  }

  const aggregate = day.nutrients?.[nutrient];
  const amount = finiteNonNegative(aggregate?.amount);
  const knownItemCount = finiteCount(aggregate?.knownItemCount);
  const totalItemCount = finiteCount(aggregate?.totalItemCount);
  if (amount === null) {
    return { date, status: "unknown", amount: null, knownItemCount, totalItemCount };
  }

  // `complete` is the source-of-truth flag produced by aggregateNutrientValues.
  // Requiring a positive item count prevents an empty logged day from entering
  // a shortfall mean as a known zero.
  const complete = aggregate?.complete === true && totalItemCount > 0 && knownItemCount >= totalItemCount;
  if (complete) return { date, status: "complete", amount, knownItemCount, totalItemCount };
  if (knownItemCount > 0 && totalItemCount > knownItemCount) {
    return { date, status: "partial", amount, knownItemCount, totalItemCount };
  }
  return { date, status: "unknown", amount, knownItemCount, totalItemCount };
}

/**
 * Evaluate a source/form-specific amount from private item entries. The
 * regular daily total is intentionally not consulted here: a total vitamin A
 * value, for example, cannot establish how much was preformed vitamin A.
 */
function evaluateUpperLimitDataDay(
  entriesByDate: ReadonlyMap<string, readonly InsightEntry[]>,
  dataKey: NutrientUpperLimitKey,
  date: string,
): EvaluatedDay {
  const entries = entriesByDate.get(date) ?? [];
  if (entries.length === 0) {
    return { date, status: "unlogged", amount: null, knownItemCount: 0, totalItemCount: 0 };
  }

  const items = entries.flatMap((entry) => entry.items);
  const knownValues = items
    .map((item) => finiteNonNegative(item.nutrients?.[dataKey]))
    .filter((value): value is number => value !== null);
  const totalItemCount = items.length;
  const knownItemCount = knownValues.length;
  const amount = knownItemCount > 0 ? knownValues.reduce((sum, value) => sum + value, 0) : null;
  if (amount === null) {
    return { date, status: "unknown", amount: null, knownItemCount, totalItemCount };
  }
  if (totalItemCount > 0 && knownItemCount === totalItemCount) {
    return { date, status: "complete", amount, knownItemCount, totalItemCount };
  }
  if (knownItemCount > 0) {
    return { date, status: "partial", amount, knownItemCount, totalItemCount };
  }
  return { date, status: "unknown", amount, knownItemCount, totalItemCount };
}

function upperLimitDataDays(
  entries: readonly InsightEntry[],
  dataKey: NutrientUpperLimitKey,
  dates: readonly string[],
  currentDate: string,
) {
  const entriesByDate = new Map<string, InsightEntry[]>();
  for (const entry of entries) {
    const current = entriesByDate.get(entry.date) ?? [];
    current.push(entry);
    entriesByDate.set(entry.date, current);
  }
  return {
    pastDays: dates.map((date) => evaluateUpperLimitDataDay(entriesByDate, dataKey, date)),
    currentDay: evaluateUpperLimitDataDay(entriesByDate, dataKey, currentDate),
  };
}

function coverageFor(days: readonly EvaluatedDay[]): NutritionAttentionCoverage {
  const loggedDays = days.filter((day) => day.status !== "unlogged").length;
  const unloggedDays = days.length - loggedDays;
  const completeDays = days.filter((day) => day.status === "complete").length;
  const partialDays = days.filter((day) => day.status === "partial").length;
  const unknownLoggedDays = days.filter((day) => day.status === "unknown").length;
  return {
    calendarDays: days.length,
    loggedDays,
    unloggedDays,
    completeDays,
    partialDays,
    unknownLoggedDays,
    knownDays: completeDays + partialDays,
  };
}

function weeklyMeans(days: readonly EvaluatedDay[], startDate: string, windowDays: number, reference: NutrientReference | null) {
  const weeks: NutritionAttentionWeek[] = [];
  for (let index = 0; index < windowDays / 7; index += 1) {
    const weekStart = shiftIsoDate(startDate, index * 7);
    const weekEnd = shiftIsoDate(weekStart, 6);
    const eligible = days.filter((day) => day.date >= weekStart && day.date <= weekEnd && day.status === "complete" && day.amount !== null);
    const value = mean(eligible.map((day) => day.amount as number));
    weeks.push({
      startDate: weekStart,
      endDate: weekEnd,
      eligibleDays: eligible.length,
      mean: value,
      belowReference: reference && eligible.length >= 5 && value !== null ? value < reference.value : null,
    });
  }
  return weeks;
}

function buildShortfall(
  days: readonly EvaluatedDay[],
  startDate: string,
  windowDays: NutritionAttentionWindow,
  reference: NutrientReference | null,
): NutritionAttentionShortfall {
  const eligible = days.filter((day) => day.status === "complete" && day.amount !== null);
  const eligibleValues = eligible.map((day) => day.amount as number);
  const value = mean(eligibleValues);
  const minimumEligibleDays = windowDays === 14 ? 10 : 20;
  const weekly = weeklyMeans(days, startDate, windowDays, reference);
  const weeksBelowReference = weekly.filter((week) => week.belowReference === true).length;
  const meanPercent = reference && value !== null ? value / reference.value * 100 : null;
  const proportionalShortfall = reference && value !== null ? Math.max(0, (reference.value - value) / reference.value) : null;
  const meanBelowReference = reference && value !== null ? value < reference.value : null;
  const persistent = reference !== null && eligible.length >= minimumEligibleDays && weeksBelowReference >= 2;
  let status: NutritionAttentionShortfallStatus;
  let reason: NutritionAttentionShortfall["reason"];
  if (!reference) {
    status = "unsupported";
    reason = "no-reference";
  } else if (eligible.length < minimumEligibleDays) {
    status = "insufficient-data";
    reason = "insufficient-complete-days";
  } else if (!persistent) {
    status = "no-persistent-pattern";
    reason = "no-persistent-pattern";
  } else {
    status = "persistent";
    reason = "persistent-shortfall";
  }
  return {
    reference,
    status,
    reason,
    eligibleDays: eligible.length,
    minimumEligibleDays,
    mean: value,
    meanPercent,
    proportionalShortfall,
    meanBelowReference,
    eligibleDates: eligible.map((day) => day.date),
    weeklyMeans: weekly,
    weeksBelowReference,
    persistent,
  };
}

function buildCurrentExcess(day: EvaluatedDay, reference: NutrientReference | null): NutritionAttentionCurrentExcess {
  return {
    status: day.status,
    amount: day.amount,
    aboveReference: reference && day.amount !== null ? day.amount > reference.value : null,
  };
}

function classifyExcessDay(day: EvaluatedDay, reference: NutrientReference | null): NutritionAttentionExcessDayClassification {
  if (day.status === "unlogged") return "unlogged";
  if (!reference) return "unsupported";
  if (day.status === "unknown") return "indeterminate";
  if (day.amount !== null && day.amount > reference.value) return "above";
  return day.status === "complete" ? "at-or-below" : "indeterminate";
}

function thresholdSummary(
  days: readonly EvaluatedDay[],
  currentDay: EvaluatedDay,
  reference: NutrientReference | null,
): NutritionAttentionThresholdSummary {
  const dayClassifications = days.map((day) => ({
    date: day.date,
    status: day.status,
    amount: day.amount,
    knownItemCount: day.knownItemCount,
    totalItemCount: day.totalItemCount,
    threshold: reference?.value ?? null,
    classification: classifyExcessDay(day, reference),
  }));
  const known = days.filter((day) => day.status === "complete" || day.status === "partial");
  const above = dayClassifications.filter((day) => day.classification === "above");
  const completeAtOrBelowDays = days.filter((day) => day.status === "complete" && reference !== null && day.amount !== null && day.amount <= reference.value).length;
  const indeterminateDays = days.filter((day) => day.status === "unknown" || (day.status === "partial" && reference !== null && day.amount !== null && day.amount <= reference.value)).length;
  const unloggedDays = days.filter((day) => day.status === "unlogged").length;
  const observedDays = known.filter((day) => day.amount !== null).length;
  const meanKnown = mean(known.map((day) => day.amount).filter((amount): amount is number => amount !== null));
  const maximumRecorded = observedDays ? Math.max(...known.map((day) => day.amount as number)) : null;
  const repeated = above.length >= 2;
  let status: NutritionAttentionExcessStatus;
  if (!reference) status = "unsupported";
  else if (observedDays === 0) status = "insufficient-data";
  else if (repeated) status = "repeated";
  else if (above.length === 1) status = "observed";
  else status = "no-excess-observed";
  return {
    reference,
    status,
    observedDays,
    observedAboveDays: above.length,
    completeAtOrBelowDays,
    indeterminateDays,
    unloggedDays,
    meanKnown,
    averageKnown: meanKnown,
    maximumRecorded,
    aboveDates: above.map((day) => day.date),
    dayClassifications,
    current: buildCurrentExcess(currentDay, reference),
    repeated,
  };
}

function buildUpperLimit(
  days: readonly EvaluatedDay[],
  currentDay: EvaluatedDay,
  nutrient: NutrientKey,
  referenceSettings: NutrientUpperLimitApplicabilityOptions,
  dataKey: NutrientKey | NutrientUpperLimitKey,
): NutritionAttentionUpperLimit {
  const applicability = nutrientUpperLimitApplicability(nutrient, referenceSettings);
  const summary = thresholdSummary(days, currentDay, applicability.reference);
  return {
    ...summary,
    definition: applicability.definition,
    reason: applicability.reason,
    missingRequirements: applicability.missingRequirements,
    dataKey,
  };
}

function buildExcess(
  days: readonly EvaluatedDay[],
  currentDay: EvaluatedDay,
  reference: NutrientReference | null,
  nutrient: NutrientKey,
  referenceSettings: NutrientUpperLimitApplicabilityOptions,
  upperLimitDays: readonly EvaluatedDay[] = days,
  upperLimitCurrentDay: EvaluatedDay = currentDay,
  upperLimitDataKey: NutrientKey | NutrientUpperLimitKey = nutrient,
): NutritionAttentionExcess {
  return {
    ...thresholdSummary(days, currentDay, reference),
    upperLimit: buildUpperLimit(upperLimitDays, upperLimitCurrentDay, nutrient, referenceSettings, upperLimitDataKey),
  };
}

function findingSort(a: NutritionAttentionFinding, b: NutritionAttentionFinding) {
  if (a.kind !== b.kind) return a.kind === "shortfall" ? -1 : 1;
  if (a.kind === "shortfall" && b.kind === "shortfall") {
    if (a.weeksBelowReference !== b.weeksBelowReference) return b.weeksBelowReference - a.weeksBelowReference;
    if ((b.proportionalShortfall ?? 0) !== (a.proportionalShortfall ?? 0)) {
      return (b.proportionalShortfall ?? 0) - (a.proportionalShortfall ?? 0);
    }
    if (a.eligibleDays !== b.eligibleDays) return b.eligibleDays - a.eligibleDays;
    return NUTRIENT_KEYS.indexOf(a.nutrient) - NUTRIENT_KEYS.indexOf(b.nutrient);
  }
  if (a.observedAboveDays !== b.observedAboveDays) return b.observedAboveDays - a.observedAboveDays;
  if ((b.maximumRatio ?? 0) !== (a.maximumRatio ?? 0)) return (b.maximumRatio ?? 0) - (a.maximumRatio ?? 0);
  return NUTRIENT_KEYS.indexOf(a.nutrient) - NUTRIENT_KEYS.indexOf(b.nutrient);
}

/**
 * Calculate transparent, coverage-aware nutrition findings for the selected
 * calendar window. Past shortfall means use only complete logged days. Excess
 * observations may include a known partial sum when that recorded sum already
 * crosses its labelled reference; the current day is reported separately.
 */
export function getNutritionAttention({ days, entries = [], currentDate, goals, windowDays, referenceSettings = {} }: NutritionAttentionOptions): NutritionAttentionResult {
  const startDate = shiftIsoDate(currentDate, -windowDays);
  const endDate = shiftIsoDate(currentDate, -1);
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const dates = Array.from({ length: windowDays }, (_, index) => shiftIsoDate(startDate, index));
  const currentSource = dayByDate.get(currentDate);
  const nutrients = {} as Record<NutrientKey, NutritionAttentionNutrientFact>;
  const facts: NutritionAttentionNutrientFact[] = [];
  const trackedUpperLimitData = { ...(referenceSettings.trackedUpperLimitData ?? {}) };
  for (const [nutrient, dataKey] of Object.entries(NUTRIENT_UPPER_LIMIT_TRACKING_KEYS) as Array<[NutrientKey, NutrientUpperLimitKey]>) {
    trackedUpperLimitData[nutrient] = entries.some((entry) => entry.items.some((item) => finiteNonNegative(item.nutrients?.[dataKey]) !== null));
  }
  const effectiveReferenceSettings: NutrientUpperLimitApplicabilityOptions = {
    ...referenceSettings,
    trackedUpperLimitData,
  };

  for (const nutrient of NUTRIENT_KEYS) {
    const goal = goals[nutrient];
    const pastDays = dates.map((date) => evaluateDay(dayByDate.get(date), nutrient, date));
    const currentDay = evaluateDay(currentSource, nutrient, currentDate);
    const shortfallReference = goal?.direction === "minimum" ? nutrientReferenceForGoal(nutrient, goal) : null;
    const possibleExcessReference = goal?.direction === "maximum" ? nutrientReferenceForGoal(nutrient, goal) : null;
    const excessReference = possibleExcessReference?.type === "guideline" || possibleExcessReference?.type === "personal-goal"
      ? possibleExcessReference
      : null;
    const upperLimitDataKey = NUTRIENT_UPPER_LIMIT_TRACKING_KEYS[nutrient];
    const sourceSpecificDays = upperLimitDataKey
      ? upperLimitDataDays(entries, upperLimitDataKey, dates, currentDate)
      : null;
    const shortfall = buildShortfall(pastDays, startDate, windowDays, shortfallReference);
    const excess = buildExcess(
      pastDays,
      currentDay,
      excessReference,
      nutrient,
      effectiveReferenceSettings,
      sourceSpecificDays?.pastDays,
      sourceSpecificDays?.currentDay,
      upperLimitDataKey ?? nutrient,
    );
    const fact: NutritionAttentionNutrientFact = {
      nutrient,
      coverage: coverageFor(pastDays),
      days: pastDays,
      currentDay,
      shortfall,
      excess,
    };
    nutrients[nutrient] = fact;
    facts.push(fact);
  }

  const findings: NutritionAttentionFinding[] = [];
  for (const fact of facts) {
    if (fact.shortfall.persistent && fact.shortfall.reference) {
      findings.push({
        rank: 0,
        nutrient: fact.nutrient,
        kind: "shortfall",
        reason: "persistent-shortfall",
        reference: fact.shortfall.reference,
        eligibleDays: fact.shortfall.eligibleDays,
        weeksBelowReference: fact.shortfall.weeksBelowReference,
        proportionalShortfall: fact.shortfall.proportionalShortfall,
        observedAboveDays: 0,
        maximumRatio: null,
      });
    }
    if (fact.excess.repeated && fact.excess.reference) {
      findings.push({
        rank: 0,
        nutrient: fact.nutrient,
        kind: "excess",
        reason: "repeated-excess",
        reference: fact.excess.reference,
        eligibleDays: 0,
        weeksBelowReference: 0,
        proportionalShortfall: null,
        observedAboveDays: fact.excess.observedAboveDays,
        maximumRatio: fact.excess.reference.value > 0 && fact.excess.maximumRecorded !== null
          ? fact.excess.maximumRecorded / fact.excess.reference.value
          : null,
      });
    } else if (fact.excess.upperLimit.repeated && fact.excess.upperLimit.reference) {
      findings.push({
        rank: 0,
        nutrient: fact.nutrient,
        kind: "excess",
        reason: "repeated-excess",
        reference: fact.excess.upperLimit.reference,
        eligibleDays: 0,
        weeksBelowReference: 0,
        proportionalShortfall: null,
        observedAboveDays: fact.excess.upperLimit.observedAboveDays,
        maximumRatio: fact.excess.upperLimit.reference.value > 0 && fact.excess.upperLimit.maximumRecorded !== null
          ? fact.excess.upperLimit.maximumRecorded / fact.excess.upperLimit.reference.value
          : null,
      });
    }
  }
  findings.sort(findingSort);
  const rankedFindings = findings.map((finding, index) => ({ ...finding, rank: index + 1 }));

  return {
    currentDate,
    startDate,
    endDate,
    windowDays,
    minimumEligibleDays: windowDays === 14 ? 10 : 20,
    minimumEligibleDaysPerWeek: 5,
    nutrients,
    findings: rankedFindings,
  };
}
