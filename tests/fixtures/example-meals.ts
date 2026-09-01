import type { MealInput } from "../../db/repository";
import { NUTRIENT_KEYS, type NutrientKey } from "../../domain/nutrients";

type CompleteNutrients = { [Key in NutrientKey]: number };

/**
 * A complete meal item for the local dashboard fixture.
 *
 * The direct `/api/meals` request accepts these fields. Nutrient values are
 * numbers here on purpose so the fixture exercises the complete-data path.
 * Use `null` in a real request when a value is unknown.
 */
export type CompleteMealItemFixture = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  source: string;
} & CompleteNutrients;

/**
 * A complete direct `/api/meals` request body.
 *
 * Meal totals are calculated from item macros by the repository. Owner keys,
 * created/updated timestamps, and `externalRequestId` are not accepted by the
 * direct dashboard route and are therefore intentionally absent.
 */
export type CompleteMealFixture = Omit<
  Required<MealInput>,
  "assumptions" | "confidence" | "externalRequestId" | "items"
> & {
  assumptions: string[];
  confidence: number;
  items: CompleteMealItemFixture[];
};

type FoodProfile = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: number;
  source: string;
  nutrientValues: CompleteNutrients;
};

type FoodDefinition = Omit<FoodProfile, "nutrientValues"> & {
  nutrients?: Partial<CompleteNutrients>;
};

function completeNutrients(values: Partial<CompleteNutrients> = {}): CompleteNutrients {
  const result = {} as CompleteNutrients;
  for (const key of NUTRIENT_KEYS) result[key] = values[key] ?? 0;
  return result;
}

function food(definition: FoodDefinition): FoodProfile {
  const { nutrients, ...profile } = definition;
  return { ...profile, nutrientValues: completeNutrients(nutrients) };
}

/**
 * Values are representative serving estimates. They are intended for local
 * UI and test coverage, not for dietary advice or clinical use.
 */
