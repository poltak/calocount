import { NUTRIENT_META } from "@app/common/features/entries/utils/nutrients";
import { PROTEIN_GOAL_MODES } from "@app/common/features/goals/utils/daily-targets";
import {
  DEFAULT_NUTRITION_PAGE_SIZE,
  MAX_NUTRITION_PAGE_SIZE,
  MAX_NUTRITION_RANGE_DAYS,
  SOURCE_FORM_OUTPUT_KEYS,
} from "./nutrition-read-input.js";
import {
  SECURITY_SCHEMES,
  TIMEZONE_OUTPUT_DESCRIPTION,
  dailyMacroSchema,
  nullableNumberSchema,
  nutrientCoverageOutputSchema,
  nutrientCoverageSchema,
  nutrientValueOutputSchema,
  sourceFormValueOutputSchema,
  toolErrorOutput,
} from "./tool-schema-parts.js";

export const GET_NUTRITION_HISTORY_TOOL = {
  name: "get_nutrition_history",
  title: "Read Calocount nutrition history",
  description: `Read completed meal items for an inclusive date range of up to ${MAX_NUTRITION_RANGE_DAYS} days. Dates are days in the account's saved timezone, returned as timezone. Results include known and unknown nutrient values. Use the opaque next_cursor to read the next page.`,
  inputSchema: {
    type: "object",
    properties: {
      start_date: {
        type: "string",
        format: "date",
        description:
          "First date, inclusive (YYYY-MM-DD), in the account's saved timezone.",
      },
      end_date: {
        type: "string",
        format: "date",
        description:
          "Last date, inclusive (YYYY-MM-DD), in the account's saved timezone.",
      },
      page_size: {
        type: "integer",
        minimum: 1,
        maximum: MAX_NUTRITION_PAGE_SIZE,
        default: DEFAULT_NUTRITION_PAGE_SIZE,
      },
      cursor: {
        type: "string",
        maxLength: 4096,
        description:
          "Opaque next_cursor from the previous page. Keep the same dates and page_size.",
      },
    },
    required: ["start_date", "end_date"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          start_date: { type: "string", format: "date" },
          end_date: { type: "string", format: "date" },
          timezone: {
            type: "string",
            description: TIMEZONE_OUTPUT_DESCRIPTION,
          },
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                eaten_at: { type: "string", format: "date-time" },
                request_id: { type: ["string", "null"], format: "uuid" },
                meal_type: { type: ["string", "null"] },
                totals: dailyMacroSchema,
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string" },
                      caloriesKcal: { type: "number" },
                      proteinG: { type: "number" },
                      carbsG: { type: "number" },
                      fatG: { type: "number" },
                      nutrients: nutrientValueOutputSchema,
                      sourceFormAmounts: sourceFormValueOutputSchema,
                    },
                    required: [
                      "id",
                      "name",
                      "quantity",
                      "unit",
                      "caloriesKcal",
                      "proteinG",
                      "carbsG",
                      "fatG",
                      "nutrients",
                      "sourceFormAmounts",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "date",
                "eaten_at",
                "request_id",
                "meal_type",
                "totals",
                "items",
              ],
              additionalProperties: false,
            },
          },
          has_more: { type: "boolean" },
          next_cursor: { type: ["string", "null"] },
        },
        required: [
          "start_date",
          "end_date",
          "timezone",
          "meals",
          "has_more",
          "next_cursor",
        ],
        additionalProperties: false,
      },
      toolErrorOutput,
    ],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
} as const;

