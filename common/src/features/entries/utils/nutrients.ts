/**
 * The fixed set of optional nutrients stored for each entry item.
 *
 * A missing value is `null`. It is different from zero: `null` means that the
 * value is unknown, while zero means that it is known to be zero.
 */
export const NUTRIENT_KEYS = [
  "fiberG",
  "totalSugarsG",
  "saturatedFatG",
  "monounsaturatedFatG",
  "polyunsaturatedFatG",
  "omega3G",
  "cholesterolMg",
  "vitaminAMcgRae",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminEMg",
  "vitaminKMcg",
  "vitaminB6Mg",
  "folateMcgDfe",
  "vitaminB12Mcg",
  "sodiumMg",
  "potassiumMg",
  "calciumMg",
  "ironMg",
  "magnesiumMg",
  "phosphorusMg",
  "zincMg",
  "seleniumMcg",
  "caffeineMg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/**
 * Amounts of one source or form, which the published upper limits use. They
 * stay outside `NUTRIENT_KEYS` because they are not daily totals, and they
 * must never replace or add to the daily aggregates.
 */
export const NUTRIENT_UPPER_LIMIT_KEYS = [
  "preformedVitaminAMcgRae",
  "supplementalMagnesiumMg",
  "folicAcidMcg",
  "supplementalVitaminEMg",
] as const;

export type NutrientUpperLimitKey = (typeof NUTRIENT_UPPER_LIMIT_KEYS)[number];

export type NutrientGroup =
  "carbohydrates" | "fats" | "vitamins" | "minerals" | "other";

interface NutrientMetadata {
  readonly key: NutrientKey;
  readonly label: string;
  readonly unit: "g" | "mg" | "mcg";
  readonly group: NutrientGroup;
  readonly precision: number;
  /** The largest value that the API accepts for one item. */
  readonly maximum: number;
}

export const NUTRIENT_META = [
  {
    key: "fiberG",
    label: "Fiber",
    unit: "g",
    group: "carbohydrates",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "totalSugarsG",
    label: "Total sugars",
    unit: "g",
    group: "carbohydrates",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "saturatedFatG",
    label: "Saturated fat",
    unit: "g",
    group: "fats",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "monounsaturatedFatG",
    label: "Monounsaturated fat",
    unit: "g",
    group: "fats",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "polyunsaturatedFatG",
    label: "Polyunsaturated fat",
    unit: "g",
    group: "fats",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "omega3G",
    label: "Omega-3",
    unit: "g",
    group: "fats",
    precision: 2,
    maximum: 100_000,
  },
  {
    key: "cholesterolMg",
    label: "Cholesterol",
    unit: "mg",
    group: "fats",
    precision: 0,
    maximum: 1_000_000,
  },
  {
    key: "vitaminAMcgRae",
    label: "Vitamin A",
    unit: "mcg",
    group: "vitamins",
    precision: 0,
    maximum: 10_000_000,
  },
  {
    key: "vitaminCMg",
    label: "Vitamin C",
    unit: "mg",
    group: "vitamins",
    precision: 0,
    maximum: 1_000_000,
  },
  {
    key: "vitaminDMcg",
    label: "Vitamin D",
    unit: "mcg",
    group: "vitamins",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "vitaminEMg",
    label: "Vitamin E",
    unit: "mg",
    group: "vitamins",
    precision: 1,
    maximum: 1_000_000,
  },
  {
    key: "vitaminKMcg",
    label: "Vitamin K",
    unit: "mcg",
    group: "vitamins",
    precision: 1,
    maximum: 1_000_000,
  },
  {
    key: "vitaminB6Mg",
    label: "Vitamin B6",
    unit: "mg",
    group: "vitamins",
    precision: 2,
    maximum: 100_000,
  },
  {
    key: "folateMcgDfe",
    label: "Folate",
    unit: "mcg",
    group: "vitamins",
    precision: 0,
    maximum: 1_000_000,
  },
  {
    key: "vitaminB12Mcg",
    label: "Vitamin B12",
    unit: "mcg",
    group: "vitamins",
    precision: 2,
    maximum: 100_000,
  },
  {
    key: "sodiumMg",
    label: "Sodium",
    unit: "mg",
    group: "minerals",
    precision: 0,
    maximum: 10_000_000,
  },
  {
    key: "potassiumMg",
    label: "Potassium",
    unit: "mg",
    group: "minerals",
    precision: 0,
    maximum: 10_000_000,
  },
  {
    key: "calciumMg",
    label: "Calcium",
    unit: "mg",
    group: "minerals",
    precision: 0,
    maximum: 10_000_000,
  },
  {
    key: "ironMg",
    label: "Iron",
    unit: "mg",
    group: "minerals",
    precision: 2,
    maximum: 100_000,
  },
  {
    key: "magnesiumMg",
    label: "Magnesium",
    unit: "mg",
    group: "minerals",
    precision: 0,
    maximum: 10_000_000,
  },
  {
    key: "phosphorusMg",
    label: "Phosphorus",
    unit: "mg",
    group: "minerals",
    precision: 0,
    maximum: 10_000_000,
  },
  {
    key: "zincMg",
    label: "Zinc",
    unit: "mg",
    group: "minerals",
    precision: 2,
    maximum: 100_000,
  },
  {
    key: "seleniumMcg",
    label: "Selenium",
    unit: "mcg",
    group: "minerals",
    precision: 1,
    maximum: 100_000,
  },
  {
    key: "caffeineMg",
    label: "Caffeine",
    unit: "mg",
    group: "other",
    precision: 0,
    maximum: 100_000,
  },
] as const satisfies readonly NutrientMetadata[];

/** The amount of each tracked nutrient of one item, or `null` when it is unknown. */
export type NutrientValues = Record<
  NutrientKey | NutrientUpperLimitKey,
  number | null
>;

interface NutrientAggregate {
  readonly amount: number | null;
  readonly knownItemCount: number;
  readonly totalItemCount: number;
  readonly complete: boolean;
}

export type NutrientAggregateMap = Record<NutrientKey, NutrientAggregate>;

/** A stored or typed amount counts when it is a finite number that is not negative. */
export function nullableNutrientValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** The total of each nutrient over items, and how many items had a value for it. */
export function aggregateNutrients(
  items: readonly Partial<Record<NutrientKey, unknown>>[],
): NutrientAggregateMap {
  const aggregates = {} as NutrientAggregateMap;
  for (const key of NUTRIENT_KEYS) {
    let amount = 0;
    let knownItemCount = 0;
    for (const item of items) {
      const value = nullableNutrientValue(item[key]);
      if (value === null) {
        continue;
      }
      amount += value;
      knownItemCount += 1;
    }
    const totalItemCount = items.length;
    aggregates[key] = {
      amount: knownItemCount === 0 ? null : amount,
      knownItemCount,
      totalItemCount,
      complete: totalItemCount > 0 && knownItemCount === totalItemCount,
    };
  }
  return aggregates;
}