const FOOD_PROFILES = {
  greekYogurt: food({
    name: "Plain Greek yogurt",
    quantity: 200,
    unit: "g",
    calories: 146,
    proteinG: 20.6,
    carbsG: 7.2,
    fatG: 4,
    confidence: 0.99,
    source: "fixture",
    nutrients: {
      totalSugarsG: 7.2,
      saturatedFatG: 2.6,
      monounsaturatedFatG: 1.1,
      polyunsaturatedFatG: 0.1,
      omega3G: 0.05,
      cholesterolMg: 20,
      vitaminAMcgRae: 34,
      vitaminDMcg: 0.1,
      vitaminEMg: 0.1,
      vitaminKMcg: 0.2,
      vitaminB6Mg: 0.08,
      folateMcgDfe: 14,
      vitaminB12Mcg: 1,
      sodiumMg: 80,
      potassiumMg: 280,
      calciumMg: 220,
      ironMg: 0.1,
      magnesiumMg: 22,
      phosphorusMg: 200,
      zincMg: 1.6,
      seleniumMcg: 23,
    },
  }),
  oats: food({
    name: "Rolled oats",
    quantity: 50,
    unit: "g",
    calories: 190,
    proteinG: 6.5,
    carbsG: 33.5,
    fatG: 3.5,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 5,
      totalSugarsG: 0.5,
      saturatedFatG: 0.6,
      monounsaturatedFatG: 1.1,
      polyunsaturatedFatG: 1.2,
      omega3G: 0.05,
      vitaminEMg: 0.2,
      vitaminKMcg: 1,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 18,
      sodiumMg: 2,
      potassiumMg: 165,
      calciumMg: 26,
      ironMg: 2,
      magnesiumMg: 65,
      phosphorusMg: 200,
      zincMg: 1.8,
      seleniumMcg: 17,
    },
  }),
  blueberries: food({
    name: "Blueberries",
    quantity: 100,
    unit: "g",
    calories: 57,
    proteinG: 0.7,
    carbsG: 14.5,
    fatG: 0.3,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 2.4,
      totalSugarsG: 10,
      polyunsaturatedFatG: 0.2,
      omega3G: 0.02,
      vitaminAMcgRae: 3,
      vitaminCMg: 9.7,
      vitaminEMg: 0.6,
      vitaminKMcg: 19.3,
      vitaminB6Mg: 0.05,
      folateMcgDfe: 6,
      sodiumMg: 1,
      potassiumMg: 77,
      calciumMg: 6,
      ironMg: 0.3,
      magnesiumMg: 6,
      phosphorusMg: 12,
      zincMg: 0.2,
      seleniumMcg: 0.1,
    },
  }),
  blackCoffee: food({
    name: "Black coffee",
    quantity: 240,
    unit: "ml",
    calories: 2,
    proteinG: 0.3,
    carbsG: 0,
    fatG: 0,
    confidence: 0.99,
    source: "fixture",
    nutrients: {
      folateMcgDfe: 2,
      sodiumMg: 5,
      potassiumMg: 116,
      calciumMg: 5,
      magnesiumMg: 7,
      phosphorusMg: 7,
      caffeineMg: 95,
    },
  }),
  eggs: food({
    name: "Scrambled eggs",
    quantity: 2,
    unit: "large eggs",
    calories: 144,
    proteinG: 12.6,
    carbsG: 0.7,
    fatG: 9.5,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      totalSugarsG: 0.4,
      saturatedFatG: 3.1,
      monounsaturatedFatG: 3.7,
      polyunsaturatedFatG: 1.4,
      omega3G: 0.1,
      cholesterolMg: 372,
      vitaminAMcgRae: 160,
      vitaminDMcg: 2.2,
      vitaminEMg: 1,
      vitaminKMcg: 0.3,
      vitaminB6Mg: 0.2,
      folateMcgDfe: 47,
      vitaminB12Mcg: 1.1,
      sodiumMg: 142,
      potassiumMg: 138,
      calciumMg: 56,
      ironMg: 1.8,
      magnesiumMg: 12,
      phosphorusMg: 198,
      zincMg: 1.3,
      seleniumMcg: 30,
    },
  }),
  wholegrainToast: food({
    name: "Wholegrain toast",
    quantity: 2,
    unit: "slices",
    calories: 200,
    proteinG: 8,
    carbsG: 36,
    fatG: 3,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 4,
      totalSugarsG: 3,
      saturatedFatG: 0.5,
      monounsaturatedFatG: 0.7,
      polyunsaturatedFatG: 1.2,
      omega3G: 0.1,
      vitaminEMg: 1.2,
      vitaminKMcg: 2,
      vitaminB6Mg: 0.2,
      folateMcgDfe: 60,
      vitaminB12Mcg: 0.2,
      sodiumMg: 300,
      potassiumMg: 180,
      calciumMg: 80,
      ironMg: 2,
      magnesiumMg: 60,
      phosphorusMg: 180,
      zincMg: 1.4,
      seleniumMcg: 28,
    },
  }),
  banana: food({
    name: "Banana",
    quantity: 118,
    unit: "g",
    calories: 105,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 3.1,
      totalSugarsG: 14.4,
      polyunsaturatedFatG: 0.1,
      vitaminAMcgRae: 4,
      vitaminCMg: 10.3,
      vitaminEMg: 0.1,
      vitaminKMcg: 0.6,
      vitaminB6Mg: 0.43,
      folateMcgDfe: 24,
      sodiumMg: 1,
      potassiumMg: 422,
      calciumMg: 5,
      ironMg: 0.3,
      magnesiumMg: 32,
      phosphorusMg: 26,
      zincMg: 0.2,
      seleniumMcg: 1.2,
    },
  }),
  apple: food({
    name: "Apple",
    quantity: 180,
    unit: "g",
    calories: 95,
    proteinG: 0.5,
    carbsG: 25,
    fatG: 0.3,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 4.4,
      totalSugarsG: 19,
      polyunsaturatedFatG: 0.1,
      vitaminAMcgRae: 5,
      vitaminCMg: 8.4,
      vitaminEMg: 0.3,
      vitaminKMcg: 4,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 5,
      sodiumMg: 2,
      potassiumMg: 195,
      calciumMg: 11,
      ironMg: 0.2,
      magnesiumMg: 9,
      phosphorusMg: 20,
      zincMg: 0.1,
    },
  }),
  almonds: food({
    name: "Almonds",
    quantity: 28,
    unit: "g",
    calories: 164,
    proteinG: 6,
    carbsG: 6.1,
    fatG: 14.2,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 3.5,
      totalSugarsG: 1.2,
      saturatedFatG: 1.1,
      monounsaturatedFatG: 9,
      polyunsaturatedFatG: 3.5,
      omega3G: 0.01,
      vitaminEMg: 7.3,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 14,
      potassiumMg: 208,
      calciumMg: 76,
      ironMg: 1,
      magnesiumMg: 76,
      phosphorusMg: 136,
      zincMg: 0.9,
      seleniumMcg: 1.2,
    },
  }),
  lowFatMilk: food({
    name: "Low-fat milk",
    quantity: 240,
    unit: "ml",
    calories: 122,
    proteinG: 8.2,
    carbsG: 12,
    fatG: 4.8,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      totalSugarsG: 12,
      saturatedFatG: 3,
      monounsaturatedFatG: 1.5,
      polyunsaturatedFatG: 0.2,
      cholesterolMg: 15,
      vitaminAMcgRae: 100,
      vitaminDMcg: 3,
      vitaminEMg: 0.1,
      vitaminKMcg: 0.5,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 12,
      vitaminB12Mcg: 1.2,
      sodiumMg: 107,
      potassiumMg: 366,
      calciumMg: 305,
      magnesiumMg: 27,
      phosphorusMg: 232,
      zincMg: 1,
      seleniumMcg: 9,
    },
  }),
  peanutButter: food({
    name: "Peanut butter",
    quantity: 32,
    unit: "g",
    calories: 188,
    proteinG: 8,
    carbsG: 7,
    fatG: 16,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 2,
      totalSugarsG: 3,
      saturatedFatG: 3.3,
      monounsaturatedFatG: 8,
      polyunsaturatedFatG: 4.5,
      omega3G: 0.01,
      vitaminEMg: 2.9,
      vitaminKMcg: 0.5,
      vitaminB6Mg: 0.2,
      folateMcgDfe: 29,
      sodiumMg: 152,
      potassiumMg: 208,
      calciumMg: 17,
      ironMg: 0.6,
      magnesiumMg: 55,
      phosphorusMg: 107,
      zincMg: 0.9,
      seleniumMcg: 2,
    },
  }),
  spinach: food({
    name: "Baby spinach",
    quantity: 60,
    unit: "g",
    calories: 14,
    proteinG: 1.7,
    carbsG: 2.2,
    fatG: 0.2,
    confidence: 0.96,
    source: "fixture",
    nutrients: {
      fiberG: 1.3,
      totalSugarsG: 0.2,
      polyunsaturatedFatG: 0.1,
      omega3G: 0.03,
      vitaminAMcgRae: 281,
      vitaminCMg: 17,
      vitaminEMg: 1.1,
      vitaminKMcg: 290,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 116,
      sodiumMg: 47,
      potassiumMg: 335,
      calciumMg: 59,
      ironMg: 1.6,
      magnesiumMg: 47,
      phosphorusMg: 29,
      zincMg: 0.3,
      seleniumMcg: 0.6,
    },
  }),
  orange: food({
    name: "Orange",
    quantity: 130,
    unit: "g",
    calories: 62,
    proteinG: 1.2,
    carbsG: 15.4,
    fatG: 0.2,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 3.1,
      totalSugarsG: 12.2,
      vitaminAMcgRae: 14,
      vitaminCMg: 69.7,
      vitaminEMg: 0.2,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 39,
      potassiumMg: 237,
      calciumMg: 52,
      ironMg: 0.1,
      magnesiumMg: 13,
      phosphorusMg: 18,
      zincMg: 0.1,
    },
  }),
  chickenBreast: food({
    name: "Grilled chicken breast",
    quantity: 150,
    unit: "g",
    calories: 248,
    proteinG: 46.5,
    carbsG: 0,
    fatG: 5.4,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      saturatedFatG: 1.5,
      monounsaturatedFatG: 1.7,
      polyunsaturatedFatG: 1.2,
      omega3G: 0.08,
      cholesterolMg: 128,
      vitaminAMcgRae: 10,
      vitaminDMcg: 0.2,
      vitaminEMg: 0.4,
      vitaminKMcg: 3,
      vitaminB6Mg: 0.85,
      folateMcgDfe: 6,
      vitaminB12Mcg: 0.45,
      sodiumMg: 110,
      potassiumMg: 390,
      calciumMg: 23,
      ironMg: 1,
      magnesiumMg: 44,
      phosphorusMg: 330,
      zincMg: 1.5,
      seleniumMcg: 42,
    },
  }),
  brownRice: food({
    name: "Cooked brown rice",
    quantity: 180,
    unit: "g",
    calories: 200,
    proteinG: 4.5,
    carbsG: 41.5,
    fatG: 1.6,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 3.2,
      totalSugarsG: 0.4,
      saturatedFatG: 0.3,
      monounsaturatedFatG: 0.5,
      polyunsaturatedFatG: 0.5,
      omega3G: 0.02,
      vitaminEMg: 0.3,
      vitaminKMcg: 0.5,
      vitaminB6Mg: 0.25,
      folateMcgDfe: 9,
      sodiumMg: 2,
      potassiumMg: 160,
      calciumMg: 16,
      ironMg: 0.8,
      magnesiumMg: 78,
      phosphorusMg: 180,
      zincMg: 1.4,
      seleniumMcg: 13,
    },
  }),
  avocado: food({
    name: "Avocado",
    quantity: 80,
    unit: "g",
    calories: 128,
    proteinG: 1.6,
    carbsG: 6.8,
    fatG: 11.8,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 5.4,
      totalSugarsG: 0.5,
      saturatedFatG: 1.7,
      monounsaturatedFatG: 7.8,
      polyunsaturatedFatG: 1.4,
      omega3G: 0.09,
      vitaminAMcgRae: 6,
      vitaminCMg: 8,
      vitaminEMg: 1.7,
      vitaminKMcg: 16.8,
      vitaminB6Mg: 0.21,
      folateMcgDfe: 65,
      sodiumMg: 6,
      potassiumMg: 388,
      calciumMg: 10,
      ironMg: 0.4,
      magnesiumMg: 23,
      phosphorusMg: 42,
      zincMg: 0.4,
      seleniumMcg: 0.4,
    },
  }),
  mixedGreens: food({
    name: "Mixed leafy greens",
    quantity: 60,
    unit: "g",
    calories: 12,
    proteinG: 1.2,
    carbsG: 2,
    fatG: 0.2,
    confidence: 0.96,
    source: "fixture",
    nutrients: {
      fiberG: 1.2,
      totalSugarsG: 0.4,
      polyunsaturatedFatG: 0.1,
      omega3G: 0.08,
      vitaminAMcgRae: 270,
      vitaminCMg: 18,
      vitaminEMg: 0.8,
      vitaminKMcg: 240,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 70,
      sodiumMg: 35,
      potassiumMg: 220,
      calciumMg: 75,
      ironMg: 1,
      magnesiumMg: 20,
      phosphorusMg: 25,
      zincMg: 0.2,
      seleniumMcg: 0.6,
    },
  }),
  salmon: food({
    name: "Baked salmon",
    quantity: 170,
    unit: "g",
    calories: 350,
    proteinG: 37,
    carbsG: 0,
    fatG: 21,
    confidence: 0.99,
    source: "fixture",
    nutrients: {
      saturatedFatG: 4,
      monounsaturatedFatG: 6,
      polyunsaturatedFatG: 5,
      omega3G: 3.4,
      cholesterolMg: 110,
      vitaminAMcgRae: 48,
      vitaminDMcg: 17,
      vitaminEMg: 3.5,
      vitaminKMcg: 0.5,
      vitaminB6Mg: 0.9,
      folateMcgDfe: 9,
      vitaminB12Mcg: 5,
      sodiumMg: 100,
      potassiumMg: 700,
      calciumMg: 20,
      ironMg: 0.6,
      magnesiumMg: 48,
      phosphorusMg: 420,
      zincMg: 1.1,
      seleniumMcg: 55,
    },
  }),
  quinoa: food({
    name: "Cooked quinoa",
    quantity: 185,
    unit: "g",
    calories: 222,
    proteinG: 8,
    carbsG: 39.4,
    fatG: 3.6,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 5.2,
      totalSugarsG: 1.6,
      saturatedFatG: 0.4,
      monounsaturatedFatG: 1,
      polyunsaturatedFatG: 1.9,
      omega3G: 0.08,
      vitaminEMg: 1.2,
      vitaminB6Mg: 0.2,
      folateMcgDfe: 78,
      sodiumMg: 13,
      potassiumMg: 318,
      calciumMg: 31,
      ironMg: 2.8,
      magnesiumMg: 118,
      phosphorusMg: 281,
      zincMg: 2,
      seleniumMcg: 5.2,
    },
  }),
  broccoli: food({
    name: "Steamed broccoli",
    quantity: 150,
    unit: "g",
    calories: 52,
    proteinG: 3.6,
    carbsG: 10.8,
    fatG: 0.6,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 5,
      totalSugarsG: 2.5,
      saturatedFatG: 0.1,
      monounsaturatedFatG: 0.1,
      polyunsaturatedFatG: 0.2,
      omega3G: 0.1,
      vitaminAMcgRae: 80,
      vitaminCMg: 100,
      vitaminEMg: 1.5,
      vitaminKMcg: 180,
      vitaminB6Mg: 0.3,
      folateMcgDfe: 90,
      sodiumMg: 55,
      potassiumMg: 460,
      calciumMg: 70,
      ironMg: 1,
      magnesiumMg: 35,
      phosphorusMg: 110,
      zincMg: 0.8,
      seleniumMcg: 3,
    },
  }),
  tofu: food({
    name: "Firm tofu",
    quantity: 150,
    unit: "g",
    calories: 180,
    proteinG: 19,
    carbsG: 4,
    fatG: 11,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 2,
      totalSugarsG: 1,
      saturatedFatG: 1.6,
      monounsaturatedFatG: 2.4,
      polyunsaturatedFatG: 6.2,
      omega3G: 0.3,
      vitaminEMg: 0.3,
      vitaminKMcg: 20,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 35,
      sodiumMg: 20,
      potassiumMg: 300,
      calciumMg: 250,
      ironMg: 4,
      magnesiumMg: 75,
      phosphorusMg: 250,
      zincMg: 2,
      seleniumMcg: 15,
    },
  }),
  edamame: food({
    name: "Shelled edamame",
    quantity: 100,
    unit: "g",
    calories: 121,
    proteinG: 12,
    carbsG: 9,
    fatG: 5,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 5.2,
      totalSugarsG: 2.2,
      saturatedFatG: 0.6,
      monounsaturatedFatG: 1.2,
      polyunsaturatedFatG: 2.1,
      omega3G: 0.36,
      vitaminAMcgRae: 9,
      vitaminCMg: 6,
      vitaminEMg: 1.2,
      vitaminKMcg: 26,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 311,
      sodiumMg: 6,
      potassiumMg: 436,
      calciumMg: 63,
      ironMg: 2.3,
      magnesiumMg: 64,
      phosphorusMg: 169,
      zincMg: 1.4,
      seleniumMcg: 1.4,
    },
  }),
  tuna: food({
    name: "Tuna canned in water",
    quantity: 120,
    unit: "g",
    calories: 132,
    proteinG: 29,
    carbsG: 0,
    fatG: 1,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      saturatedFatG: 0.3,
      monounsaturatedFatG: 0.2,
      polyunsaturatedFatG: 0.2,
      omega3G: 0.2,
      cholesterolMg: 43,
      vitaminAMcgRae: 18,
      vitaminDMcg: 3,
      vitaminEMg: 0.2,
      vitaminB6Mg: 0.3,
      folateMcgDfe: 3,
      vitaminB12Mcg: 2.4,
      sodiumMg: 360,
      potassiumMg: 350,
      calciumMg: 12,
      ironMg: 1.1,
      magnesiumMg: 35,
      phosphorusMg: 300,
      zincMg: 0.8,
      seleniumMcg: 80,
    },
  }),
  chickpeas: food({
    name: "Cooked chickpeas",
    quantity: 165,
    unit: "g",
    calories: 269,
    proteinG: 14.5,
    carbsG: 45,
    fatG: 4.2,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 12.5,
      totalSugarsG: 8,
      saturatedFatG: 0.4,
      monounsaturatedFatG: 1,
      polyunsaturatedFatG: 1.9,
      omega3G: 0.04,
      vitaminAMcgRae: 2,
      vitaminCMg: 2.1,
      vitaminEMg: 0.6,
      vitaminKMcg: 4,
      vitaminB6Mg: 0.2,
      folateMcgDfe: 282,
      sodiumMg: 11,
      potassiumMg: 477,
      calciumMg: 80,
      ironMg: 4.7,
      magnesiumMg: 78,
      phosphorusMg: 276,
      zincMg: 2.5,
      seleniumMcg: 6,
    },
  }),
  tomato: food({
    name: "Tomato",
    quantity: 150,
    unit: "g",
    calories: 27,
    proteinG: 1.3,
    carbsG: 5.8,
    fatG: 0.3,
    confidence: 0.96,
    source: "fixture",
    nutrients: {
      fiberG: 1.8,
      totalSugarsG: 3.9,
      polyunsaturatedFatG: 0.1,
      omega3G: 0.01,
      vitaminAMcgRae: 75,
      vitaminCMg: 20,
      vitaminEMg: 0.7,
      vitaminKMcg: 10,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 22,
      sodiumMg: 6,
      potassiumMg: 356,
      calciumMg: 15,
      ironMg: 0.4,
      magnesiumMg: 17,
      phosphorusMg: 36,
      zincMg: 0.2,
      seleniumMcg: 0.4,
    },
  }),
  turkeyBreast: food({
    name: "Roasted turkey breast",
    quantity: 150,
    unit: "g",
    calories: 203,
    proteinG: 43.5,
    carbsG: 0,
    fatG: 2.3,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      saturatedFatG: 0.7,
      monounsaturatedFatG: 0.7,
      polyunsaturatedFatG: 0.4,
      omega3G: 0.02,
      cholesterolMg: 90,
      vitaminAMcgRae: 3,
      vitaminDMcg: 0.2,
      vitaminEMg: 0.2,
      vitaminKMcg: 2,
      vitaminB6Mg: 0.8,
      folateMcgDfe: 7,
      vitaminB12Mcg: 0.4,
      sodiumMg: 100,
      potassiumMg: 390,
      calciumMg: 20,
      ironMg: 1.3,
      magnesiumMg: 43,
      phosphorusMg: 300,
      zincMg: 2.4,
      seleniumMcg: 43,
    },
  }),
  sweetPotato: food({
    name: "Baked sweet potato",
    quantity: 200,
    unit: "g",
    calories: 180,
    proteinG: 4,
    carbsG: 41,
    fatG: 0.3,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      fiberG: 6.6,
      totalSugarsG: 13,
      polyunsaturatedFatG: 0.1,
      omega3G: 0.01,
      vitaminAMcgRae: 1800,
      vitaminCMg: 40,
      vitaminEMg: 1.5,
      vitaminKMcg: 6,
      vitaminB6Mg: 0.6,
      folateMcgDfe: 12,
      sodiumMg: 72,
      potassiumMg: 950,
      calciumMg: 76,
      ironMg: 1.4,
      magnesiumMg: 54,
      phosphorusMg: 130,
      zincMg: 0.8,
      seleniumMcg: 1.2,
    },
  }),
  lentils: food({
    name: "Cooked lentils",
    quantity: 180,
    unit: "g",
    calories: 209,
    proteinG: 16,
    carbsG: 36,
    fatG: 0.7,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      fiberG: 15.6,
      totalSugarsG: 3.6,
      saturatedFatG: 0.1,
      monounsaturatedFatG: 0.1,
      polyunsaturatedFatG: 0.3,
      omega3G: 0.04,
      vitaminCMg: 3,
      vitaminEMg: 0.1,
      vitaminKMcg: 3,
      vitaminB6Mg: 0.4,
      folateMcgDfe: 358,
      sodiumMg: 4,
      potassiumMg: 731,
      calciumMg: 35,
      ironMg: 6.6,
      magnesiumMg: 71,
      phosphorusMg: 356,
      zincMg: 2.5,
      seleniumMcg: 5,
    },
  }),
  leanBeef: food({
    name: "Lean beef strips",
    quantity: 150,
    unit: "g",
    calories: 330,
    proteinG: 39,
    carbsG: 0,
    fatG: 18,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      saturatedFatG: 7.2,
      monounsaturatedFatG: 7.8,
      polyunsaturatedFatG: 0.7,
      omega3G: 0.05,
      cholesterolMg: 120,
      vitaminEMg: 0.3,
      vitaminKMcg: 4,
      vitaminB6Mg: 0.5,
      folateMcgDfe: 10,
      vitaminB12Mcg: 3.6,
      sodiumMg: 90,
      potassiumMg: 450,
      calciumMg: 18,
      ironMg: 3.6,
      magnesiumMg: 30,
      phosphorusMg: 315,
      zincMg: 8,
      seleniumMcg: 40,
    },
  }),
  shrimp: food({
    name: "Cooked shrimp",
    quantity: 150,
    unit: "g",
    calories: 149,
    proteinG: 36,
    carbsG: 0.4,
    fatG: 0.4,
    confidence: 0.97,
    source: "fixture",
    nutrients: {
      saturatedFatG: 0.1,
      monounsaturatedFatG: 0.1,
      polyunsaturatedFatG: 0.1,
      omega3G: 0.3,
      cholesterolMg: 255,
      vitaminAMcgRae: 90,
      vitaminCMg: 4,
      vitaminEMg: 2,
      vitaminB6Mg: 0.1,
      folateMcgDfe: 7,
      vitaminB12Mcg: 1.8,
      sodiumMg: 220,
      potassiumMg: 430,
      calciumMg: 110,
      ironMg: 0.5,
      magnesiumMg: 55,
      phosphorusMg: 350,
      zincMg: 2.5,
      seleniumMcg: 70,
    },
  }),
  cod: food({
    name: "Baked cod",
    quantity: 170,
    unit: "g",
    calories: 179,
    proteinG: 39,
    carbsG: 0,
    fatG: 1.5,
    confidence: 0.98,
    source: "fixture",
    nutrients: {
      saturatedFatG: 0.3,
      monounsaturatedFatG: 0.2,
      polyunsaturatedFatG: 0.2,
      omega3G: 0.1,
      cholesterolMg: 100,
      vitaminAMcgRae: 10,
      vitaminDMcg: 1.5,
      vitaminEMg: 0.3,
      vitaminB6Mg: 0.4,
      folateMcgDfe: 8,
      vitaminB12Mcg: 1.8,
      sodiumMg: 120,
      potassiumMg: 750,
      calciumMg: 25,
      ironMg: 0.3,
      magnesiumMg: 50,
      phosphorusMg: 390,
      zincMg: 0.6,
      seleniumMcg: 45,
    },
  }),
} as const satisfies Record<string, FoodProfile>;

