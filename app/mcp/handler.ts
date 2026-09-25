import {
  INVALID_PARAMS,
  ProtocolError,
  Server,
  WebStandardStreamableHTTPServerTransport,
  type Tool,
} from "@modelcontextprotocol/server";
import { NUTRIENT_META } from "../../domain/nutrients";
import type { NutritionHistoryPage, NutritionSummaryReport } from "../../db/repository";
import { AddMealRequestError } from "../api/_lib/add-meal";
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

export const MCP_PROTOCOL_VERSION = "2025-11-25";

const SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"];
const MAX_BODY_BYTES = 1_000_000;
const SECURITY_SCHEMES = [{ type: "oauth2", scopes: [] }] as const;
const SERVER_INSTRUCTIONS = "Use get_nutrition_summary for totals and get_nutrition_history for items; dates are inclusive UTC. Estimate calories, protein, carbs, and fat before logging. Call add_meals only when the user clearly asks to log, save, add, track, or record a meal. Use only ChatGPT-supplied photo file values unchanged with photo_meal_indices; omit photos if there is no file value. Use a new UUID per meal; reuse it only to retry. Report results truthfully; say a photo was stored only when has_image is true.";
type JsonObject = Record<string, unknown>;
type McpIdentity = { ownerKey: string };

export type McpHandlerDependencies = {
  authorize: (request: Request) => Promise<McpIdentity>;
  addMeals: (ownerKey: string, body: JsonObject) => Promise<Response>;
  getNutritionHistory: (ownerKey: string, input: Awaited<ReturnType<typeof parseNutritionHistoryInput>>) => Promise<NutritionHistoryPage>;
  getNutritionSummary: (ownerKey: string, input: ReturnType<typeof parseNutritionSummaryInput>) => Promise<NutritionSummaryReport>;
};

const nutrientProperties = Object.fromEntries(NUTRIENT_META.map((nutrient) => [
  nutrient.key,
  {
    type: ["number", "null"],
    minimum: 0,
    maximum: nutrient.maximum,
    description: `${nutrient.label} in ${nutrient.unit}. Use null when the value is unknown.`,
  },
]));

const mealProperties = {
  request_id: {
    type: "string",
    format: "uuid",
    description: "Generate a fresh UUID v4 with a code tool (for example, crypto.randomUUID() or uuid.uuid4()) when one is available. If no code tool is available, supply a fresh valid UUID v4. Reuse the ID only for an exact retry of the same meal details.",
  },
  name: {
    type: "string",
    minLength: 1,
    maxLength: 200,
    description: "A short name for the meal.",
  },
  kcal: { type: "number", minimum: 0, maximum: 100_000, description: "Calories in kilocalories." },
  protein: { type: "number", minimum: 0, maximum: 10_000, description: "Protein in grams." },
  carbs: { type: "number", minimum: 0, maximum: 10_000, description: "Carbohydrate in grams." },
  fat: { type: "number", minimum: 0, maximum: 10_000, description: "Fat in grams." },
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
            meal_type: { type: ["string", "null"] },
            totals: dailyMacroSchema,
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string" },
                  caloriesKcal: { type: "number" },
                  proteinG: { type: "number" },
                  carbsG: { type: "number" },
                  fatG: { type: "number" },
                  nutrients: nutrientValueOutputSchema,
                  sourceFormAmounts: {
                    type: "object",
                    properties: Object.fromEntries(SOURCE_FORM_OUTPUT_KEYS.map((key) => [key, nullableNumberSchema])),
                    required: [...SOURCE_FORM_OUTPUT_KEYS],
                    additionalProperties: false,
                  },
                },
                required: ["name", "quantity", "unit", "caloriesKcal", "proteinG", "carbsG", "fatG", "nutrients", "sourceFormAmounts"],
                additionalProperties: false,
              },
            },
          },
          required: ["date", "eaten_at", "meal_type", "totals", "items"],
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
              mode: { type: "string", enum: ["grams", "per_kg"] },
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

