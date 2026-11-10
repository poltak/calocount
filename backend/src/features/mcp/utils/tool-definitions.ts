import { PROFILES } from "./profile.js";
import type { JsonObject } from "./json-object.js";
import { isObject } from "./json-object.js";
import { ADD_MEALS_TOOL, UPDATE_MEAL_TOOL } from "./meal-tool-definitions.js";
import {
  GET_NUTRITION_HISTORY_TOOL,
  GET_NUTRITION_SUMMARY_TOOL,
  GET_WEIGHT_HISTORY_TOOL,
} from "./read-tool-definitions.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"];

export const SERVER_INSTRUCTIONS =
  "Dates use the saved timezone. Use get_nutrition_summary for totals and get_nutrition_history for request_id and item IDs. Before logging, estimate calories, macros and every supported nutrient. Use null only when no reasonable estimate exists; unknown is not 0. Call add_meals only when asked to log a meal; use a new UUID v4 per meal, reuse only for exact add retries. Call update_meal only when asked to edit; keep the saved request_id. Pass supplied photo values unchanged in photos with photo_meal_indices. Never invent file IDs or URLs. Photos: JPEG, PNG, WebP, HEIC. Report photos only when has_image is true.";

const PROFILE_INPUT = {
  type: "string",
  enum: PROFILES,
  description:
    "Whose log to use. Omit it for the owner's log. Use partner only when the user clearly means their partner or spouse, for example 'log this for my wife'.",
};

function resultBranch(branch: JsonObject) {
  if (
    !isObject(branch["properties"]) ||
    Object.hasOwn(branch["properties"], "error")
  ) {
    return branch;
  }
  return {
    ...branch,
    properties: {
      ...branch["properties"],
      profile: { type: "string", enum: PROFILES },
    },
  };
}

/**
 * Add the optional profile to the input of a tool, and to each result
 * branch of its output that is not the error branch.
 */
function withProfileField<
  Definition extends {
    inputSchema: object;
    outputSchema: { oneOf: readonly object[] };
  },
>(definition: Definition): Definition {
  const inputSchema = definition.inputSchema as JsonObject;
  return {
    ...definition,
    inputSchema: {
      ...inputSchema,
      properties: {
        ...(inputSchema["properties"] as JsonObject),
        profile: PROFILE_INPUT,
      },
    },
    outputSchema: {
      ...definition.outputSchema,
      oneOf: definition.outputSchema.oneOf.map((branch) =>
        resultBranch(branch as JsonObject),
      ),
    },
  };
}

/** What `tools/list` returns, in the order of the old app. */
export const TOOL_DEFINITIONS = [
  withProfileField(ADD_MEALS_TOOL),
  withProfileField(GET_NUTRITION_HISTORY_TOOL),
  withProfileField(GET_NUTRITION_SUMMARY_TOOL),
  withProfileField(GET_WEIGHT_HISTORY_TOOL),
  withProfileField(UPDATE_MEAL_TOOL),
];
