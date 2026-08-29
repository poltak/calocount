import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicMealPhotoResponse } from "../app/api/_lib/public-meal-photo";
import { PublicSummaryConfigError } from "../app/api/_lib/public-summary";

function summaryWithMeal({
  id = "meal-1",
  status = "complete",
  photoKey = "private/photo-key",
  photoMimeType = "image/jpeg",
  consumedAt = Date.parse("2026-08-29T12:00:00Z"),
}: {
  id?: string;
  status?: string;
  photoKey?: string | null;
  photoMimeType?: string | null;
  consumedAt?: number;
} = {}) {
  return {
    date: "2026-08-29",
    targets: { calories: 2_100, proteinG: 150 },
    today: { calories: 500, proteinG: 40, carbsG: 50, fatG: 15, mealCount: 1 },
    sevenDay: {
      calories: 500,
      proteinG: 40,
      averageCalories: 500,
      averageProteinG: 40,
      daysWithMeals: 1,
    },
    recentMeals: [{
      meal: {
        id,
        ownerKey: "owner-1",
        consumedAt,
        source: "telegram",
        caption: "Lunch",
        mealType: "lunch",
        status,
        photoKey,
        photoMimeType,
        photoSizeBytes: 3,
        totalCalories: 500,
        totalProteinG: 40,
        totalCarbsG: 50,
        totalFatG: 15,
        confidence: 0.9,
        assumptionsJson: "[]",
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
      items: [],
    }],
    recentWeights: [],
  } as never;
}

test("public photo delivery fails closed before loading data when the owner is not configured", async () => {
  await assert.rejects(
    buildPublicMealPhotoResponse({
      ownerKey: " ",
      mealId: "meal-1",
      loadSummary: async () => {
        throw new Error("must not load");
      },
      loadPhoto: async () => {
        throw new Error("must not load");
      },
    }),
    (error: unknown) => error instanceof PublicSummaryConfigError,
  );
});

test("public photo delivery streams a safe projected photo without exposing its key", async () => {
  const requestedOwners: string[] = [];
  const requestedKeys: string[] = [];
  const response = await buildPublicMealPhotoResponse({
    ownerKey: " owner-1 ",
    mealId: "meal-1",
    loadSummary: async (ownerKey) => {
      requestedOwners.push(ownerKey);
      return summaryWithMeal();
    },
    loadPhoto: async (photoKey) => {
      requestedKeys.push(photoKey);
      return { body: new Uint8Array([1, 2, 3]), httpEtag: '"etag-1"', size: 3 };
    },
  });

  assert.deepEqual(requestedOwners, ["owner-1"]);
  assert.deepEqual(requestedKeys, ["private/photo-key"]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("content-length"), "3");
  assert.equal(response.headers.get("etag"), '"etag-1"');
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test("public photo delivery supports conditional requests", async () => {
  const response = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "meal-1",
    ifNoneMatch: '"etag-1"',
    loadSummary: async () => summaryWithMeal(),
    loadPhoto: async () => ({ body: new Uint8Array([1, 2, 3]), httpEtag: '"etag-1"', size: 3 }),
  });

  assert.equal(response.status, 304);
  assert.equal(response.headers.get("etag"), '"etag-1"');
  assert.equal(await response.text(), "");
});

test("public photo delivery rejects invalid, non-projected, pending, and unsafe meals", async () => {
  let photoLoads = 0;
  const loadPhoto = async () => {
    photoLoads += 1;
    return { body: new Uint8Array([1]), httpEtag: '"etag"', size: 1 };
  };

  const invalid = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "../meal-1",
    loadSummary: async () => {
      throw new Error("must not load");
    },
    loadPhoto,
  });
  const nonProjected = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "old-meal",
    loadSummary: async () => summaryWithMeal(),
    loadPhoto,
  });
  const pending = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "meal-1",
    loadSummary: async () => summaryWithMeal({ status: "pending" }),
    loadPhoto,
  });
  const unsafeMime = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "meal-1",
    loadSummary: async () => summaryWithMeal({ photoMimeType: "text/html" }),
    loadPhoto,
  });
  const oldMeal = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "meal-1",
    loadSummary: async () => summaryWithMeal({ consumedAt: Date.parse("2026-08-22T23:59:59Z") }),
    loadPhoto,
  });

  assert.equal(invalid.status, 404);
  assert.equal(nonProjected.status, 404);
  assert.equal(pending.status, 404);
  assert.equal(unsafeMime.status, 404);
  assert.equal(oldMeal.status, 404);
  assert.equal(photoLoads, 0);
});

test("public photo delivery returns not found when the private object is missing", async () => {
  const response = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1",
    mealId: "meal-1",
    loadSummary: async () => summaryWithMeal(),
    loadPhoto: async () => null,
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
