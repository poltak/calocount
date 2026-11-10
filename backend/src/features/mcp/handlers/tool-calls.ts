import type { BackendLogic, BackendServices } from "../../core/types.js";
import type { MealWithItems } from "../../entries/storage/types.js";
import { isObject, type JsonObject } from "../utils/json-object.js";
import { McpToolError } from "../utils/mcp-tool-error.js";
import { entryPatchOf, parseMealCorrection } from "../utils/meal-patch.js";
import { parseAddMeals } from "../utils/meal-request.js";
import {
  historyPayload,
  summaryPayload,
  weightsPayload,
} from "../utils/nutrition-payloads.js";
import {
  parseNutritionHistoryInput,
  parseNutritionSummaryInput,
  parseWeightHistoryInput,
} from "../utils/nutrition-read-input.js";
import { isProfile, profileDataKey, type Profile } from "../utils/profile.js";
import {
  NUTRIENT_KEYS,
  NUTRIENT_UPPER_LIMIT_KEYS,
} from "@app/common/features/entries/utils/nutrients";
import type { CallTool, ToolCallResult } from "./mcp-protocol.js";

interface ToolCallProps {
  logic: Pick<BackendLogic, "entries" | "entryReads" | "settings" | "weights">;
  services: Pick<BackendServices, "logger">;
}

type ToolCall = (input: {
  ownerKey: string;
  args: JsonObject;
}) => Promise<ToolCallResult>;

function toolErrorResult(code: string, message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: `${code}: ${message}` }],
    structuredContent: { error: { code, message } },
    isError: true,
  };
}

function textResult({
  text,
  payload,
}: {
  text: string;
  payload: unknown;
}): ToolCallResult {
  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
    isError: false,
  };
}

function mealResultPayload(
  status: "created" | "already_exists",
  { meal }: MealWithItems,
) {
  return {
    status,
    meal_id: meal.id,
    request_id: meal.externalRequestId,
    name: meal.caption,
    kcal: meal.totalCalories,
    protein: meal.totalProteinG,
    carbs: meal.totalCarbsG,
    fat: meal.totalFatG,
    eaten_at: new Date(meal.consumedAt).toISOString(),
    has_image: Boolean(meal.photoKey),
  };
}

