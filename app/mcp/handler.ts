import {
  INVALID_PARAMS,
  ProtocolError,
  Server,
  WebStandardStreamableHTTPServerTransport,
  type Tool,
} from "@modelcontextprotocol/server";
import { NUTRIENT_META, NUTRIENT_UPPER_LIMIT_META } from "../../domain/nutrients";
import { PROTEIN_GOAL_MODES } from "../../domain/protein-goals";
import type { MealWithItems, NutritionHistoryPage, NutritionSummaryReport } from "../../db/repository";
import {
  AddMealRequestError,
  MAX_BATCH_MEALS,
  MAX_KCAL,
  MAX_MACRO,
  MAX_NAME_LENGTH,
  normalizeExternalMealPhotoType,
} from "../api/_lib/add-meal";
import {
  DEFAULT_NUTRITION_PAGE_SIZE,
  MAX_NUTRITION_PAGE_SIZE,
  MAX_NUTRITION_RANGE_DAYS,
  NutritionReadInputError,
  encodeNutritionHistoryCursor,
  parseNutritionHistoryInput,
  parseNutritionSummaryInput,
  SOURCE_FORM_OUTPUT_KEYS,
} from "./nutrition-read";
import {
  MealUpdateInputError,
  mcpUpdatedMealPayload,
  parseMcpMealUpdateInput,
  type McpMealUpdateInput,
} from "./meal-update";
import { readBoundedBytes } from "../api/_lib/bounded-read";
import { hasOnlyKeys, isObject, type JsonObject } from "./objects";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

const SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"];
const MAX_BODY_BYTES = 1_000_000;
const SECURITY_SCHEMES = [{ type: "oauth2", scopes: [] }] as const;
const SERVER_INSTRUCTIONS = "Dates are inclusive UTC. Use get_nutrition_summary for totals and get_nutrition_history for request_id and item IDs. Estimate macros before logging. Call add_meals only when asked to log a meal; use a new UUID v4 per meal, reuse only for exact add retries. Call update_meal only when asked to edit; keep the saved request_id. Pass supplied photo values unchanged in photos with photo_meal_indices. Never invent file IDs or URLs. Photos: JPEG, PNG, WebP, HEIC. Report photos only when has_image is true.";
type McpIdentity = { ownerKey: string };

export type McpHandlerDependencies = {
  authorize: (request: Request) => Promise<McpIdentity>;
  addMeals: (ownerKey: string, body: JsonObject) => Promise<Response>;
  updateMeal: (ownerKey: string, input: McpMealUpdateInput) => Promise<MealWithItems | null>;
  getNutritionHistory: (ownerKey: string, input: Awaited<ReturnType<typeof parseNutritionHistoryInput>>) => Promise<NutritionHistoryPage>;
  getNutritionSummary: (ownerKey: string, input: ReturnType<typeof parseNutritionSummaryInput>) => Promise<NutritionSummaryReport>;
};

function nutrientInputProperties(
  nutrients: ReadonlyArray<{ key: string; label: string; unit: string; maximum: number }>,
) {
  return Object.fromEntries(nutrients.map((nutrient) => [
    nutrient.key,
    {
      type: ["number", "null"],
      minimum: 0,
      maximum: nutrient.maximum,
      description: `${nutrient.label} in ${nutrient.unit}. Use null when the value is unknown.`,
    },
  ]));
}

const nutrientProperties = nutrientInputProperties(NUTRIENT_META);

const mealProperties = {
  request_id: {
    type: "string",
    format: "uuid",
    description: "Generate a fresh UUID v4 with a code tool (for example, crypto.randomUUID() or uuid.uuid4()) when one is available. If no code tool is available, supply a fresh valid UUID v4. Reuse the ID only for an exact retry of the same meal details.",
  },
  name: {
    type: "string",
    minLength: 1,
    maxLength: MAX_NAME_LENGTH,
    description: "A short name for the meal.",
  },
  kcal: { type: "number", minimum: 0, maximum: MAX_KCAL, description: "Calories in kilocalories." },
  protein: { type: "number", minimum: 0, maximum: MAX_MACRO, description: "Protein in grams." },
  carbs: { type: "number", minimum: 0, maximum: MAX_MACRO, description: "Carbohydrate in grams." },
  fat: { type: "number", minimum: 0, maximum: MAX_MACRO, description: "Fat in grams." },
  eaten_at: {
    type: "string",
    format: "date-time",
    description: "Meal time as an ISO-8601 date and time with seconds and a timezone.",
  },
  nutrients: {
    type: "object",
    properties: nutrientProperties,
    additionalProperties: false,
    description: "Optional nutrient values. Omit unknown fields or set a field to null.",
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
  required: ["status", "meal_id", "request_id", "name", "kcal", "protein", "carbs", "fat", "eaten_at", "has_image"],
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
    meals: { type: "array", minItems: 1, maxItems: 20, items: mealResultSchema },
    daily_totals: dailyTotalsSchema,
  },
  required: ["status", "created_count", "already_exists_count", "meals"],
  additionalProperties: false,
};

