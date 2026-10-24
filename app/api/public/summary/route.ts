import { getEnvValue } from "../../../../db";
import { getDailyHistory, getDashboardSummary, getDayLog, getMonthTotals, getSettings } from "../../../../db/repository";
import { isDateKey, isMonthKey } from "../../../../domain/logical-date";
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
    const query = new URL(request.url).searchParams;
    const view = parsePublicSummaryView(query.get("view"));
    if (!view) {
      throw new ApiError(400, "invalid_query", `view must be one of: ${PUBLIC_SUMMARY_VIEWS.join(", ")}.`);
    }
    const month = query.get("month") ?? "";
    if (view === "month" && !isMonthKey(month)) {
      throw new ApiError(400, "invalid_query", "month must be a valid YYYY-MM month.");
    }
    const date = query.get("date") ?? "";
    if (view === "day" && !isDateKey(date)) {
      throw new ApiError(400, "invalid_query", "date must be a valid YYYY-MM-DD date.");
    }
    try {
      return await buildPublicSummaryResponse({
        ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY"),
        view,
        loadPublicViewEnabled: async (ownerKey) => (await getSettings(getRequestDb(), ownerKey))?.publicViewEnabled === true,
        // The public view groups meals into days in the owner's saved timezone.
        loadSummary: (ownerKey) => getDashboardSummary(getRequestDb(), ownerKey, { useSavedTimezone: true }),
        loadDailyHistory: (ownerKey) => getDailyHistory(getRequestDb(), ownerKey),
        loadMonth: (ownerKey) => getMonthTotals({ db: getRequestDb(), ownerKey, month, useSavedTimezone: true }),
        loadDay: (ownerKey) => getDayLog({ db: getRequestDb(), ownerKey, date, useSavedTimezone: true }),
      });
    } catch (error) {
      if (error instanceof PublicSummaryConfigError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  });
}