function hasNutrientValue(nutrients: unknown): boolean {
  return (
    isObject(nutrients) &&
    Object.values(nutrients).some(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  );
}

/** The tools of the MCP endpoint. Each one calls the Logic of the feature that owns the data. */
export function createToolCaller({ logic, services }: ToolCallProps): {
  call: (input: { accountKey: string }) => CallTool;
} {
  /** The saved timezone sets the days of every read, and it belongs to the profile. */
  async function timeZoneOf(ownerKey: string) {
    return (await logic.settings.read({ ownerKey }))?.timezone;
  }

  const addMeals: ToolCall = async ({ ownerKey, args }) => {
    const requests = parseAddMeals(args);
    const results = await logic.entries.createExternal({ ownerKey, requests });
    const today = await logic.entryReads.today({
      ownerKey,
      timeZone: await timeZoneOf(ownerKey),
    });
    const created = results.filter((result) => result.created).length;
    const alreadySaved = results.length - created;
    const withoutNutrients = results
      .filter((result) => result.created)
      .filter(({ entry }) => {
        const request = requests.find(
          ({ requestId }) => requestId === entry.meal.externalRequestId,
        );
        return !hasNutrientValue(request?.nutrients);
      })
      .map(({ entry }) => entry.meal.caption);
    const warning =
      withoutNutrients.length > 0
        ? ` No nutrient values were saved for: ${withoutNutrients.join(", ")}. If you can estimate them, call update_meal with the saved request_id.`
        : "";
    return textResult({
      text: `Added ${created} new meal${created === 1 ? "" : "s"}. ${alreadySaved} meal${alreadySaved === 1 ? " was" : "s were"} already saved.${warning}`,
      payload: {
        status: "batch_processed",
        created_count: created,
        already_exists_count: alreadySaved,
        meals: results.map(({ created: isNew, entry }) =>
          mealResultPayload(isNew ? "created" : "already_exists", entry),
        ),
        daily_totals: {
          date: today.date,
          kcal: today.calories,
          protein: today.proteinG,
          meal_count: today.mealCount,
        },
      },
    });
  };

  const updateMeal: ToolCall = async ({ ownerKey, args }) => {
    const correction = parseMealCorrection(args);
    const existing = await logic.entries.findByRequestId({
      ownerKey,
      requestId: correction.requestId,
    });
    if (!existing || existing.meal.status !== "complete") {
      return toolErrorResult(
        "not_found",
        "A completed meal with this request_id was not found.",
      );
    }
    const { meal, items } = await logic.entries.update({
      ownerKey,
      id: existing.meal.id,
      patch: entryPatchOf({ existing, correction: correction.patch }),
    });
    return textResult({
      text: "Updated the saved meal. See the structured data for its current values.",
      payload: {
        status: "updated",
        meal_id: meal.id,
        request_id: meal.externalRequestId ?? correction.requestId,
        name: meal.caption,
        kcal: meal.totalCalories,
        protein: meal.totalProteinG,
        carbs: meal.totalCarbsG,
        fat: meal.totalFatG,
        eaten_at: new Date(meal.consumedAt).toISOString(),
        has_image: Boolean(meal.photoKey),
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          kcal: item.calories,
          protein: item.proteinG,
          carbs: item.carbsG,
          fat: item.fatG,
          nutrients: Object.fromEntries(
            NUTRIENT_KEYS.map((key) => [key, item[key] ?? null]),
          ),
          sourceFormAmounts: Object.fromEntries(
            NUTRIENT_UPPER_LIMIT_KEYS.map((key) => [key, item[key] ?? null]),
          ),
        })),
      },
    });
  };

  const getNutritionHistory: ToolCall = async ({ ownerKey, args }) => {
    const input = parseNutritionHistoryInput(args);
    const page = await logic.entryReads.historyPage({
      ownerKey,
      startDate: input.startDate,
      endDate: input.endDate,
      pageSize: input.pageSize,
      cursor: input.cursor,
      timeZone: await timeZoneOf(ownerKey),
    });
    const payload = historyPayload({ input, page });
    return textResult({
      text: `Returned ${payload.meals.length} completed meals. See the structured data for items and nutrients.`,
      payload,
    });
  };

  const getNutritionSummary: ToolCall = async ({ ownerKey, args }) => {
    const range = parseNutritionSummaryInput(args);
    const settings = await logic.settings.read({ ownerKey });
    const [{ timeZone, days }, goalChanges] = await Promise.all([
      logic.entryReads.nutritionDays({
        ownerKey,
        startDate: range.startDate,
        endDate: range.endDate,
        dayCount: range.dayCount,
        timeZone: settings?.timezone,
      }),
      logic.settings.goalChanges({ ownerKey }),
    ]);
    return textResult({
      text: `Returned nutrition totals for ${days.length} dates in ${timeZone}. Current targets apply to current settings only; see goalChanges for recorded goal changes.`,
      payload: summaryPayload({ range, timeZone, days, settings, goalChanges }),
    });
  };

  const getWeightHistory: ToolCall = async ({ ownerKey, args }) => {
    const range = parseWeightHistoryInput(args);
    const [weights, firstWeightDate] = await Promise.all([
      logic.weights.range({
        ownerKey,
        from: range.startDate,
        to: range.endDate,
      }),
      logic.weights.firstDate({ ownerKey }),
    ]);
    return textResult({
      text: `Returned ${weights.length} weights in kilograms, oldest first.`,
      payload: weightsPayload({ range, firstWeightDate, weights }),
    });
  };

  const tools = new Map<string, { run: ToolCall; failure: string }>([
    [
      "add_meals",
      {
        run: addMeals,
        failure:
          "The meal request could not be completed. Check Calocount before retrying.",
      },
    ],
    [
      "update_meal",
      {
        run: updateMeal,
        failure:
          "The meal request could not be completed. Check Calocount before retrying.",
      },
    ],
    [
      "get_nutrition_history",
      {
        run: getNutritionHistory,
        failure: "Calocount could not read the requested nutrition data.",
      },
    ],
    [
      "get_nutrition_summary",
      {
        run: getNutritionSummary,
        failure: "Calocount could not read the requested nutrition data.",
      },
    ],
    [
      "get_weight_history",
      {
        run: getWeightHistory,
        failure: "Calocount could not read the requested nutrition data.",
      },
    ],
  ]);
  const WRITE_TOOLS = new Set(["add_meals", "update_meal"]);

  /**
   * The partner profile is a second log with its own data key. The tools do
   * not see the `profile` argument, and a result names the profile that it used.
   */
  async function callOnProfile({
    accountKey,
    name,
    args,
  }: {
    accountKey: string;
    name: string;
    args: JsonObject;
  }): Promise<ToolCallResult | null> {
    const tool = tools.get(name);
    if (!tool) {
      return null;
    }
    const { profile = "owner", ...toolArguments } = args;
    if (!isProfile(profile)) {
      return toolErrorResult(
        "invalid_profile",
        "profile must be owner or partner.",
      );
    }
    let ownerKey: string | null;
    try {
      ownerKey = await resolveOwnerKey({ accountKey, profile });
    } catch (error) {
      services.logger.error("MCP profile check failed", { error });
      return toolErrorResult(
        "internal_error",
        "Calocount could not read the profile. Try again later.",
      );
    }
    if (!ownerKey) {
      return toolErrorResult(
        "profile_off",
        "The partner profile is off. The owner can turn it on in Calocount settings.",
      );
    }
    let result: ToolCallResult;
    try {
      result = await tool.run({ ownerKey, args: toolArguments });
    } catch (error) {
      if (error instanceof McpToolError) {
        return toolErrorResult(error.code, error.message);
      }
      services.logger.error("MCP tool failed", { tool: name, error });
      return toolErrorResult(
        WRITE_TOOLS.has(name) ? "internal_error" : "nutrition_read_failed",
        tool.failure,
      );
    }
    if (result.isError) {
      return result;
    }
    return {
      ...result,
      content: result.content.map((part) =>
        profile === "partner"
          ? { ...part, text: `Partner profile. ${part.text}` }
          : part,
      ),
      structuredContent: {
        ...(result.structuredContent as JsonObject),
        profile,
      },
    };
  }

  async function resolveOwnerKey({
    accountKey,
    profile,
  }: {
    accountKey: string;
    profile: Profile;
  }): Promise<string | null> {
    if (profile === "owner") {
      return accountKey;
    }
    const settings = await logic.settings.read({ ownerKey: accountKey });
    return settings?.partnerProfileEnabled === 1
      ? profileDataKey({ accountKey, profile })
      : null;
  }

  return {
    call:
      ({ accountKey }) =>
      ({ name, arguments: args }) =>
        callOnProfile({ accountKey, name, args }),
  };
}