const toolErrorOutput = {
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

const nullableNumberSchema = { type: ["number", "null"] };
const nutrientValueOutputSchema = {
  type: "object",
  properties: Object.fromEntries(NUTRIENT_META.map((nutrient) => [nutrient.key, nullableNumberSchema])),
  required: NUTRIENT_META.map((nutrient) => nutrient.key),
  additionalProperties: false,
};
const sourceFormValueOutputSchema = {
  type: "object",
  properties: Object.fromEntries(SOURCE_FORM_OUTPUT_KEYS.map((key) => [key, nullableNumberSchema])),
  required: [...SOURCE_FORM_OUTPUT_KEYS],
  additionalProperties: false,
};
const nutrientCoverageSchema = {
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
const nutrientCoverageProperties = Object.fromEntries(NUTRIENT_META.map((nutrient) => [nutrient.key, nutrientCoverageSchema]));
const nutrientCoverageOutputSchema = {
  type: "object",
  properties: nutrientCoverageProperties,
  required: Object.keys(nutrientCoverageProperties),
  additionalProperties: false,
};
const dailyMacroSchema = {
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

const GET_NUTRITION_HISTORY_TOOL = {
  name: "get_nutrition_history",
  title: "Read Calocount nutrition history",
  description: `Read completed meal items for an inclusive UTC date range of up to ${MAX_NUTRITION_RANGE_DAYS} days. Results include known and unknown nutrient values. Use the opaque next_cursor to read the next page.`,
  inputSchema: {
    type: "object",
    properties: {
      start_date: { type: "string", format: "date", description: "First UTC date, inclusive (YYYY-MM-DD)." },
      end_date: { type: "string", format: "date", description: "Last UTC date, inclusive (YYYY-MM-DD)." },
      page_size: { type: "integer", minimum: 1, maximum: MAX_NUTRITION_PAGE_SIZE, default: DEFAULT_NUTRITION_PAGE_SIZE },
      cursor: { type: "string", maxLength: 4096, description: "Opaque next_cursor from the previous page. Keep the same dates and page_size." },
    },
    required: ["start_date", "end_date"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [{
      type: "object",
      properties: {
      start_date: { type: "string", format: "date" },
      end_date: { type: "string", format: "date" },
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
                required: ["id", "name", "quantity", "unit", "caloriesKcal", "proteinG", "carbsG", "fatG", "nutrients", "sourceFormAmounts"],
                additionalProperties: false,
              },
            },
          },
          required: ["date", "eaten_at", "request_id", "meal_type", "totals", "items"],
          additionalProperties: false,
        },
      },
      has_more: { type: "boolean" },
      next_cursor: { type: ["string", "null"] },
      },
      required: ["start_date", "end_date", "meals", "has_more", "next_cursor"],
      additionalProperties: false,
    }, toolErrorOutput],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
} as const;

