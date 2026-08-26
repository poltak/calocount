import { deleteMeal, findMeal, hasMealPhotoReference, updateMeal } from "../../../../db/repository";
import {
  ApiError,
  getRequestDb,
  getPhotosBucket,
  jsonResponse,
  parseJsonBody,
  requireApiIdentity,
  withApiErrors,
} from "../../_lib/http";
import { parseMealInput } from "../../_lib/meal-input";
import {
  isMultipartMealRequest,
  MealPhotoError,
  parseMultipartMealRequest,
  type MealPhotoBucket,
  replaceMealPhoto,
  type ParsedMultipartMeal,
} from "../../_lib/meal-photo";
import { serialiseMeal } from "../../_lib/serialise";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function mealId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The meal ID is invalid.");
  return id;
}
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const meal = await findMeal(getRequestDb(), identity.ownerKey, await mealId(context));
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");
    return jsonResponse({ meal: serialiseMeal(meal) });
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
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

    const patch = parseMealInput(requestBody.body, true);
    const id = await mealId(context);
    const db = getRequestDb();
    let bucket: MealPhotoBucket | null = null;
    let previousPhotoKey: string | null = null;

    if (requestBody.photo) {
      // Check ownership before uploading. This also avoids an orphan object
      // when a caller tries to edit a meal that does not exist.
      const existing = await findMeal(db, identity.ownerKey, id);
      if (!existing) throw new ApiError(404, "not_found", "Meal not found.");
      previousPhotoKey = existing.meal.photoKey;
      bucket = getPhotosBucket() as unknown as MealPhotoBucket;
    }

    let meal;
    let photoDeleted: boolean | undefined;
    if (requestBody.photo && bucket) {
      const saved = await replaceMealPhoto({
        bucket,
        ownerKey: identity.ownerKey,
        mealId: id,
        previousPhotoKey,
        photo: requestBody.photo,
        save: (uploaded) => {
          patch.photoKey = uploaded.key;
          patch.photoMimeType = uploaded.mimeType;
          patch.photoSizeBytes = uploaded.sizeBytes;
          return updateMeal(db, identity.ownerKey, id, patch, "dashboard").then((updated) => {
            if (!updated) throw new ApiError(404, "not_found", "Meal not found.");
            return updated;
          });
        },
        shouldDeletePrevious: async () => (
          !previousPhotoKey
          || !(await hasMealPhotoReference(db, identity.ownerKey, previousPhotoKey))
        ),
      });
      meal = saved.value;
      photoDeleted = saved.previousPhotoDeleted;
    } else {
      meal = await updateMeal(db, identity.ownerKey, id, patch, "dashboard");
    }
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");

    return jsonResponse({
      meal: serialiseMeal(meal),
      ...(photoDeleted === undefined ? {} : { photoDeleted }),
    });
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = await requireApiIdentity(request);
    const id = await mealId(context);
    const meal = await deleteMeal(getRequestDb(), identity.ownerKey, id);
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");

    let photoDeleted = true;
    if (meal.meal.photoKey && !(await hasMealPhotoReference(getRequestDb(), identity.ownerKey, meal.meal.photoKey))) {
      try {
        await getPhotosBucket().delete(meal.meal.photoKey);
      } catch (error) {
        photoDeleted = false;
        console.error(JSON.stringify({
          event: "meal_photo_delete_error",
          mealId: id,
          error: error instanceof Error ? error.message : "unknown_error",
        }));
      }
    }

    return jsonResponse({ deleted: true, mealId: id, photoDeleted });
  });
}
