import { getDashboardSummary, resolveShareLink } from "../../../../../db/repository";
import {
  ApiError,
  getRequestDb,
  jsonResponse,
  withApiErrors,
} from "../../../_lib/http";
import { projectPublicDashboardSummary } from "../../_lib/projection";

type RouteContext = { params: Promise<{ token: string }> | { token: string } };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const token = (await context.params).token?.trim() ?? "";
    const db = getRequestDb();
    const link = await resolveShareLink(db, token);
    if (!link) throw new ApiError(404, "not_found", "Share link not found.");
    const summary = await getDashboardSummary(db, link.ownerKey);
    return jsonResponse(projectPublicDashboardSummary(summary), {
      headers: { "cache-control": "no-store" },
    });
  });
}
