import assert from "node:assert/strict";
import test from "node:test";

import { photoUrlForKey, publicPhotoUrlForMealId } from "../app/photo-url";

test("photo URLs encode each R2 key segment without changing path separators", () => {
  assert.equal(photoUrlForKey("meals/job 1/original%2Fphoto"), "/api/photos/meals/job%201/original%252Fphoto");
  assert.equal(photoUrlForKey("meals/job/original"), "/api/photos/meals/job/original");
});

test("missing photo keys do not produce a request URL", () => {
  assert.equal(photoUrlForKey(null), null);
  assert.equal(photoUrlForKey(""), null);
  assert.equal(photoUrlForKey("meals//original"), null);
});

test("public photo URLs use only validated meal IDs", () => {
  assert.equal(publicPhotoUrlForMealId("meal_123-abc"), "/meal-photos/meal_123-abc");
  assert.equal(publicPhotoUrlForMealId(" meal-1 "), "/meal-photos/meal-1");
  assert.equal(publicPhotoUrlForMealId("meal/1"), null);
  assert.equal(publicPhotoUrlForMealId("meal 1"), null);
  assert.equal(publicPhotoUrlForMealId(""), null);
  assert.equal(publicPhotoUrlForMealId(null), null);
});
