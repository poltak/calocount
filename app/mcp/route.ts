import { getDb, getEnvValue } from "../../db";
import { getNutritionSummary, listNutritionHistoryPage } from "../../db/repository";
import { handleAuthorizedAddMealRequest } from "../api/_lib/add-meal";
import { createAddMealRuntimeOptions } from "../api/_lib/add-meal-runtime";
import { requireApiIdentity } from "../api/_lib/http";
import { createMcpHandler } from "./handler";
import { updateMcpMealByRequestId } from "./meal-update";

const handler = createMcpHandler({
  authorize: (request) => requireApiIdentity(request, {
    accessAudience: getEnvValue("CALOCOUNT_MCP_ACCESS_AUDIENCE"),
  }),
  addMeals: (ownerKey, body) => handleAuthorizedAddMealRequest(
    ownerKey,
    body,
    createAddMealRuntimeOptions(),
  ),
  updateMeal: (ownerKey, input) => updateMcpMealByRequestId({
    db: getDb(),
    ownerKey,
    input,
  }),
  getNutritionHistory: (ownerKey, input) => listNutritionHistoryPage({
    db: getDb(),
    ownerKey,
    startDate: input.startDate,
    endDate: input.endDate,
    limit: input.pageSize,
    cursor: input.cursor,
  }),
  getNutritionSummary: (ownerKey, input) => getNutritionSummary({
    db: getDb(),
    ownerKey,
    ...input,
  }),
});

export const GET = handler.GET;
export const POST = handler.POST;
