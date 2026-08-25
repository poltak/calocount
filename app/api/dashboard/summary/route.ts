import { getDashboardSummary } from "../../../../db/repository";
import {
  getRequestDb,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../../_lib/http";
import { serialiseMeals, withoutOwnerKey } from "../../_lib/serialise";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const summary = await getDashboardSummary(getRequestDb(), identity.ownerKey);
    return jsonResponse({
      ...summary,
      recentMeals: serialiseMeals(summary.recentMeals),
      recentWeights: summary.recentWeights.map(withoutOwnerKey),
    });
  });
}
