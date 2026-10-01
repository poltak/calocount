import { createMeal } from "../../../db/repository";
import {
  ApiError,
  getRequestDb,
  getPhotosBucket,
  jsonResponse,
  parseJsonBody,
  requireApiIdentity,
  withApiErrors,
} from "../_lib/http";
import { parseMealInput } from "../_lib/meal-input";
import {
  createMealWithDashboardPhoto,
  isMultipartMealRequest,
  MealPhotoError,
  parseMultipartMealRequest,
  type MealPhotoBucket,
  type ParsedMultipartMeal,
} from "../_lib/meal-photo";
import { serialiseMeal } from "../_lib/serialise";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    let requestBody: ParsedMultipartMeal;
    try {
      requestBody = isMultipartMealRequest(request)
        ? await parseMultipartMealRequest(request)
        : { body: await parseJsonBody(request), photo: null };
    } catch (error) {
      if (error instanceof MealPhotoError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }

    const input = parseMealInput(requestBody.body);
    const db = getRequestDb();
    let meal;
    if (requestBody.photo) {
      const bucket = getPhotosBucket() as unknown as MealPhotoBucket;
      const saved = await createMealWithDashboardPhoto({
        bucket,
        ownerKey: identity.ownerKey,
        photo: requestBody.photo,
        save: (uploaded) => createMeal(db, identity.ownerKey, {
          ...input,
          photoKey: uploaded.key,
          photoMimeType: uploaded.mimeType,
          photoSizeBytes: uploaded.sizeBytes,
        }),
      });
      meal = saved.value;
    } else {
      meal = await createMeal(db, identity.ownerKey, input);
    }
    return jsonResponse({ meal: serialiseMeal(meal) }, { status: 201 });
  });
}