type FoodKey = keyof typeof FOOD_PROFILES;

function item(id: string, foodKey: FoodKey): CompleteMealItemFixture {
  const { nutrientValues, ...profile } = FOOD_PROFILES[foodKey];
  return { id, ...profile, ...nutrientValues };
}

type MealSlot = "breakfast" | "lunch" | "dinner";

type MealTemplate = {
  slug: string;
  time: string;
  caption: string;
  mealType: MealSlot;
  foods: readonly FoodKey[];
  notes: string;
};

type DayPlan = Record<MealSlot, MealTemplate>;

const WEEK_PLANS: readonly DayPlan[] = [
  {
    breakfast: {
      slug: "eggs-toast-orange",
      time: "07:30:00",
      caption: "Scrambled eggs, wholegrain toast and orange",
      mealType: "breakfast",
      foods: ["eggs", "wholegrainToast", "orange"],
      notes: "Complete breakfast fixture with eggs, whole grains and citrus.",
    },
    lunch: {
      slug: "chicken-rice-avocado-greens",
      time: "12:30:00",
      caption: "Chicken, brown rice, avocado and greens",
      mealType: "lunch",
      foods: ["chickenBreast", "brownRice", "avocado", "mixedGreens"],
      notes: "Complete lunch fixture with lean protein, whole grains and vegetables.",
    },
    dinner: {
      slug: "salmon-quinoa-broccoli",
      time: "19:00:00",
      caption: "Salmon, quinoa and steamed broccoli",
      mealType: "dinner",
      foods: ["salmon", "quinoa", "broccoli"],
      notes: "Complete dinner fixture with oily fish, quinoa and cruciferous vegetables.",
    },
  },
  {
    breakfast: {
      slug: "yogurt-oats-berries-coffee",
      time: "07:30:00",
      caption: "Greek yogurt, oats, berries and coffee",
      mealType: "breakfast",
      foods: ["greekYogurt", "oats", "blueberries", "blackCoffee"],
      notes: "Complete breakfast fixture with dairy, oats, fruit and coffee.",
    },
    lunch: {
      slug: "tofu-quinoa-edamame-greens",
      time: "12:30:00",
      caption: "Tofu, quinoa, edamame and greens",
      mealType: "lunch",
      foods: ["tofu", "quinoa", "edamame", "mixedGreens"],
      notes: "Complete lunch fixture with plant protein and leafy greens.",
    },
    dinner: {
      slug: "beef-sweet-potato-spinach",
      time: "19:00:00",
      caption: "Lean beef, sweet potato and spinach",
      mealType: "dinner",
      foods: ["leanBeef", "sweetPotato", "spinach"],
      notes: "Complete dinner fixture with iron-rich beef and vegetables.",
    },
  },
  {
    breakfast: {
      slug: "oats-milk-banana-peanut-butter",
      time: "07:30:00",
      caption: "Oats, milk, banana and peanut butter",
      mealType: "breakfast",
      foods: ["oats", "lowFatMilk", "banana", "peanutButter"],
      notes: "Complete breakfast fixture with oats, fruit and nut butter.",
    },
    lunch: {
      slug: "tuna-chickpea-tomato-salad",
      time: "12:30:00",
      caption: "Tuna, chickpeas, tomato and greens",
      mealType: "lunch",
      foods: ["tuna", "chickpeas", "tomato", "mixedGreens"],
      notes: "Complete lunch fixture with fish, legumes and salad vegetables.",
    },
    dinner: {
      slug: "shrimp-rice-broccoli",
      time: "19:00:00",
      caption: "Shrimp, brown rice and broccoli",
      mealType: "dinner",
      foods: ["shrimp", "brownRice", "broccoli"],
      notes: "Complete dinner fixture with seafood, rice and broccoli.",
    },
  },
  {
    breakfast: {
      slug: "eggs-avocado-toast-coffee",
      time: "07:30:00",
      caption: "Eggs, avocado toast and coffee",
      mealType: "breakfast",
      foods: ["eggs", "avocado", "wholegrainToast", "blackCoffee"],
      notes: "Complete breakfast fixture with eggs, avocado and coffee.",
    },
    lunch: {
      slug: "turkey-quinoa-spinach",
      time: "12:30:00",
      caption: "Turkey, quinoa and spinach",
      mealType: "lunch",
      foods: ["turkeyBreast", "quinoa", "spinach"],
      notes: "Complete lunch fixture with turkey, quinoa and leafy greens.",
    },
    dinner: {
      slug: "tofu-sweet-potato-broccoli",
      time: "19:00:00",
      caption: "Tofu, sweet potato and broccoli",
      mealType: "dinner",
      foods: ["tofu", "sweetPotato", "broccoli"],
      notes: "Complete dinner fixture with tofu and colourful vegetables.",
    },
  },
  {
    breakfast: {
      slug: "yogurt-berries-banana-almonds",
      time: "07:30:00",
      caption: "Greek yogurt, berries, banana and almonds",
      mealType: "breakfast",
      foods: ["greekYogurt", "blueberries", "banana", "almonds"],
      notes: "Complete breakfast fixture with yogurt, fruit and almonds.",
    },
    lunch: {
      slug: "salmon-sweet-potato-greens",
      time: "12:30:00",
      caption: "Salmon, sweet potato and greens",
      mealType: "lunch",
      foods: ["salmon", "sweetPotato", "mixedGreens"],
      notes: "Complete lunch fixture with salmon, sweet potato and salad greens.",
    },
    dinner: {
      slug: "chicken-rice-spinach-tomato",
      time: "19:00:00",
      caption: "Chicken, brown rice, spinach and tomato",
      mealType: "dinner",
      foods: ["chickenBreast", "brownRice", "spinach", "tomato"],
      notes: "Complete dinner fixture with chicken, rice and vegetables.",
    },
  },
  {
    breakfast: {
      slug: "oats-milk-apple-almonds",
      time: "07:30:00",
      caption: "Oats, milk, apple and almonds",
      mealType: "breakfast",
      foods: ["oats", "lowFatMilk", "apple", "almonds"],
      notes: "Complete breakfast fixture with oats, milk, fruit and almonds.",
    },
    lunch: {
      slug: "lentils-quinoa-broccoli-avocado",
      time: "12:30:00",
      caption: "Lentils, quinoa, broccoli and avocado",
      mealType: "lunch",
      foods: ["lentils", "quinoa", "broccoli", "avocado"],
      notes: "Complete lunch fixture with legumes, quinoa and vegetables.",
    },
    dinner: {
      slug: "cod-sweet-potato-greens",
      time: "19:00:00",
      caption: "Cod, sweet potato and greens",
      mealType: "dinner",
      foods: ["cod", "sweetPotato", "mixedGreens"],
      notes: "Complete dinner fixture with white fish, sweet potato and greens.",
    },
  },
  {
    breakfast: {
      slug: "yogurt-oats-berries-coffee",
      time: "07:30:00",
      caption: "Greek yogurt, oats, berries and coffee",
      mealType: "breakfast",
      foods: ["greekYogurt", "oats", "blueberries", "blackCoffee"],
      notes: "Complete breakfast fixture with dairy, oats, fruit and coffee.",
    },
    lunch: {
      slug: "beef-rice-broccoli-spinach",
      time: "12:30:00",
      caption: "Lean beef, brown rice, broccoli and spinach",
      mealType: "lunch",
      foods: ["leanBeef", "brownRice", "broccoli", "spinach"],
      notes: "Complete lunch fixture with beef, rice and green vegetables.",
    },
    dinner: {
      slug: "chickpeas-quinoa-tomato-greens",
      time: "19:00:00",
      caption: "Chickpeas, quinoa, tomato and greens",
      mealType: "dinner",
      foods: ["chickpeas", "quinoa", "tomato", "mixedGreens"],
      notes: "Complete dinner fixture with chickpeas, quinoa and salad vegetables.",
    },
  },
];

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})$/u;

