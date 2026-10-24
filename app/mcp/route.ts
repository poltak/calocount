import { getDb } from "../../db";
import { getNutritionSummary, getWeightHistory, listNutritionHistoryPage } from "../../db/repository";
import { handleAuthorizedAddMealRequest } from "../api/_lib/add-meal";
import { createAddMealRuntimeOptions } from "../api/_lib/add-meal-runtime";
import { authorizeMcpRequest } from "../api/_lib/http";
import { createMcpHandler } from "./handler";
import { updateMcpMealByRequestId } from "./meal-update";

const handler = createMcpHandler({
  authorize: authorizeMcpRequest,
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
  getWeightHistory: (ownerKey, input) => getWeightHistory({
    db: getDb(),
    ownerKey,
    startDate: input.startDate,
    endDate: input.endDate,
  }),
});

export const GET = handler.GET;
export const POST = handler.POST;
