import { getEnvValue } from "../../../../db";
import { getDashboardSummary } from "../../../../db/repository";
import { ApiError, getRequestDb, withApiErrors } from "../../_lib/http";
import { buildPublicSummaryResponse, PublicSummaryConfigError } from "../../_lib/public-summary";

export async function GET(): Promise<Response> {
  return withApiErrors(async () => {
    try {
      return await buildPublicSummaryResponse({
        ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY"),
        // The public view groups meals into days in the owner's saved timezone.
        loadSummary: (ownerKey) => getDashboardSummary(getRequestDb(), ownerKey, { useSavedTimezone: true }),
      });
    } catch (error) {
      if (error instanceof PublicSummaryConfigError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  });
}