function parseLocalDate(value: string): { year: number; month: number; day: number } {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid fixture anchor date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    throw new Error(`Invalid fixture anchor date: ${value}`);
  }
  return { year, month, day };
}

function shiftLogicalDate(logicalDate: string, offsetDays: number): string {
  const { year, month, day } = parseLocalDate(logicalDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays, 12));
  return shifted.toISOString().slice(0, 10);
}

function localDateTimeParts(logicalDate: string, time: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const date = parseLocalDate(logicalDate);
  const match = LOCAL_TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid fixture time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Invalid fixture time: ${time}`);
  return { ...date, hour, minute, second };
}

function formatterForTimezone(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
}

function timezoneOffsetMs(formatter: Intl.DateTimeFormat, timestampMs: number): number {
  const parts = formatter.formatToParts(new Date(timestampMs));
  const representedUtc = Date.UTC(
    partNumber(parts, "year"),
    partNumber(parts, "month") - 1,
    partNumber(parts, "day"),
    partNumber(parts, "hour"),
    partNumber(parts, "minute"),
    partNumber(parts, "second"),
  );
  return representedUtc - timestampMs;
}

function timestampForLocalDateTime(logicalDate: string, time: string, timezone: string): number {
  const { year, month, day, hour, minute, second } = localDateTimeParts(logicalDate, time);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = formatterForTimezone(timezone);
  let candidate = targetUtc;
  // Two passes handle ordinary timezone offsets and DST transitions.
  for (let pass = 0; pass < 3; pass += 1) {
    candidate = targetUtc - timezoneOffsetMs(formatter, candidate);
  }
  if (!Number.isFinite(candidate)) throw new Error(`Invalid fixture timestamp for ${logicalDate} ${time}`);
  return candidate;
}

function weekday(logicalDate: string): number {
  const { year, month, day } = parseLocalDate(logicalDate);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export type BuildCompleteMealFixturesOptions = {
  /** The final logical date in the seven-day fixture window, in YYYY-MM-DD. */
  anchorDate: string;
  /** IANA timezone used to turn each logical date and meal time into a timestamp. */
  timezone?: string;
};

/**
 * Build three complete meals for each of the seven logical dates ending at
 * `anchorDate`. IDs include the logical date, so seeding another date range
 * does not collide with an existing fixture window.
 */
export function buildCompleteMealFixtures({
  anchorDate,
  timezone = "Asia/Ho_Chi_Minh",
}: BuildCompleteMealFixturesOptions): CompleteMealFixture[] {
  const plans = [] as CompleteMealFixture[];
  for (let offset = -6; offset <= 0; offset += 1) {
    const logicalDate = shiftLogicalDate(anchorDate, offset);
    const plan = WEEK_PLANS[weekday(logicalDate)];
    if (!plan) throw new Error(`No fixture plan for ${logicalDate}`);
    for (const slot of ["breakfast", "lunch", "dinner"] as const) {
      const template = plan[slot];
      const mealId = `fixture-meal-${logicalDate}-${template.slug}`;
      plans.push({
        id: mealId,
        consumedAt: timestampForLocalDateTime(logicalDate, template.time, timezone),
        source: "fixture",
        caption: template.caption,
        mealType: template.mealType,
        status: "complete",
        photoKey: null,
        photoMimeType: null,
        photoSizeBytes: null,
        confidence: 0.98,
        assumptions: ["Representative portions for local dashboard testing."],
        notes: template.notes,
        items: template.foods.map((foodKey) => item(`${mealId}-item-${foodKey}`, foodKey)),
      });
    }
  }
  return plans;
}

export const EXAMPLE_MEAL_DATE = "2026-09-01";

/** Stable examples for tests and local dashboard seeding. */
export const EXAMPLE_MEALS = buildCompleteMealFixtures({ anchorDate: EXAMPLE_MEAL_DATE });

/** Keep this export close to the fixture so a completeness test cannot drift. */
export const EXAMPLE_NUTRIENT_KEYS = NUTRIENT_KEYS;
