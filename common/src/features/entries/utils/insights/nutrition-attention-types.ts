import type { NutrientGoalMap } from "../nutrient-goals.js";
import type { NutrientKey, NutrientUpperLimitKey } from "../nutrients.js";
import type { InsightDay, InsightEntry } from "./insight-types.js";
import type {
  NutrientReference,
  NutrientReferenceRequirement,
  NutrientUpperLimitApplicabilityOptions,
  NutrientUpperLimitDefinition,
  NutrientUpperLimitUnsupportedReason,
} from "./nutrient-references.js";

export type NutritionAttentionWindow = 14 | 28;
export type NutritionAttentionDayStatus =
  "unlogged" | "unknown" | "partial" | "complete";
export type NutritionAttentionShortfallStatus =
  "unsupported" | "insufficient-data" | "no-persistent-pattern" | "persistent";
export type NutritionAttentionExcessStatus =
  | "unsupported"
  | "insufficient-data"
  | "no-excess-observed"
  | "observed"
  | "repeated";
export type NutritionAttentionExcessDayClassification =
  "unsupported" | "unlogged" | "indeterminate" | "at-or-below" | "above";

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
  readonly reason:
    | "no-reference"
    | "insufficient-complete-days"
    | "no-persistent-pattern"
    | "persistent-shortfall";
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

export type NutritionAttentionUpperLimit =
  NutritionAttentionThresholdSummary & {
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
  readonly nutrients: Readonly<
    Record<NutrientKey, NutritionAttentionNutrientFact>
  >;
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
