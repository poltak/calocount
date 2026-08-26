import { copyMeal } from "../../../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  parseJsonBody,
  requireApiIdentity,
  withApiErrors,
} from "../../../_lib/http";
import { serialiseMeal } from "../../../_lib/serialise";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function mealId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The meal ID is invalid.");
  return id;
}

function parseConsumedAt(value: unknown): number {
  if (value == null) return Date.now();
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return value;
    throw new ApiError(400, "invalid_field", "consumedAt must be a valid timestamp.");
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "invalid_field", "consumedAt must be an ISO date or timestamp.");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, "invalid_field", "consumedAt must be a valid date.");
  }
  return parsed;
}

/**
 * Copy one owned meal to the target time. The dashboard sends the current
 * timestamp for "today"; omitting consumedAt uses the server timestamp.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const body = request.body ? await parseJsonBody(request) : {};
    const meal = await copyMeal(getRequestDb(), identity.ownerKey, await mealId(context), {
      consumedAt: parseConsumedAt(body.consumedAt),
    });
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");
    return jsonResponse({ meal: serialiseMeal(meal) }, { status: 201 });
  });
}
