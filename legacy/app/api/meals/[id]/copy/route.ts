import { copyMeal } from "../../../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  parseJsonBody,
  requireApiIdentity,
  withApiErrors,
} from "../../../_lib/http";
import { parseConsumedAt } from "../../../_lib/meal-input";
import { serialiseMeal } from "../../../_lib/serialise";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function mealId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The entry ID is invalid.");
  return id;
}

/**
 * Copy one owned meal to the target time. The dashboard sends the current
 * timestamp for "today"; omitting consumedAt uses the server timestamp.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const body = request.body ? await parseJsonBody(request) : {};
    const consumedAt = parseConsumedAt(body.consumedAt) ?? Date.now();
    const meal = await copyMeal(getRequestDb(), identity.ownerKey, await mealId(context), {
      consumedAt,
    });
    if (!meal) throw new ApiError(404, "not_found", "Entry not found.");
    return jsonResponse({ meal: serialiseMeal(meal) }, { status: 201 });
  });
}
