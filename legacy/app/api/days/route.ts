import { getMonthTotals } from "../../../db/repository";
import { isMonthKey, isValidTimeZone } from "../../../domain/logical-date";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../_lib/http";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const query = new URL(request.url).searchParams;
    const month = query.get("month");
    if (!isMonthKey(month)) {
      throw new ApiError(400, "invalid_query", "month must be a valid YYYY-MM month.");
    }
    const timezone = query.get("timezone");
    if (timezone !== null && !isValidTimeZone(timezone)) {
      throw new ApiError(400, "invalid_query", "timezone must be a valid IANA timezone.");
    }
    return jsonResponse(await getMonthTotals({
      db: getRequestDb(),
      ownerKey: identity.ownerKey,
      month,
      timezone: timezone ?? undefined,
    }));
  });
}