const READ_TOOL_NAMES = new Set<string>([GET_NUTRITION_HISTORY_TOOL.name, GET_NUTRITION_SUMMARY_TOOL.name]);

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
        description: "Optional ChatGPT images to attach to meals. Use photo_meal_indices to map each image to one meal.",
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

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonObject, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

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
  if (photos.length > 20 || indices.length > 20) {
    throw new AddMealRequestError(400, "invalid_field", "photos and photo_meal_indices must contain at most 20 entries.");
  }
  if (photos.length !== indices.length) {
    throw new AddMealRequestError(400, "invalid_field", "photos and photo_meal_indices must have the same number of entries.");
  }
  if (!Array.isArray(meals)) {
    throw new AddMealRequestError(400, "invalid_field", "meals must be an array when photos are provided.");
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
      throw new AddMealRequestError(400, "invalid_field", `photos[${photoIndex}] must include download_url and file_id, with optional mime_type and file_name strings.`);
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
      meal_type: meal.mealType,
      totals: {
        caloriesKcal: meal.caloriesKcal,
        proteinG: meal.proteinG,
        carbsG: meal.carbsG,
        fatG: meal.fatG,
      },
      items: meal.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        caloriesKcal: item.caloriesKcal,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        nutrients: item.nutrients,
        sourceFormAmounts: item.sourceFormAmounts,
      })),
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

async function validateRequestSize(request: Request): Promise<boolean> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return true;
  if (!request.body) return false;

  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let byteCount = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return false;
      byteCount += chunk.value.byteLength;
      if (byteCount > MAX_BODY_BYTES) {
        void reader.cancel("payload_too_large").catch(() => undefined);
        return true;
      }
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

async function validateProtocolVersion(request: Request): Promise<Response | null> {
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return httpError(400, "unsupported_protocol_version", "The MCP protocol version is not supported.");
  }
  if (version !== null || request.method !== "POST") return null;

  let message: unknown;
  try {
    message = await request.clone().json();
  } catch {
    return null;
  }
  if (isObject(message) && message.method === "initialize") return null;
  return httpError(400, "unsupported_protocol_version", "The MCP protocol version is required after initialization.");
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
    if (!isObject(tool) || (tool.name !== ADD_MEALS_TOOL.name && !READ_TOOL_NAMES.has(String(tool.name)))) return tool;
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
    tools: [
      ADD_MEALS_TOOL as unknown as Tool,
      GET_NUTRITION_HISTORY_TOOL as unknown as Tool,
      GET_NUTRITION_SUMMARY_TOOL as unknown as Tool,
    ],
  }));
  server.setRequestHandler("tools/call", async (request) => {
    if (request.params.name !== ADD_MEALS_TOOL.name
      && request.params.name !== GET_NUTRITION_HISTORY_TOOL.name
      && request.params.name !== GET_NUTRITION_SUMMARY_TOOL.name) {
      throw new ProtocolError(INVALID_PARAMS, `Unknown tool: ${request.params.name}`);
    }
    if (!isObject(request.params.arguments)) {
      throw new ProtocolError(INVALID_PARAMS, "Tool arguments must be an object.");
    }
    if (request.params.name === GET_NUTRITION_HISTORY_TOOL.name) {
      return createNutritionHistoryToolCall(ownerKey, request.params.arguments, dependencies);
    }
    if (request.params.name === GET_NUTRITION_SUMMARY_TOOL.name) {
      return createNutritionSummaryToolCall(ownerKey, request.params.arguments, dependencies);
    }
    return createToolCall(ownerKey, request.params.arguments, dependencies);
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
    const versionError = await validateProtocolVersion(request);
    if (versionError) return versionError;
    return httpError(405, "method_not_allowed", "This MCP endpoint does not offer a server event stream.");
  }

  async function POST(request: Request): Promise<Response> {
    const identity = await authorize(request);
    if (identity instanceof Response) return identity;

    if (await validateRequestSize(request)) {
      return httpError(413, "payload_too_large", "The request is too large.");
    }
    const versionError = await validateProtocolVersion(request);
    if (versionError) return versionError;

    const server = createServer(identity.ownerKey, dependencies);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      return await addOpenAISecuritySchemes(response);
    } catch {
      return httpError(500, "internal_error", "The MCP request could not be completed.");
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  }

  return { GET, POST };
}
