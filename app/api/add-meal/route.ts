import { getEnvValue } from "../../../db";
import {
  ApiError,
  parseJsonBody,
  withApiErrors,
} from "../_lib/http";
import {
  AddMealRequestError,
  handleAddMealRequest,
} from "../_lib/add-meal";
import { createAddMealRuntimeOptions } from "../_lib/add-meal-runtime";

export { handleAddMealRequest, parseAddMealRequest } from "../_lib/add-meal";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const ownerKey = getEnvValue("CALOCOUNT_OWNER_KEY");
    try {
      return await handleAddMealRequest(request, {
        expectedToken: getEnvValue("CALOCOUNT_CHATGPT_MEAL_TOKEN"),
        ownerKey,
        ...createAddMealRuntimeOptions(),
        readBody: async () => {
          const contentType = request.headers.get("content-type")
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          if (contentType !== "application/json") {
            throw new ApiError(400, "invalid_json", "The request body must use application/json.");
          }
          return parseJsonBody(request);
        },
      });
    } catch (error) {
      if (error instanceof AddMealRequestError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  });
}
