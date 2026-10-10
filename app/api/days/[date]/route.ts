import { getDayLog } from "../../../../db/repository";
import { isDateKey, isValidTimeZone } from "../../../../domain/logical-date";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../../_lib/http";
import { serialiseMeals, withoutOwnerKey } from "../../_lib/serialise";

type RouteContext = { params: Promise<{ date: string }> | { date: string } };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const date = (await context.params).date;
    if (!isDateKey(date)) {
      throw new ApiError(400, "invalid_date", "The date must be a valid YYYY-MM-DD date.");
    }
    const timezone = new URL(request.url).searchParams.get("timezone");
    if (timezone !== null && !isValidTimeZone(timezone)) {
      throw new ApiError(400, "invalid_query", "timezone must be a valid IANA timezone.");
    }
    const day = await getDayLog({
      db: getRequestDb(),
      ownerKey: identity.ownerKey,
      date,
      timezone: timezone ?? undefined,
    });
    return jsonResponse({
      ...day,
      meals: serialiseMeals(day.meals),
      weight: day.weight ? withoutOwnerKey(day.weight) : null,
    });
  });
}
