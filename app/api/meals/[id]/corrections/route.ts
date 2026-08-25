import { updateMeal } from "../../../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  parseJsonBody,
  requireApiIdentity,
  withApiErrors,
} from "../../../_lib/http";
import { parseMealInput } from "../../../_lib/meal-input";
import { serialiseMeal } from "../../../_lib/serialise";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const id = (await context.params).id?.trim();
    if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The meal ID is invalid.");
    const body = await parseJsonBody(request);
    const patch = parseMealInput(body, true);
    const meal = await updateMeal(getRequestDb(), identity.ownerKey, id, patch, "correction");
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");
    return jsonResponse({ meal: serialiseMeal(meal), revisionRecorded: true });
  });
}
