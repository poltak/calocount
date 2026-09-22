import { NUTRIENT_META, type NutrientKey, type NutrientUpperLimitKey } from "./nutrients";
import type { ResolvedNutrientGoal } from "./nutrient-goals";

/**
 * The references used by nutrition-attention calculations are deliberately
 * narrower than the validation limits in `NUTRIENT_META`. A reference helps
 * describe a recorded intake pattern; it is not a diagnosis or a toxicity
 * threshold.
 */
export type NutrientReferenceType = "intake-reference" | "guideline" | "upper-limit" | "personal-goal";
export type NutrientReferenceKind = NutrientReferenceType;

/** The fields required before a published upper limit can be applied safely. */
export type NutrientReferenceRequirement = "population" | "source" | "form" | "unit";

/**
 * These are deliberately broader than the current log model. The current
 * aggregates only carry a total amount, so none of the source/form scopes can
 * be inferred from them.
 */
export type NutrientReferenceSourceScope =
  | "total-intake"
  | "food-only"
  | "supplement-or-medication"
  | "supplement-or-fortified-food"
  | "user-defined";

export type NutrientUpperLimitUnsupportedReason = "no-reference-configured" | "no-established-upper-limit" | "missing-applicability-data";

export type NutrientReference = {
  readonly id: string;
  readonly nutrient: NutrientKey;
  readonly value: number;
  readonly unit: string;
  readonly type: NutrientReferenceType;
  readonly label: string;
  readonly authority: string;
  readonly sourceUrl: string | null;
  /** Stable identifier for the published reference set or user settings. */
  readonly referenceVersion: string | null;
  /** Population represented by the threshold, such as `general adults`. */
  readonly population: string | null;
  /** Dietary source scope represented by the threshold. */
  readonly sourceScope: NutrientReferenceSourceScope;
  /** Required nutrient form when a total nutrient field is insufficient. */
  readonly formScope: string | null;
  /** Date this application last checked the selected reference. */
  readonly reviewDate: string | null;
};

export type NutrientReferencePolicy = {
  readonly defaultType: Exclude<NutrientReferenceType, "personal-goal" | "upper-limit">;
  readonly defaultLabel: string;
  readonly authority: string;
  readonly sourceUrl: string;
  readonly referenceVersion: string;
  readonly population: string;
  readonly sourceScope: NutrientReferenceSourceScope;
  readonly formScope: string | null;
  readonly reviewDate: string;
};

/**
 * A published UL definition is kept separately from an applicable reference.
 * `getNutrientUpperLimitApplicability` will not return it as an applicable
 * threshold until every required field is represented by tracked data.
 */
export type NutrientUpperLimitDefinition = NutrientReference & {
  readonly type: "upper-limit";
  readonly requiredData: readonly NutrientReferenceRequirement[];
};

/** Explicit item fields used for the source/form-specific UL comparisons. */
export const NUTRIENT_UPPER_LIMIT_TRACKING_KEYS: Partial<Record<NutrientKey, NutrientUpperLimitKey>> = {
  vitaminAMcgRae: "preformedVitaminAMcgRae",
  magnesiumMg: "supplementalMagnesiumMg",
  folateMcgDfe: "folicAcidMcg",
  vitaminEMg: "supplementalVitaminEMg",
};

export type NutrientUpperLimitApplicability =
  | {
    readonly status: "supported";
    readonly reference: NutrientUpperLimitDefinition;
    readonly definition: NutrientUpperLimitDefinition;
    readonly reason: null;
    readonly missingRequirements: readonly [];
  }
  | {
    readonly status: "unsupported";
    readonly reference: null;
    readonly definition: NutrientUpperLimitDefinition | null;
    readonly reason: NutrientUpperLimitUnsupportedReason;
    readonly missingRequirements: readonly NutrientReferenceRequirement[];
  };

