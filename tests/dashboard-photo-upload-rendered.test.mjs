import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard add and edit forms support an optional bounded meal photo", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /mealPhotoAccept = "image\/jpeg,image\/png,image\/webp"/);
  assert.match(page, /maxDashboardMealPhotoBytes = 10 \* 1024 \* 1024/);
  assert.match(page, /form\.set\("payload", JSON\.stringify\(payload\)\)/);
  assert.match(page, /form\.set\("photo", photo, photo\.name\)/);
  assert.match(page, /name="photo" type="file" accept=\{mealPhotoAccept\}/);
  assert.match(page, /Replace photo \(optional\)/);
  assert.match(page, /Current photo stays unless you select a replacement/);
  assert.match(page, /mealRequestOptions\(mealPayload\(meal\), mealPhotoDrafts\[mealId\]\)/);
  assert.match(page, /mealRequestOptions\(mealPayload\(nextMeal, consumedAt\), photo\)/);
});
