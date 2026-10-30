import { getDashboardSummary } from "../../../../db/repository";
import { isValidTimeZone } from "../../../../domain/logical-date";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  readPartnerProfileEnabled,
  requireApiIdentity,
  withApiErrors,
} from "../../_lib/http";
import { serialiseMeals, withoutOwnerKey } from "../../_lib/serialise";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const timezone = new URL(request.url).searchParams.get("timezone");
    if (timezone !== null && !isValidTimeZone(timezone)) {
      throw new ApiError(400, "invalid_query", "timezone must be a valid IANA timezone.");
    }
    const [summary, partnerProfileEnabled] = await Promise.all([
      getDashboardSummary(getRequestDb(), identity.ownerKey, { timezone: timezone ?? undefined }),
      readPartnerProfileEnabled(identity.accountKey),
    ]);
    return jsonResponse({
      ...summary,
      profile: identity.profile,
      partnerProfileEnabled,
      recentMeals: serialiseMeals(summary.recentMeals),
      recentWeights: summary.recentWeights.map(withoutOwnerKey),
    });
  });
}