/** Explicit profile confirmations that may unlock a published comparison. */
export type NutrientUpperLimitApplicabilityOptions = {
  /** The user explicitly confirmed the general U.S. FNB adult profile. */
  readonly usFnbAdultUlEnabled?: boolean;
  /** Backward-compatible B6-only opt-in; it must not unlock other nutrients. */
  readonly vitaminB6UsFnbAdultUlEnabled?: boolean;
  /** True only when the matching source/form-specific amount is tracked. */
  readonly trackedUpperLimitData?: Partial<Record<NutrientKey, boolean>>;
};

/** FDA source for the label Daily Values used by the existing default goals. */
export const FDA_DAILY_VALUE_SOURCE_URL = "https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label";

/** Sources and review identifiers are explicit so threshold changes are auditable. */
export const FDA_DAILY_VALUE_REFERENCE_VERSION = "FDA Daily Values (2016 label rule)";
export const FDA_CAFFEINE_REFERENCE_VERSION = "FDA adult caffeine guidance";
export const REFERENCE_REVIEW_DATE = "2026-09-22";
export const VITAMIN_B6_US_FNB_ADULT_PROFILE = "us-fnb-adult" as const;

const NIH_B6_SOURCE_URL = "https://ods.od.nih.gov/factsheets/VitaminB6-HealthProfessional/";
const NIH_MAGNESIUM_SOURCE_URL = "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/";
const NIH_FOLATE_SOURCE_URL = "https://ods.od.nih.gov/factsheets/Folate-HealthProfessional/";
const NIH_VITAMIN_A_SOURCE_URL = "https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/";
const NIH_VITAMIN_E_SOURCE_URL = "https://ods.od.nih.gov/factsheets/VitaminE-HealthProfessional/";

/**
 * Policies are intentionally explicit for thresholds that are easy to
 * mislabel. In particular, sodium and saturated fat are reduction guidelines
 * (or the user's own maximum), not upper-limit references.
 */
export const NUTRIENT_REFERENCE_POLICIES: Partial<Record<NutrientKey, NutrientReferencePolicy>> = {
  sodiumMg: {
    defaultType: "guideline",
    defaultLabel: "Sodium guideline",
    authority: "FDA Daily Value",
    sourceUrl: FDA_DAILY_VALUE_SOURCE_URL,
    referenceVersion: FDA_DAILY_VALUE_REFERENCE_VERSION,
    population: "general population 4+",
    sourceScope: "total-intake",
    formScope: null,
    reviewDate: REFERENCE_REVIEW_DATE,
  },
  saturatedFatG: {
    defaultType: "guideline",
    defaultLabel: "Saturated fat guideline",
    authority: "FDA Daily Value",
    sourceUrl: FDA_DAILY_VALUE_SOURCE_URL,
    referenceVersion: FDA_DAILY_VALUE_REFERENCE_VERSION,
    population: "general population 4+",
    sourceScope: "total-intake",
    formScope: null,
    reviewDate: REFERENCE_REVIEW_DATE,
  },
  caffeineMg: {
    defaultType: "guideline",
    defaultLabel: "Adult caffeine guidance",
    authority: "FDA adult caffeine guidance",
    sourceUrl: "https://www.fda.gov/consumers/consumer-updates/spilling-beans-how-much-caffeine-too-much",
    referenceVersion: FDA_CAFFEINE_REFERENCE_VERSION,
    population: "healthy adults",
    sourceScope: "total-intake",
    formScope: null,
    reviewDate: REFERENCE_REVIEW_DATE,
  },
};

const defaultPolicy: NutrientReferencePolicy = {
  defaultType: "intake-reference",
  defaultLabel: "FDA Daily Value",
  authority: "FDA Daily Value",
  sourceUrl: FDA_DAILY_VALUE_SOURCE_URL,
  referenceVersion: FDA_DAILY_VALUE_REFERENCE_VERSION,
  population: "general population 4+",
  sourceScope: "total-intake",
  formScope: null,
  reviewDate: REFERENCE_REVIEW_DATE,
};

const nutrientUnits = new Map(NUTRIENT_META.map((entry) => [entry.key, entry.unit]));

