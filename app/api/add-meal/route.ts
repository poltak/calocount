import { createMealForExternalRequest, findMealByExternalRequestId } from "../../../db/repository";
import { getEnvValue } from "../../../db";
import {
  ApiError,
  getPhotosBucket,
  getRequestDb,
  parseJsonBody,
  withApiErrors,
} from "../_lib/http";
import {
  AddMealRequestError,
  handleAddMealRequest,
} from "../_lib/add-meal";
import {
  deleteUploadedMealPhoto,
  uploadDashboardMealPhoto,
  type MealPhotoBucket,
} from "../_lib/meal-photo";

export { handleAddMealRequest, parseAddMealRequest } from "../_lib/add-meal";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const ownerKey = getEnvValue("CALOCOUNT_OWNER_KEY");
    try {
      return await handleAddMealRequest(request, {
        expectedToken: getEnvValue("CALOCOUNT_CHATGPT_MEAL_TOKEN"),
        ownerKey,
        readBody: async () => {
          const contentType = request.headers.get("content-type")
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          if (contentType !== "application/json") {
            throw new ApiError(400, "invalid_json", "The request body must use application/json.");
          }
          return parseJsonBody(request);
        },
        findExistingMeal: (owner, requestId) => findMealByExternalRequestId(getRequestDb(), owner, requestId),
        fetchImage: fetch,
        uploadPhoto: async (owner, requestId, photo) => {
          const uploaded = await uploadDashboardMealPhoto({
            bucket: getPhotosBucket() as unknown as MealPhotoBucket,
            ownerKey: owner,
            mealId: `meal_external_${requestId}`,
            photo,
          });
          return uploaded;
        },
        deletePhoto: async (photo) => {
          await deleteUploadedMealPhoto(getPhotosBucket() as unknown as MealPhotoBucket, photo.key);
        },
        createMeal: (owner, input, photo) => createMealForExternalRequest(getRequestDb(), owner, input.requestId, {
          name: input.name,
          kcal: input.kcal,
          protein: input.protein,
          carbs: input.carbs,
          fat: input.fat,
          consumedAt: input.consumedAt,
          source: "chatgpt",
          caption: input.name,
          photoKey: photo?.key ?? null,
          photoMimeType: photo?.mimeType ?? null,
          photoSizeBytes: photo?.sizeBytes ?? null,
        }),
      });
    } catch (error) {
      if (error instanceof AddMealRequestError) {
        throw new ApiError(error.status, error.code, error.message);
      }
      throw error;
    }
  });
}
