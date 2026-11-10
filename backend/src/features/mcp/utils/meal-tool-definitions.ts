import { NUTRIENT_META } from "@app/common/features/entries/utils/nutrients";
import { MAX_KCAL, MAX_MACRO, MAX_NAME_LENGTH } from "./limits.js";
import {
  NUTRIENT_UPPER_LIMIT_META,
  SECURITY_SCHEMES,
  nutrientInputProperties,
  nutrientProperties,
  nutrientValueOutputSchema,
  sourceFormValueOutputSchema,
  toolErrorOutput,
} from "./tool-schema-parts.js";

const mealProperties = {
  request_id: {
    type: "string",
    format: "uuid",
    description:
      "Generate a fresh UUID v4 with a code tool (for example, crypto.randomUUID() or uuid.uuid4()) when one is available. If no code tool is available, supply a fresh valid UUID v4. Reuse the ID only for an exact retry of the same meal details.",
  },
  name: {
    type: "string",
    minLength: 1,
    maxLength: MAX_NAME_LENGTH,
    description: "A short name for the meal.",
  },
  kcal: {
    type: "number",
    minimum: 0,
    maximum: MAX_KCAL,
    description: "Calories in kilocalories.",
  },
  protein: {
    type: "number",
    minimum: 0,
    maximum: MAX_MACRO,
    description: "Protein in grams.",
  },
  carbs: {
    type: "number",
    minimum: 0,
    maximum: MAX_MACRO,
    description: "Carbohydrate in grams.",
  },
  fat: {
    type: "number",
    minimum: 0,
    maximum: MAX_MACRO,
    description: "Fat in grams.",
  },
  eaten_at: {
    type: "string",
    format: "date-time",
    description:
      "Meal time as an ISO-8601 date and time with seconds and a timezone.",
  },
  nutrients: {
    type: "object",
    properties: nutrientProperties,
    additionalProperties: false,
    description:
      "Estimate every field that standard food composition data supports for this meal. Use null only when no reasonable estimate exists. Do not use 0 for unknown.",
  },
};

const mealResultSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["created", "already_exists"] },
    meal_id: { type: "string" },
    request_id: { type: "string", format: "uuid" },
    name: { type: "string" },
    kcal: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    eaten_at: { type: "string", format: "date-time" },
    has_image: { type: "boolean" },
    photo_status: { type: "string", enum: ["download_failed"] },
  },
  required: [
    "status",
    "meal_id",
    "request_id",
    "name",
    "kcal",
    "protein",
    "carbs",
    "fat",
    "eaten_at",
    "has_image",
  ],
  additionalProperties: false,
};

const dailyTotalsSchema = {
  type: "object",
  properties: {
    date: { type: "string", format: "date" },
    kcal: { type: "number" },
    protein: { type: "number" },
    meal_count: { type: "number" },
  },
  required: ["date", "kcal", "protein", "meal_count"],
  additionalProperties: false,
};

const batchOutput = {
  type: "object",
  properties: {
    status: { type: "string", const: "batch_processed" },
    created_count: { type: "number", minimum: 0, maximum: 20 },
    already_exists_count: { type: "number", minimum: 0, maximum: 20 },
    meals: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: mealResultSchema,
    },
    daily_totals: dailyTotalsSchema,
  },
  required: ["status", "created_count", "already_exists_count", "meals"],
  additionalProperties: false,
};

const updateNutrientProperties = nutrientInputProperties([
  ...NUTRIENT_META,
  ...NUTRIENT_UPPER_LIMIT_META,
]);

