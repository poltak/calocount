import { getEnvValue } from "../../../../db";
import { getDailyHistory, getDashboardSummary } from "../../../../db/repository";
import { ApiError, getRequestDb, withApiErrors } from "../../_lib/http";
import {
  buildPublicSummaryResponse,
  parsePublicSummaryView,
  PUBLIC_SUMMARY_VIEWS,
  PublicSummaryConfigError,
} from "../../_lib/public-summary";

export async function GET(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    // The views share one path because Cloudflare Access makes only this exact path public.
    const view = parsePublicSummaryView(new URL(request.url).searchParams.get("view"));
    if (!view) {
      throw new ApiError(400, "invalid_query", `view must be one of: ${PUBLIC_SUMMARY_VIEWS.join(", ")}.`);
    }
    try {
      return await buildPublicSummaryResponse({
        ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY"),
        view,
        // The public view groups meals into days in the owner's saved timezone.
        loadSummary: (ownerKey) => getDashboardSummary(getRequestDb(), ownerKey, { useSavedTimezone: true }),
        loadDailyHistory: (ownerKey) => getDailyHistory(getRequestDb(), ownerKey),
      });
    } catch (error) {
      if (error instanceof PublicSummaryConfigError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  });
}
