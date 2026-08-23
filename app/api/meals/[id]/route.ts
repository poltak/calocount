import { deleteMeal, findMeal, updateMeal } from "../../../../db/repository";
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
import { serialiseMeal } from "../../_lib/serialise";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function mealId(context: RouteContext): Promise<string> {
  const id = (await context.params).id?.trim();
  if (!id || id.length > 120) throw new ApiError(400, "invalid_id", "The meal ID is invalid.");
  return id;
}
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const meal = await findMeal(getRequestDb(), identity.ownerKey, await mealId(context));
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");
    return jsonResponse({ meal: serialiseMeal(meal) });
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const patch = parseMealInput(await parseJsonBody(request), true);
    const meal = await updateMeal(getRequestDb(), identity.ownerKey, await mealId(context), patch, "dashboard");
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");
    return jsonResponse({ meal: serialiseMeal(meal) });
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return withApiErrors(async () => {
    const identity = requireApiIdentity(request);
    const id = await mealId(context);
    const meal = await deleteMeal(getRequestDb(), identity.ownerKey, id);
    if (!meal) throw new ApiError(404, "not_found", "Meal not found.");

    let photoDeleted = true;
    if (meal.meal.photoKey) {
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