const GET_NUTRITION_SUMMARY_TOOL = {
  name: "get_nutrition_summary",
  title: "Summarize Calocount nutrition",
  description: `Summarize completed meal totals by UTC day for an inclusive range of up to ${MAX_NUTRITION_RANGE_DAYS} days. Each nutrient includes recorded amount and coverage counts. Current targets are separate and do not describe historical targets.`,
  inputSchema: {
    type: "object",
    properties: {
      start_date: { type: "string", format: "date", description: "First UTC date, inclusive (YYYY-MM-DD)." },
      end_date: { type: "string", format: "date", description: "Last UTC date, inclusive (YYYY-MM-DD)." },
    },
    required: ["start_date", "end_date"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    oneOf: [{
      type: "object",
      properties: {
      startDate: { type: "string", format: "date" },
      endDate: { type: "string", format: "date" },
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
              properties: Object.fromEntries(SOURCE_FORM_OUTPUT_KEYS.map((key) => [key, nutrientCoverageSchema])),
              required: [...SOURCE_FORM_OUTPUT_KEYS],
              additionalProperties: false,
            },
          },
          required: ["date", "status", "mealCount", "itemCount", "totals", "nutrients", "sourceFormAmounts"],
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
            properties: Object.fromEntries(NUTRIENT_META.map((nutrient) => [nutrient.key, {
              type: "object",
              properties: {
                value: nullableNumberSchema,
                direction: { type: "string", enum: ["minimum", "maximum"] },
                source: { type: "string", enum: ["default", "custom", "disabled"] },
              },
              required: ["value", "direction", "source"],
              additionalProperties: false,
            }])),
            required: NUTRIENT_META.map((nutrient) => nutrient.key),
            additionalProperties: false,
          },
        },
        required: ["scope", "caloriesKcal", "protein", "nutrients"],
        additionalProperties: false,
      },
      },
      required: ["startDate", "endDate", "days", "currentTargets"],
      additionalProperties: false,
    }, toolErrorOutput],
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
} as const;

const updateNutrientProperties = nutrientInputProperties([...NUTRIENT_META, ...NUTRIENT_UPPER_LIMIT_META]);

const UPDATE_MEAL_TOOL = {
  name: "update_meal",
  title: "Edit a saved Calocount meal",
  description: "Correct a completed meal by its existing request_id. Use item IDs from get_nutrition_history for item-level corrections. This does not create a meal or change its request_id.",
  inputSchema: {
    type: "object",
    properties: {
      request_id: {
        type: "string",
        format: "uuid",
        description: "The original UUID request_id of the saved meal. Get it from get_nutrition_history; do not generate a new ID.",
      },
      patch: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH, description: "New meal name." },
          eaten_at: { type: "string", format: "date-time", description: "New meal time as a valid ISO-8601 date and time with a timezone." },
          kcal: { type: "number", minimum: 0, maximum: MAX_KCAL, description: "New meal calorie total." },
          protein: { type: "number", minimum: 0, maximum: MAX_MACRO, description: "New meal protein total in grams." },
          carbs: { type: "number", minimum: 0, maximum: MAX_MACRO, description: "New meal carbohydrate total in grams." },
          fat: { type: "number", minimum: 0, maximum: MAX_MACRO, description: "New meal fat total in grams." },
          nutrients: {
            type: "object",
            properties: updateNutrientProperties,
            minProperties: 1,
            additionalProperties: false,
            description: "Partial nutrient correction for a single-item meal. Omit unchanged fields or use null when unknown.",
          },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            description: "Partial corrections for existing items only. Each item needs its existing id and at least one field to change.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", minLength: 1, maxLength: 120, description: "Existing item ID from get_nutrition_history." },
                name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
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
    oneOf: [{
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
            required: ["id", "name", "quantity", "unit", "kcal", "protein", "carbs", "fat", "nutrients", "sourceFormAmounts"],
            additionalProperties: false,
          },
        },
      },
      required: ["status", "meal_id", "request_id", "name", "kcal", "protein", "carbs", "fat", "eaten_at", "has_image", "items"],
      additionalProperties: false,
    }, toolErrorOutput],
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

