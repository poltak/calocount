import { getEnvValue } from "../../../db";
import { getDashboardSummary } from "../../../db/repository";
import { ApiError, getPhotosBucket, getRequestDb, withApiErrors } from "../../api/_lib/http";
import { buildPublicMealPhotoResponse } from "../../api/_lib/public-meal-photo";
import { PublicSummaryConfigError } from "../../api/_lib/public-summary";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    try {
      const { id } = await context.params;
      return await buildPublicMealPhotoResponse({
        ownerKey: getEnvValue("CALOCOUNT_OWNER_KEY"),
        mealId: id,
        ifNoneMatch: request.headers.get("if-none-match"),
        loadSummary: (ownerKey) => getDashboardSummary(getRequestDb(), ownerKey),
        loadPhoto: async (photoKey) => {
          const object = await getPhotosBucket().get(photoKey);
          return object
            ? { body: object.body, httpEtag: object.httpEtag, size: object.size }
            : null;
        },
      });
    } catch (error) {
      if (error instanceof PublicSummaryConfigError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  });
}