/**
 * Published UL definitions that are relevant to the currently tracked
 * vitamin/mineral fields. A definition becomes an active threshold only after
 * the matching adult profile confirmation and explicit source/form data are
 * both present.
 */
export const NUTRIENT_UPPER_LIMIT_DEFINITIONS: Partial<Record<NutrientKey, NutrientUpperLimitDefinition>> = {
  vitaminB6Mg: {
    id: "vitaminB6:nih-ods-us-fnb-ul",
    nutrient: "vitaminB6Mg",
    value: 100,
    unit: "mg",
    type: "upper-limit",
    label: "Vitamin B6 tolerable upper intake level",
    authority: "U.S. National Academies / NIH ODS",
    sourceUrl: NIH_B6_SOURCE_URL,
    referenceVersion: "U.S. FNB DRI for vitamin B6 (NIH ODS)",
    population: "adults 19+",
    sourceScope: "total-intake",
    formScope: "dietary vitamin B6; medical treatment doses excluded",
    reviewDate: REFERENCE_REVIEW_DATE,
    requiredData: ["population"],
  },
  vitaminAMcgRae: {
    id: "vitaminA:nih-ods-us-fnb-preformed-ul",
    nutrient: "vitaminAMcgRae",
    value: 3_000,
    unit: "mcg",
    type: "upper-limit",
    label: "Preformed vitamin A tolerable upper intake level",
    authority: "U.S. National Academies / NIH ODS",
    sourceUrl: NIH_VITAMIN_A_SOURCE_URL,
    referenceVersion: "U.S. FNB DRI for vitamin A (NIH ODS)",
    population: "adults 19+",
    sourceScope: "total-intake",
    formScope: "preformed vitamin A (retinol and retinyl esters), not carotenoids",
    reviewDate: REFERENCE_REVIEW_DATE,
    requiredData: ["population", "form", "unit"],
  },
  magnesiumMg: {
    id: "magnesium:nih-ods-us-fnb-supplemental-ul",
    nutrient: "magnesiumMg",
    value: 350,
    unit: "mg",
    type: "upper-limit",
    label: "Supplemental magnesium tolerable upper intake level",
    authority: "U.S. National Academies / NIH ODS",
    sourceUrl: NIH_MAGNESIUM_SOURCE_URL,
    referenceVersion: "U.S. FNB DRI for magnesium (NIH ODS)",
    population: "adults 19+",
    sourceScope: "supplement-or-medication",
    formScope: "non-food magnesium",
    reviewDate: REFERENCE_REVIEW_DATE,
    requiredData: ["population", "source"],
  },
  folateMcgDfe: {
    id: "folate:nih-ods-us-fnb-folic-acid-ul",
    nutrient: "folateMcgDfe",
    value: 1_000,
    unit: "mcg folic acid",
    type: "upper-limit",
    label: "Supplemental folic acid tolerable upper intake level",
    authority: "U.S. National Academies / NIH ODS",
    sourceUrl: NIH_FOLATE_SOURCE_URL,
    referenceVersion: "U.S. FNB DRI for folate (NIH ODS)",
    population: "adults 19+",
    sourceScope: "supplement-or-fortified-food",
    formScope: "synthetic folic acid, expressed as folic acid rather than total DFE",
    reviewDate: REFERENCE_REVIEW_DATE,
    requiredData: ["population", "source", "form", "unit"],
  },
  vitaminEMg: {
    id: "vitaminE:nih-ods-us-fnb-alpha-tocopherol-ul",
    nutrient: "vitaminEMg",
    value: 1_000,
    unit: "mg",
    type: "upper-limit",
    label: "Supplemental vitamin E tolerable upper intake level",
    authority: "U.S. National Academies / NIH ODS",
    sourceUrl: NIH_VITAMIN_E_SOURCE_URL,
    referenceVersion: "U.S. FNB DRI for vitamin E (NIH ODS)",
    population: "adults 19+",
    sourceScope: "supplement-or-fortified-food",
    formScope: "alpha-tocopherol from supplemental/fortified sources",
    reviewDate: REFERENCE_REVIEW_DATE,
    requiredData: ["population", "source", "form"],
  },
};

