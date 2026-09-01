/**
 * The fixed set of optional nutrients stored for each meal item.
 *
 * A missing value is represented by null. It is different from zero: null
 * means that the value is unknown, while zero means that it is known to be
 * zero.
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

type NutrientGroup = "carbohydrates" | "fats" | "vitamins" | "minerals" | "other";

export type NutrientMetadata = {
  readonly key: NutrientKey;
  readonly label: string;
  readonly unit: "g" | "mg" | "mcg";
  readonly group: NutrientGroup;
  readonly precision: number;
  /** Maximum safe value for one item in API and AI input. */
  readonly maximum: number;
};

export const NUTRIENT_META = [
  { key: "fiberG", label: "Fiber", unit: "g", group: "carbohydrates", precision: 1, maximum: 100_000 },
  { key: "totalSugarsG", label: "Total sugars", unit: "g", group: "carbohydrates", precision: 1, maximum: 100_000 },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g", group: "fats", precision: 1, maximum: 100_000 },
  { key: "monounsaturatedFatG", label: "Monounsaturated fat", unit: "g", group: "fats", precision: 1, maximum: 100_000 },
  { key: "polyunsaturatedFatG", label: "Polyunsaturated fat", unit: "g", group: "fats", precision: 1, maximum: 100_000 },
  { key: "omega3G", label: "Omega-3", unit: "g", group: "fats", precision: 2, maximum: 100_000 },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", group: "fats", precision: 0, maximum: 1_000_000 },
  { key: "vitaminAMcgRae", label: "Vitamin A", unit: "mcg", group: "vitamins", precision: 0, maximum: 10_000_000 },
  { key: "vitaminCMg", label: "Vitamin C", unit: "mg", group: "vitamins", precision: 0, maximum: 1_000_000 },
  { key: "vitaminDMcg", label: "Vitamin D", unit: "mcg", group: "vitamins", precision: 1, maximum: 100_000 },
  { key: "vitaminEMg", label: "Vitamin E", unit: "mg", group: "vitamins", precision: 1, maximum: 1_000_000 },
  { key: "vitaminKMcg", label: "Vitamin K", unit: "mcg", group: "vitamins", precision: 1, maximum: 1_000_000 },
  { key: "vitaminB6Mg", label: "Vitamin B6", unit: "mg", group: "vitamins", precision: 2, maximum: 100_000 },
  { key: "folateMcgDfe", label: "Folate", unit: "mcg", group: "vitamins", precision: 0, maximum: 1_000_000 },
  { key: "vitaminB12Mcg", label: "Vitamin B12", unit: "mcg", group: "vitamins", precision: 2, maximum: 100_000 },
  { key: "sodiumMg", label: "Sodium", unit: "mg", group: "minerals", precision: 0, maximum: 10_000_000 },
  { key: "potassiumMg", label: "Potassium", unit: "mg", group: "minerals", precision: 0, maximum: 10_000_000 },
  { key: "calciumMg", label: "Calcium", unit: "mg", group: "minerals", precision: 0, maximum: 10_000_000 },
  { key: "ironMg", label: "Iron", unit: "mg", group: "minerals", precision: 2, maximum: 100_000 },
  { key: "magnesiumMg", label: "Magnesium", unit: "mg", group: "minerals", precision: 0, maximum: 10_000_000 },
  { key: "phosphorusMg", label: "Phosphorus", unit: "mg", group: "minerals", precision: 0, maximum: 10_000_000 },
  { key: "zincMg", label: "Zinc", unit: "mg", group: "minerals", precision: 2, maximum: 100_000 },
  { key: "seleniumMcg", label: "Selenium", unit: "mcg", group: "minerals", precision: 1, maximum: 100_000 },
  { key: "caffeineMg", label: "Caffeine", unit: "mg", group: "other", precision: 0, maximum: 100_000 },
] as const satisfies readonly NutrientMetadata[];

export type NutrientValues = {
  [Key in NutrientKey]: number | null;
};

export type PartialNutrientValues = Partial<{
  [Key in NutrientKey]: number | null;
}>;

export type NutrientAggregate = {
  readonly amount: number | null;
  readonly knownItemCount: number;
  readonly totalItemCount: number;
  readonly complete: boolean;
};

export type NutrientAggregateMap = {
  [Key in NutrientKey]: NutrientAggregate;
};

export function nutrientDbColumn(key: NutrientKey): string {
  return key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

export function emptyNutrientValues(): NutrientValues {
  const values = {} as NutrientValues;
  for (const key of NUTRIENT_KEYS) values[key] = null;
  return values;
}

export function nullableNutrientValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function aggregateNutrients(items: readonly PartialNutrientValues[]): NutrientAggregateMap {
  const aggregates = {} as NutrientAggregateMap;
  for (const key of NUTRIENT_KEYS) {
    let amount = 0;
    let knownItemCount = 0;
    for (const item of items) {
      const value = item[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
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