export const GET_NUTRITION_SUMMARY_TOOL = {
  name: "get_nutrition_summary",
  title: "Summarize Calocount nutrition",
  description: `Summarize completed meal totals by day for an inclusive date range of up to ${MAX_NUTRITION_RANGE_DAYS} days. Dates are days in the account's saved timezone, returned as timezone. Each nutrient includes recorded amount and coverage counts. currentTargets are the current settings; goalChanges lists the recorded calorie and protein goal changes.`,
  inputSchema: {
    type: "object",
    properties: {
      start_date: {
        type: "string",
        format: "date",
        description:
          "First date, inclusive (YYYY-MM-DD), in the account's saved timezone.",
      },
      end_date: {
        type: "string",
        format: "date",
        description:
          "Last date, inclusive (YYYY-MM-DD), in the account's saved timezone.",
      },
    },
    required: ["start_date", "end_date"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          timezone: {
            type: "string",
            description: TIMEZONE_OUTPUT_DESCRIPTION,
          },
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                status: { type: "string", enum: ["logged", "unlogged"] },
                mealCount: { type: "integer", minimum: 0 },
                itemCount: { type: "integer", minimum: 0 },
                totals: dailyMacroSchema,
                nutrients: nutrientCoverageOutputSchema,
                sourceFormAmounts: {
                  type: "object",
                  properties: Object.fromEntries(
                    SOURCE_FORM_OUTPUT_KEYS.map((key) => [
                      key,
                      nutrientCoverageSchema,
                    ]),
                  ),
                  required: [...SOURCE_FORM_OUTPUT_KEYS],
                  additionalProperties: false,
                },
              },
              required: [
                "date",
                "status",
                "mealCount",
                "itemCount",
                "totals",
                "nutrients",
                "sourceFormAmounts",
              ],
              additionalProperties: false,
            },
          },
          currentTargets: {
            type: "object",
            properties: {
              scope: { type: "string", const: "current_settings_only" },
              caloriesKcal: nullableNumberSchema,
              protein: {
                type: "object",
                properties: {
                  mode: { type: "string", enum: [...PROTEIN_GOAL_MODES] },
                  grams: nullableNumberSchema,
                  gramsPerKg: nullableNumberSchema,
                },
                required: ["mode", "grams", "gramsPerKg"],
                additionalProperties: false,
              },
              nutrients: {
                type: "object",
                properties: Object.fromEntries(
                  NUTRIENT_META.map((nutrient) => [
                    nutrient.key,
                    {
                      type: "object",
                      properties: {
                        value: nullableNumberSchema,
                        direction: {
                          type: "string",
                          enum: ["minimum", "maximum"],
                        },
                        source: {
                          type: "string",
                          enum: ["default", "custom", "disabled"],
                        },
                      },
                      required: ["value", "direction", "source"],
                      additionalProperties: false,
                    },
                  ]),
                ),
                required: NUTRIENT_META.map((nutrient) => nutrient.key),
                additionalProperties: false,
              },
            },
            required: ["scope", "caloriesKcal", "protein", "nutrients"],
            additionalProperties: false,
          },
          goalChanges: {
            type: "array",
            description:
              "Recorded calorie and protein goal changes, oldest first. Each entry gives the goals in effect from its date. Goals before the first entry are not known.",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                changedAt: { type: "string", format: "date-time" },
                caloriesKcal: nullableNumberSchema,
                protein: {
                  type: "object",
                  properties: {
                    mode: { type: "string", enum: [...PROTEIN_GOAL_MODES] },
                    grams: nullableNumberSchema,
                    gramsPerKg: nullableNumberSchema,
                  },
                  required: ["mode", "grams", "gramsPerKg"],
                  additionalProperties: false,
                },
              },
              required: ["date", "changedAt", "caloriesKcal", "protein"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "startDate",
          "endDate",
          "timezone",
          "days",
          "currentTargets",
          "goalChanges",
        ],
        additionalProperties: false,
      },
      toolErrorOutput,
    ],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
} as const;

export const GET_WEIGHT_HISTORY_TOOL = {
  name: "get_weight_history",
  title: "Read Calocount weight history",
  description: `Read the recorded body weights for an inclusive date range of up to ${MAX_NUTRITION_RANGE_DAYS} days, oldest first. Weights are in kilograms, at most one for each date. firstWeightDate is the earliest date with a weight, including dates before the range.`,
  inputSchema: {
    type: "object",
    properties: {
      start_date: {
        type: "string",
        format: "date",
        description: "First date, inclusive (YYYY-MM-DD).",
      },
      end_date: {
        type: "string",
        format: "date",
        description: "Last date, inclusive (YYYY-MM-DD).",
      },
    },
    required: ["start_date", "end_date"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          firstWeightDate: { type: ["string", "null"], format: "date" },
          weights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                weightKg: { type: "number" },
                recordedAt: { type: "string", format: "date-time" },
              },
              required: ["date", "weightKg", "recordedAt"],
              additionalProperties: false,
            },
          },
        },
        required: ["startDate", "endDate", "firstWeightDate", "weights"],
        additionalProperties: false,
      },
      toolErrorOutput,
    ],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
} as const;
