import { listAiRuns } from "../../../db/repository";
import {
  getRequestDb,
  jsonResponse,
  requireApiIdentity,
  withApiErrors,
} from "../_lib/http";
import { withoutOwnerKey } from "../_lib/serialise";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const url = new URL(request.url);
    const limitValue = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.floor(limitValue), 1), 500) : 100;
    const runs = await listAiRuns(getRequestDb(), identity.ownerKey, {
      mealId: url.searchParams.get("mealId") ?? undefined,
      limit,
    });
    return jsonResponse({ runs: runs.map(withoutOwnerKey) });
  });
}