export const UPDATE_MEAL_TOOL = {
  name: "update_meal",
  title: "Edit a saved Calocount meal",
  description:
    "Correct a completed meal by its existing request_id. Use item IDs from get_nutrition_history for item-level corrections. This does not create a meal or change its request_id.",
  inputSchema: {
    type: "object",
    properties: {
      request_id: {
        type: "string",
        format: "uuid",
        description:
          "The original UUID request_id of the saved meal. Get it from get_nutrition_history; do not generate a new ID.",
      },
      patch: {
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: MAX_NAME_LENGTH,
            description: "New meal name.",
          },
          eaten_at: {
            type: "string",
            format: "date-time",
            description:
              "New meal time as a valid ISO-8601 date and time with a timezone.",
          },
          kcal: {
            type: "number",
            minimum: 0,
            maximum: MAX_KCAL,
            description: "New meal calorie total.",
          },
          protein: {
            type: "number",
            minimum: 0,
            maximum: MAX_MACRO,
            description: "New meal protein total in grams.",
          },
          carbs: {
            type: "number",
            minimum: 0,
            maximum: MAX_MACRO,
            description: "New meal carbohydrate total in grams.",
          },
          fat: {
            type: "number",
            minimum: 0,
            maximum: MAX_MACRO,
            description: "New meal fat total in grams.",
          },
          nutrients: {
            type: "object",
            properties: updateNutrientProperties,
            minProperties: 1,
            additionalProperties: false,
            description:
              "Partial nutrient correction for a single-item meal. Omit unchanged fields or use null when unknown.",
          },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            description:
              "Partial corrections for existing items only. Each item needs its existing id and at least one field to change.",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  minLength: 1,
                  maxLength: 120,
                  description: "Existing item ID from get_nutrition_history.",
                },
                name: {
                  type: "string",
                  minLength: 1,
                  maxLength: MAX_NAME_LENGTH,
                },
                kcal: { type: "number", minimum: 0, maximum: MAX_KCAL },
                protein: { type: "number", minimum: 0, maximum: MAX_MACRO },
                carbs: { type: "number", minimum: 0, maximum: MAX_MACRO },
                fat: { type: "number", minimum: 0, maximum: MAX_MACRO },
                nutrients: {
                  type: "object",
                  properties: updateNutrientProperties,
                  minProperties: 1,
                  additionalProperties: false,
                },
              },
              required: ["id"],
              minProperties: 2,
              additionalProperties: false,
            },
          },
        },
        minProperties: 1,
        additionalProperties: false,
      },
    },
    required: ["request_id", "patch"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          status: { type: "string", const: "updated" },
          meal_id: { type: "string" },
          request_id: { type: "string", format: "uuid" },
          name: { type: "string" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          eaten_at: { type: "string", format: "date-time" },
          has_image: { type: "boolean" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                kcal: { type: "number" },
                protein: { type: "number" },
                carbs: { type: "number" },
                fat: { type: "number" },
                nutrients: nutrientValueOutputSchema,
                sourceFormAmounts: sourceFormValueOutputSchema,
              },
              required: [
                "id",
                "name",
                "quantity",
                "unit",
                "kcal",
                "protein",
                "carbs",
                "fat",
                "nutrients",
                "sourceFormAmounts",
              ],
              additionalProperties: false,
            },
          },
        },
        required: [
          "status",
          "meal_id",
          "request_id",
          "name",
          "kcal",
          "protein",
          "carbs",
          "fat",
          "eaten_at",
          "has_image",
          "items",
        ],
        additionalProperties: false,
      },
      toolErrorOutput,
    ],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
} as const;

export const ADD_MEALS_TOOL = {
  name: "add_meals",
  title: "Add meals to Calocount",
  description:
    "Save one or more meals to the signed-in Calocount account. Estimate calories, macros and all supported nutrients that you can reasonably estimate. Before calling, generate a UUID v4 request_id for each new meal with a code tool when available. Reuse an ID only for an exact retry of the same meal.",
  inputSchema: {
    type: "object",
    properties: {
      meals: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        description:
          "Meals to save. Each meal needs its own unique request_id.",
        items: {
          type: "object",
          properties: mealProperties,
          required: [
            "request_id",
            "name",
            "kcal",
            "protein",
            "carbs",
            "fat",
            "eaten_at",
          ],
          additionalProperties: false,
        },
      },
      photos: {
        type: "array",
        minItems: 0,
        maxItems: 20,
        description:
          "Optional ChatGPT-supplied photo values. Pass them unchanged; never invent a file ID or download URL. Attach each photo to one meal with photo_meal_indices. Supported photo types: JPEG, PNG, WebP, and HEIC.",
        items: {
          type: "object",
          properties: {
            download_url: { type: "string", minLength: 1 },
            file_id: { type: "string", minLength: 1 },
            mime_type: { type: "string", minLength: 1 },
            file_name: { type: "string", minLength: 1 },
          },
          required: ["download_url", "file_id"],
          additionalProperties: false,
        },
      },
      photo_meal_indices: {
        type: "array",
        minItems: 0,
        maxItems: 20,
        description:
          "For each photo, the zero-based index of the meal that receives it. Indices must be unique and point to an item in meals.",
        items: { type: "integer", minimum: 0, maximum: 19 },
      },
    },
    required: ["meals"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [batchOutput, toolErrorOutput],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: {
    securitySchemes: SECURITY_SCHEMES,
    "openai/fileParams": ["photos"],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
} as const;