/** B12 has no established UL; it should never be treated as an excess finding. */
export const NUTRIENTS_WITHOUT_ESTABLISHED_UPPER_LIMIT = new Set<NutrientKey>(["vitaminB12Mcg"]);

/**
 * Turn a configured goal into a labelled reference for an insight. A custom
 * goal is always labelled as a personal goal. Default maximum goals remain
 * descriptive references; none are promoted to an unsupported upper-limit
 * claim by this module.
 */
export function nutrientReferenceForGoal(
  nutrient: NutrientKey,
  goal: ResolvedNutrientGoal | null | undefined,
): NutrientReference | null {
  if (!goal || goal.value === null || !Number.isFinite(goal.value) || goal.value <= 0) return null;

  if (goal.source === "custom") {
    return {
      id: `${nutrient}:personal-goal`,
      nutrient,
      value: goal.value,
      unit: nutrientUnits.get(nutrient) ?? "",
      type: "personal-goal",
      label: "Personal goal",
      authority: "User settings",
      sourceUrl: null,
      referenceVersion: "user-settings",
      population: "user-defined",
      sourceScope: "user-defined",
      formScope: null,
      reviewDate: null,
    };
  }

  const policy = NUTRIENT_REFERENCE_POLICIES[nutrient] ?? defaultPolicy;
  return {
    id: `${nutrient}:${policy.defaultType}`,
    nutrient,
    value: goal.value,
    unit: nutrientUnits.get(nutrient) ?? "",
    type: policy.defaultType,
    label: policy.defaultLabel,
    authority: policy.authority,
    sourceUrl: policy.sourceUrl,
    referenceVersion: policy.referenceVersion,
    population: policy.population,
    sourceScope: policy.sourceScope,
    formScope: policy.formScope,
    reviewDate: policy.reviewDate,
  };
}

/** Return the published UL definition without claiming that it applies. */
export function nutrientUpperLimitDefinition(nutrient: NutrientKey): NutrientUpperLimitDefinition | null {
  return NUTRIENT_UPPER_LIMIT_DEFINITIONS[nutrient] ?? null;
}

/**
 * The general profile option supplies explicit adult confirmation for all
 * supported definitions. The legacy B6 option deliberately only unlocks B6;
 * it must never silently opt a user into source/form-specific comparisons for
 * other nutrients.
 */
export function nutrientUpperLimitApplicability(
  nutrient: NutrientKey,
  options: NutrientUpperLimitApplicabilityOptions = {},
): NutrientUpperLimitApplicability {
  const definition = nutrientUpperLimitDefinition(nutrient);
  if (!definition) {
    return {
      status: "unsupported",
      reference: null,
      definition: null,
      reason: NUTRIENTS_WITHOUT_ESTABLISHED_UPPER_LIMIT.has(nutrient)
        ? "no-established-upper-limit"
        : "no-reference-configured",
      missingRequirements: [],
    };
  }
  const adultProfileEnabled = options.usFnbAdultUlEnabled === true
    || (nutrient === "vitaminB6Mg" && options.vitaminB6UsFnbAdultUlEnabled === true);
  const sourceFormDataAvailable = nutrient === "vitaminB6Mg"
    || options.trackedUpperLimitData?.[nutrient] === true;
  if (adultProfileEnabled && sourceFormDataAvailable) {
    return {
      status: "supported",
      reference: definition,
      definition,
      reason: null,
      missingRequirements: [],
    };
  }
  return {
    status: "unsupported",
    reference: null,
    definition,
    reason: "missing-applicability-data",
    missingRequirements: adultProfileEnabled
      ? definition.requiredData.filter((requirement) => requirement !== "population")
      : definition.requiredData,
  };
}

/** Alias with a getter-shaped name for callers that prefer reference wording. */
export const getNutrientReference = nutrientReferenceForGoal;
