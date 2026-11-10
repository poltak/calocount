import {
  NUTRIENT_META,
  NUTRIENT_UPPER_LIMIT_KEYS,
} from "@app/common/features/entries/utils/nutrients";
import { SOURCE_FORM_OUTPUT_KEYS } from "./nutrition-read-input.js";

export const SECURITY_SCHEMES = [{ type: "oauth2", scopes: [] }] as const;

interface NutrientInputMetadata {
  key: string;
  label: string;
  unit: string;
  maximum: number;
}

/**
 * The amount of one source or form of a nutrient that an agent can send. The
 * largest value of each is the one that the old app accepted.
 */
export const NUTRIENT_UPPER_LIMIT_META = [
  {
    key: "preformedVitaminAMcgRae",
    label: "Preformed vitamin A",
    unit: "mcg",
    maximum: 10_000_000,
  },
  {
    key: "supplementalMagnesiumMg",
    label: "Supplemental magnesium",
    unit: "mg",
    maximum: 10_000_000,
  },
  { key: "folicAcidMcg", label: "Folic acid", unit: "mcg", maximum: 1_000_000 },
  {
    key: "supplementalVitaminEMg",
    label: "Supplemental vitamin E",
    unit: "mg",
    maximum: 1_000_000,
  },
] as const satisfies readonly (NutrientInputMetadata & {
  key: (typeof NUTRIENT_UPPER_LIMIT_KEYS)[number];
})[];

export function nutrientInputProperties(
  nutrients: readonly NutrientInputMetadata[],
) {
  return Object.fromEntries(
    nutrients.map((nutrient) => [
      nutrient.key,
      {
        type: ["number", "null"],
        minimum: 0,
        maximum: nutrient.maximum,
        description: `${nutrient.label} in ${nutrient.unit}. Use null only when no reasonable estimate exists.`,
      },
    ]),
  );
}

export const nutrientProperties = nutrientInputProperties(NUTRIENT_META);

export const toolErrorOutput = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
      required: ["code", "message"],
      additionalProperties: false,
    },
  },
  required: ["error"],
  additionalProperties: false,
};

export const nullableNumberSchema = { type: ["number", "null"] };
export const nutrientValueOutputSchema = {
  type: "object",
  properties: Object.fromEntries(
    NUTRIENT_META.map((nutrient) => [nutrient.key, nullableNumberSchema]),
  ),
  required: NUTRIENT_META.map((nutrient) => nutrient.key),
  additionalProperties: false,
};
export const sourceFormValueOutputSchema = {
  type: "object",
  properties: Object.fromEntries(
    SOURCE_FORM_OUTPUT_KEYS.map((key) => [key, nullableNumberSchema]),
  ),
  required: [...SOURCE_FORM_OUTPUT_KEYS],
  additionalProperties: false,
};
export const nutrientCoverageSchema = {
  type: "object",
  properties: {
    recordedAmount: nullableNumberSchema,
    knownItemCount: { type: "integer", minimum: 0 },
    totalItemCount: { type: "integer", minimum: 0 },
    complete: { type: "boolean" },
  },
  required: ["recordedAmount", "knownItemCount", "totalItemCount", "complete"],
  additionalProperties: false,
};
const nutrientCoverageProperties = Object.fromEntries(
  NUTRIENT_META.map((nutrient) => [nutrient.key, nutrientCoverageSchema]),
);
export const nutrientCoverageOutputSchema = {
  type: "object",
  properties: nutrientCoverageProperties,
  required: Object.keys(nutrientCoverageProperties),
  additionalProperties: false,
};
export const dailyMacroSchema = {
  type: "object",
  properties: {
    caloriesKcal: { type: "number" },
    proteinG: { type: "number" },
    carbsG: { type: "number" },
    fatG: { type: "number" },
  },
  required: ["caloriesKcal", "proteinG", "carbsG", "fatG"],
  additionalProperties: false,
};

export const TIMEZONE_OUTPUT_DESCRIPTION =
  "The account's saved IANA timezone. It sets the day boundaries of every date in this result.";
