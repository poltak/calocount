import {
  createMealForExternalRequest,
  createMealsForExternalRequests,
  findMealByExternalRequestId,
  getCurrentDayMealTotals,
} from "../../../db/repository";
import { getPhotosBucket, getRequestDb } from "./http";
import {
  deleteUploadedMealPhoto,
  uploadDashboardMealPhoto,
  type MealPhotoBucket,
} from "./meal-photo";
import type { AddMealRuntimeOptions } from "./add-meal";

/** Build the database and photo callbacks for authorized meal writes. */
export function createAddMealRuntimeOptions(): AddMealRuntimeOptions {
  return {
    findExistingMeal: (owner, requestId) => findMealByExternalRequestId(getRequestDb(), owner, requestId),
    getDailyTotals: (owner, timestamp) => getCurrentDayMealTotals(getRequestDb(), owner, {
      now: new Date(timestamp),
    }),
    fetchImage: fetch,
    uploadPhoto: async (owner, requestId, photo) => {
      return uploadDashboardMealPhoto({
        bucket: getPhotosBucket() as unknown as MealPhotoBucket,
        ownerKey: owner,
        mealId: `meal_external_${requestId}`,
        photo,
      });
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
      ...(input.nutrients === undefined ? {} : { nutrients: input.nutrients }),
      photoKey: photo?.key ?? null,
      photoMimeType: photo?.mimeType ?? null,
      photoSizeBytes: photo?.sizeBytes ?? null,
    }),
    createMeals: (owner, requests) => createMealsForExternalRequests(getRequestDb(), owner, requests.map(({ request: input, photo }) => ({
      requestId: input.requestId,
      name: input.name,
      kcal: input.kcal,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      consumedAt: input.consumedAt,
      source: "chatgpt",
      caption: input.name,
      ...(input.nutrients === undefined ? {} : { nutrients: input.nutrients }),
      photoKey: photo?.key ?? null,
      photoMimeType: photo?.mimeType ?? null,
      photoSizeBytes: photo?.sizeBytes ?? null,
    }))),
  };
}