const ADD_MEALS_TOOL = {
  name: "add_meals",
  title: "Add meals to Calocount",
  description: "Save one or more meals to the signed-in Calocount account. Before calling, generate a UUID v4 request_id for each new meal with a code tool when available. Reuse an ID only for an exact retry of the same meal.",
  inputSchema: {
    type: "object",
    properties: {
      meals: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        description: "Meals to save. Each meal needs its own unique request_id.",
        items: {
          type: "object",
          properties: mealProperties,
          required: ["request_id", "name", "kcal", "protein", "carbs", "fat", "eaten_at"],
          additionalProperties: false,
        },
      },
      photos: {
        type: "array",
        minItems: 0,
        maxItems: 20,
        description: "Optional ChatGPT-supplied photo values. Pass them unchanged; never invent a file ID or download URL. Attach each photo to one meal with photo_meal_indices. Supported photo types: JPEG, PNG, WebP, and HEIC.",
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
        description: "For each photo, the zero-based index of the meal that receives it. Indices must be unique and point to an item in meals.",
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

function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  try {
    const parsedOrigin = new URL(origin);
    const requestOrigin = new URL(request.url).origin;
    return parsedOrigin.origin !== "null"
      && parsedOrigin.origin === origin
      && parsedOrigin.origin === requestOrigin;
  } catch {
    return false;
  }
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return Response.json(value, {
    ...init,
    headers: {
      "cache-control": "no-store",
      "pragma": "no-cache",
      "x-robots-tag": "noindex, nofollow, noarchive",
      ...init.headers,
    },
  });
}

function httpError(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

function apiErrorDetails(error: unknown): { status: number; code: string; message: string } | null {
  if (isObject(error) && error.name === "ApiError"
    && typeof error.status === "number"
    && typeof error.code === "string"
    && typeof error.message === "string") {
    return { status: error.status, code: error.code, message: error.message };
  }
  return null;
}

function safeHttpError(error: unknown): Response {
  if (error instanceof AddMealRequestError) {
    return httpError(error.status, error.code, error.message);
  }
  const apiError = apiErrorDetails(error);
  if (apiError) return httpError(apiError.status, apiError.code, apiError.message);
  return httpError(500, "internal_error", "The request could not be completed.");
}

function safeToolError(error: unknown): { code: string; message: string } {
  if (error instanceof MealUpdateInputError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof AddMealRequestError) {
    return { code: error.code, message: error.message };
  }
  const apiError = apiErrorDetails(error);
  if (apiError) return { code: apiError.code, message: apiError.message };
  return {
    code: "internal_error",
    message: "The meal request could not be completed. Check Calocount before retrying.",
  };
}

function toolErrorResult(code: string, message: string) {
  const error = { code, message };
  return {
    content: [{ type: "text" as const, text: `${code}: ${message}` }],
    structuredContent: { error },
    isError: true,
  };
}

function mappedMealBody(arguments_: JsonObject): JsonObject {
  if (Object.hasOwn(arguments_, "openaiFileIdRefs")) {
    throw new AddMealRequestError(400, "invalid_field", "openaiFileIdRefs is not supported by MCP. Use meals with top-level photos and photo_meal_indices so ChatGPT can supply file values.");
  }
  if (!Array.isArray(arguments_.meals)) {
    throw new AddMealRequestError(400, "invalid_field", "meals must be an array of meal objects.");
  }
  {
    for (const [index, meal] of arguments_.meals.entries()) {
      if (isObject(meal) && Object.hasOwn(meal, "openaiFileIdRefs")) {
        throw new AddMealRequestError(400, "invalid_field", `meals[${index}].openaiFileIdRefs is not supported by MCP. Use top-level photos and photo_meal_indices so ChatGPT can supply file values.`);
      }
    }
  }
  const hasPhotos = Object.hasOwn(arguments_, "photos");
  const hasIndices = Object.hasOwn(arguments_, "photo_meal_indices");
  if (!hasPhotos && !hasIndices) return arguments_;

  if (!hasPhotos || !hasIndices) {
    throw new AddMealRequestError(400, "invalid_field", "photos and photo_meal_indices must be provided together.");
  }
  const photos = arguments_.photos;
  const indices = arguments_.photo_meal_indices;
  const meals = arguments_.meals;
  if (!Array.isArray(photos) || !Array.isArray(indices)) {
    throw new AddMealRequestError(400, "invalid_field", "photos and photo_meal_indices must be arrays.");
  }
  if (photos.length > MAX_BATCH_MEALS || indices.length > MAX_BATCH_MEALS) {
    throw new AddMealRequestError(400, "invalid_field", `photos and photo_meal_indices must contain at most ${MAX_BATCH_MEALS} entries.`);
  }
  if (photos.length !== indices.length) {
    throw new AddMealRequestError(400, "invalid_field", "photos and photo_meal_indices must have the same number of entries.");
  }
  const mappedMeals = [...meals];
  const seenIndices = new Set<number>();
  for (const [photoIndex, photo] of photos.entries()) {
    const mealIndex = indices[photoIndex];
    if (typeof mealIndex !== "number" || !Number.isInteger(mealIndex)
      || mealIndex < 0 || mealIndex >= meals.length) {
      throw new AddMealRequestError(400, "invalid_field", `photo_meal_indices[${photoIndex}] must point to a meal in meals.`);
    }
    if (seenIndices.has(mealIndex)) {
      throw new AddMealRequestError(400, "invalid_field", "photo_meal_indices must contain unique meal indices.");
    }
    seenIndices.add(mealIndex);
    if (!isObject(photo) || !hasOnlyKeys(photo, ["download_url", "file_id", "mime_type", "file_name"])
      || typeof photo.download_url !== "string" || !photo.download_url.trim()
      || typeof photo.file_id !== "string" || !photo.file_id.trim()
      || (photo.mime_type !== undefined && (typeof photo.mime_type !== "string" || !photo.mime_type.trim()))
      || (photo.file_name !== undefined && (typeof photo.file_name !== "string" || !photo.file_name.trim()))) {
      throw new AddMealRequestError(400, "invalid_field", `photos[${photoIndex}] must be a file object with download_url and file_id. Bare local paths and bare file IDs cannot be resolved.`);
    }
    if (photo.mime_type !== undefined && normalizeExternalMealPhotoType(photo.mime_type) === null) {
      throw new AddMealRequestError(415, "unsupported_image_type", "This photo type is not supported. Use JPEG, PNG, WebP, or HEIC.");
    }
    const meal = meals[mealIndex];
    if (!isObject(meal)) {
      throw new AddMealRequestError(400, "invalid_field", `meals[${mealIndex}] must be an object.`);
    }
    const fileRef: JsonObject = {
      id: photo.file_id,
      download_link: photo.download_url,
      ...(photo.mime_type === undefined ? {} : { mime_type: photo.mime_type }),
      ...(photo.file_name === undefined ? {} : { name: photo.file_name }),
    };
    mappedMeals[mealIndex] = { ...meal, openaiFileIdRefs: [fileRef] };
  }

  const mealBody = { ...arguments_ };
  delete mealBody.photos;
  delete mealBody.photo_meal_indices;
  return { ...mealBody, meals: mappedMeals };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDailyTotals(value: unknown): value is JsonObject {
  return isObject(value)
    && hasOnlyKeys(value, ["date", "kcal", "protein", "meal_count"])
    && typeof value.date === "string"
    && /^\d{4}-\d{2}-\d{2}$/u.test(value.date)
    && isFiniteNumber(value.kcal)
    && isFiniteNumber(value.protein)
    && isFiniteNumber(value.meal_count);
}

function isMealResult(value: unknown): value is JsonObject {
  return isObject(value)
    && hasOnlyKeys(value, ["status", "meal_id", "request_id", "name", "kcal", "protein", "carbs", "fat", "eaten_at", "has_image", "photo_status"])
    && (value.status === "created" || value.status === "already_exists")
    && typeof value.meal_id === "string"
    && typeof value.request_id === "string"
    && typeof value.name === "string"
    && isFiniteNumber(value.kcal)
    && isFiniteNumber(value.protein)
    && isFiniteNumber(value.carbs)
    && isFiniteNumber(value.fat)
    && typeof value.eaten_at === "string"
    && Number.isFinite(Date.parse(value.eaten_at))
    && typeof value.has_image === "boolean"
    && (value.photo_status === undefined || value.photo_status === "download_failed");
}

function isMealResponse(value: unknown): value is JsonObject {
  if (!isObject(value)) return false;

  if (value.status === "batch_processed") {
    return hasOnlyKeys(value, ["status", "created_count", "already_exists_count", "meals", "daily_totals"])
      && isFiniteNumber(value.created_count)
      && Number.isInteger(value.created_count)
      && value.created_count >= 0
      && value.created_count <= 20
      && isFiniteNumber(value.already_exists_count)
      && Number.isInteger(value.already_exists_count)
      && value.already_exists_count >= 0
      && value.already_exists_count <= 20
      && Array.isArray(value.meals)
      && value.meals.length >= 1
      && value.meals.length <= 20
      && value.meals.every((meal) => isMealResult(meal))
      && value.created_count + value.already_exists_count === value.meals.length
      && (value.daily_totals === undefined || isDailyTotals(value.daily_totals));
  }
  return false;
}

function toolSummary(value: JsonObject): string {
  if (value.status === "batch_processed") {
    const created = value.created_count;
    const existing = value.already_exists_count;
    if (typeof created === "number" && typeof existing === "number") {
      return `Added ${created} new meal${created === 1 ? "" : "s"}. ${existing} meal${existing === 1 ? " was" : "s were"} already saved.`;
    }
  }
  return "The meal request returned a result. See the structured data for details.";
}

async function parseToolResponse(response: Response) {
  if (!response.ok) {
    return toolErrorResult("meal_request_failed", `Calocount returned HTTP ${response.status}. Check the meal list before retrying.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return toolErrorResult("invalid_meal_response", "Calocount returned an unreadable result. Check the meal list before retrying.");
  }
  if (!isMealResponse(payload)) {
    return toolErrorResult("invalid_meal_response", "Calocount returned an invalid result. Check the meal list before retrying.");
  }

  return {
    content: [{ type: "text" as const, text: toolSummary(payload) }],
    structuredContent: payload,
    isError: false,
  };
}

async function createToolCall(ownerKey: string, arguments_: JsonObject, dependencies: McpHandlerDependencies) {
  try {
    return await parseToolResponse(await dependencies.addMeals(ownerKey, mappedMealBody(arguments_)));
  } catch (error) {
    const safe = safeToolError(error);
    return toolErrorResult(safe.code, safe.message);
  }
}

async function createMealUpdateToolCall(ownerKey: string, arguments_: JsonObject, dependencies: McpHandlerDependencies) {
  try {
    const input = parseMcpMealUpdateInput(arguments_);
    const meal = await dependencies.updateMeal(ownerKey, input);
    if (!meal) return toolErrorResult("not_found", "A completed meal with this request_id was not found.");
    const payload = mcpUpdatedMealPayload(meal, input.requestId);
    return {
      content: [{ type: "text" as const, text: "Updated the saved meal. See the structured data for its current values." }],
      structuredContent: payload,
      isError: false,
    };
  } catch (error) {
    const safe = safeToolError(error);
    return toolErrorResult(safe.code, safe.message);
  }
}

function safeNutritionReadError(error: unknown): { code: string; message: string } {
  if (error instanceof NutritionReadInputError) return { code: error.code, message: error.message };
  return { code: "nutrition_read_failed", message: "Calocount could not read the requested nutrition data." };
}

async function createNutritionHistoryToolCall(ownerKey: string, arguments_: JsonObject, dependencies: McpHandlerDependencies) {
  try {
    const input = await parseNutritionHistoryInput(ownerKey, arguments_);
    const page = await dependencies.getNutritionHistory(ownerKey, input);
    const lastMeal = page.meals.at(-1);
    const nextCursor = page.hasMore && lastMeal
      ? await encodeNutritionHistoryCursor(ownerKey, input, { consumedAt: lastMeal.consumedAt, id: lastMeal.id })
      : null;
    const meals = page.meals.map((meal) => ({
      date: new Date(meal.consumedAt).toISOString().slice(0, 10),
      eaten_at: new Date(meal.consumedAt).toISOString(),
      request_id: meal.requestId,
      meal_type: meal.mealType,
      totals: {
        caloriesKcal: meal.caloriesKcal,
        proteinG: meal.proteinG,
        carbsG: meal.carbsG,
        fatG: meal.fatG,
      },
      items: meal.items,
    }));
    const payload = {
      start_date: input.startDate,
      end_date: input.endDate,
      meals,
      has_more: page.hasMore,
      next_cursor: nextCursor,
    };
    return {
      content: [{ type: "text" as const, text: `Returned ${meals.length} completed meals. See the structured data for items and nutrients.` }],
      structuredContent: payload,
      isError: false,
    };
  } catch (error) {
    const safe = safeNutritionReadError(error);
    return toolErrorResult(safe.code, safe.message);
  }
}

async function createNutritionSummaryToolCall(ownerKey: string, arguments_: JsonObject, dependencies: McpHandlerDependencies) {
  try {
    const input = parseNutritionSummaryInput(arguments_);
    const payload = await dependencies.getNutritionSummary(ownerKey, input);
    return {
      content: [{ type: "text" as const, text: `Returned nutrition totals for ${payload.days.length} UTC dates. Current targets apply to current settings only.` }],
      structuredContent: payload,
      isError: false,
    };
  } catch (error) {
    const safe = safeNutritionReadError(error);
    return toolErrorResult(safe.code, safe.message);
  }
}

/** Read the body once. Returns null when it exceeds the limit. */
async function readRequestBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null;
  if (!request.body) return new Uint8Array(0);
  return readBoundedBytes(request.body, MAX_BODY_BYTES);
}

type ParsedMessage = { parsed: true; value: unknown } | { parsed: false };

function parseMessage(body: Uint8Array): ParsedMessage {
  try {
    return { parsed: true, value: JSON.parse(new TextDecoder().decode(body)) as unknown };
  } catch {
    return { parsed: false };
  }
}

function validateProtocolVersion(request: Request, message?: ParsedMessage): Response | null {
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return httpError(400, "unsupported_protocol_version", "The MCP protocol version is not supported.");
  }
  if (version !== null || request.method !== "POST") return null;

  // An unreadable body is left for the transport to reject.
  if (!message?.parsed) return null;
  if (isObject(message.value) && message.value.method === "initialize") return null;
  return httpError(400, "unsupported_protocol_version", "The MCP protocol version is required after initialization.");
}

function isToolsListRequest(message: ParsedMessage): boolean {
  if (!message.parsed) return false;
  const messages = Array.isArray(message.value) ? message.value : [message.value];
  return messages.some((entry) => isObject(entry) && entry.method === "tools/list");
}

async function addOpenAISecuritySchemes(response: Response): Promise<Response> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return response;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!isObject(payload) || !isObject(payload.result) || !Array.isArray(payload.result.tools)) return response;

  const tools = payload.result.tools.map((tool) => {
    if (!isObject(tool) || !TOOL_CALLS.has(String(tool.name))) return tool;
    return { ...tool, securitySchemes: SECURITY_SCHEMES };
  });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({
    ...payload,
    result: { ...payload.result, tools },
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// One entry per tool: listing, dispatch, and the security-scheme rewrite all read this table.
const TOOLS = [
  { definition: ADD_MEALS_TOOL, call: createToolCall },
  { definition: GET_NUTRITION_HISTORY_TOOL, call: createNutritionHistoryToolCall },
  { definition: GET_NUTRITION_SUMMARY_TOOL, call: createNutritionSummaryToolCall },
  { definition: UPDATE_MEAL_TOOL, call: createMealUpdateToolCall },
] as const;
const TOOL_CALLS = new Map<string, (typeof TOOLS)[number]["call"]>(
  TOOLS.map((tool) => [tool.definition.name, tool.call]),
);

function createServer(ownerKey: string, dependencies: McpHandlerDependencies): Server {
  const server = new Server(
    { name: "calocount", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    },
  );
  server.setRequestHandler("tools/list", () => ({
    tools: TOOLS.map((tool) => tool.definition as unknown as Tool),
  }));
  server.setRequestHandler("tools/call", async (request) => {
    const call = TOOL_CALLS.get(request.params.name);
    if (!call) {
      throw new ProtocolError(INVALID_PARAMS, `Unknown tool: ${request.params.name}`);
    }
    if (!isObject(request.params.arguments)) {
      throw new ProtocolError(INVALID_PARAMS, "Tool arguments must be an object.");
    }
    return call(ownerKey, request.params.arguments, dependencies);
  });
  return server;
}

export function createMcpHandler(dependencies: McpHandlerDependencies) {
  async function authorize(request: Request): Promise<McpIdentity | Response> {
    if (!isOriginAllowed(request)) {
      return httpError(403, "invalid_origin", "The Origin header is not allowed.");
    }
    try {
      return await dependencies.authorize(request);
    } catch (error) {
      return safeHttpError(error);
    }
  }

  async function GET(request: Request): Promise<Response> {
    const identity = await authorize(request);
    if (identity instanceof Response) return identity;
    const versionError = validateProtocolVersion(request);
    if (versionError) return versionError;
    return httpError(405, "method_not_allowed", "This MCP endpoint does not offer a server event stream.");
  }

  async function POST(request: Request): Promise<Response> {
    const identity = await authorize(request);
    if (identity instanceof Response) return identity;

    let body: Uint8Array<ArrayBuffer> | null;
    try {
      body = await readRequestBody(request);
    } catch {
      return httpError(400, "invalid_request", "The request body could not be read.");
    }
    if (body === null) {
      return httpError(413, "payload_too_large", "The request is too large.");
    }
    const message = parseMessage(body);
    const versionError = validateProtocolVersion(request, message);
    if (versionError) return versionError;

    const server = createServer(identity.ownerKey, dependencies);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      const response = await transport.handleRequest(new Request(request, { body, headers }));
      // Only a tools/list result carries tool definitions to rewrite.
      return isToolsListRequest(message) ? await addOpenAISecuritySchemes(response) : response;
    } catch {
      return httpError(500, "internal_error", "The MCP request could not be completed.");
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  }

  return { GET, POST };
}
