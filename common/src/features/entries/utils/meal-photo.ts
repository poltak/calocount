export const MEAL_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The photo of an entry is no larger than this. The backend refuses more. */
export const MAX_MEAL_PHOTO_BYTES = 10 * 1024 * 1024;

export const MEAL_PHOTO_TYPE_MESSAGE = "Select a JPEG, PNG, or WebP image.";
export const MEAL_PHOTO_SIZE_MESSAGE =
  "Select an image that is 10 MB or smaller.";

/** Why a chosen file cannot be a photo, or `null` when it can. */
export function mealPhotoError(photo: {
  type: string;
  size: number;
}): string | null {
  if (!MEAL_PHOTO_TYPES.includes(photo.type)) {
    return MEAL_PHOTO_TYPE_MESSAGE;
  }
  if (photo.size > MAX_MEAL_PHOTO_BYTES) {
    return MEAL_PHOTO_SIZE_MESSAGE;
  }
  return null;
}
