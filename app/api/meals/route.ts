import { createMeal, listMeals } from "../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  parseJsonBody,
  requireApiIdentity,
  withApiErrors,
} from "../_lib/http";
import { parseMealInput } from "../_lib/meal-input";
import { serialiseMeals, serialiseMeal } from "../_lib/serialise";

function queryNumber(value: string | null, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ApiError(400, "invalid_query", `${field} must be a number.`);
  return parsed;
}
export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const url = new URL(request.url);
    const entries = await listMeals(getRequestDb(), identity.ownerKey, {
      from: queryNumber(url.searchParams.get("from"), "from"),
      to: queryNumber(url.searchParams.get("to"), "to"),
      limit: queryNumber(url.searchParams.get("limit"), "limit"),
      offset: queryNumber(url.searchParams.get("offset"), "offset"),
    });
    return jsonResponse({ meals: serialiseMeals(entries) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const input = parseMealInput(await parseJsonBody(request));
    const meal = await createMeal(getRequestDb(), identity.ownerKey, input);
    return jsonResponse({ meal: serialiseMeal(meal) }, { status: 201 });
  });
}
