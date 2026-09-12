import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicMealPhotoResponse, type PublicPhotoMeal } from "../app/api/_lib/public-meal-photo";
import { PublicSummaryConfigError } from "../app/api/_lib/public-summary";
import { findMealPhoto } from "../db/repository";
import { createSqliteTestDb } from "./helpers/sqlite-db";

const now = new Date("2026-08-29T12:00:00Z");
const meal: PublicPhotoMeal = {
  id: "meal-1", ownerKey: "owner-1", status: "complete",
  photoKey: "private/photo-key", photoMimeType: "image/jpeg", consumedAt: now.getTime(),
};
const photo = { body: new Uint8Array([1, 2, 3]), httpEtag: '"etag-1"', size: 3 };

test("public photo delivery fails closed before loading data when the owner is missing", async () => {
  await assert.rejects(buildPublicMealPhotoResponse({
    ownerKey: " ", mealId: meal.id, now,
    loadMeal: async () => { throw new Error("must not load"); },
    loadPhoto: async () => { throw new Error("must not load"); },
  }), PublicSummaryConfigError);
});

test("public photos use one owned metadata lookup and keep private keys out of the response", async () => {
  const lookups: unknown[] = [];
  const response = await buildPublicMealPhotoResponse({
    ownerKey: " owner-1 ", mealId: meal.id, now,
    loadMeal: async (input) => { lookups.push(input); return meal; },
    loadPhoto: async (key) => { assert.equal(key, meal.photoKey); return photo; },
  });
  assert.deepEqual(lookups, [{ ownerKey: "owner-1", mealId: meal.id }]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("content-length"), "3");
  assert.equal(response.headers.get("etag"), photo.httpEtag);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), photo.body);
});

test("public photo delivery revalidates visibility for conditional requests", async () => {
  for (const [visibleMeal, expectedStatus] of [[meal, 304], [null, 404]] as const) {
    let photoLoads = 0;
    const response = await buildPublicMealPhotoResponse({
      ownerKey: "owner-1", mealId: meal.id, now, ifNoneMatch: photo.httpEtag,
      loadMeal: async () => visibleMeal,
      loadPhoto: async () => { photoLoads++; return photo; },
    });
    assert.equal(response.status, expectedStatus);
    assert.equal(photoLoads, visibleMeal ? 1 : 0);
    if (visibleMeal) assert.equal(await response.text(), "");
  }
});

test("public photos reject invalid IDs before database access", async () => {
  const response = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1", mealId: "../meal-1", now,
    loadMeal: async () => { throw new Error("must not load"); },
    loadPhoto: async () => { throw new Error("must not load"); },
  });
  assert.equal(response.status, 404);
});

test("public photos reject another owner, missing photos, incomplete meals, and dates outside the UTC window", async () => {
  const invalidMeals: PublicPhotoMeal[] = [
    { ...meal, ownerKey: "other-owner" }, { ...meal, id: "other-meal" },
    { ...meal, status: "pending" }, { ...meal, photoKey: null },
    { ...meal, photoMimeType: "text/html" },
    { ...meal, consumedAt: Date.parse("2026-08-22T23:59:59Z") },
    { ...meal, consumedAt: Date.parse("2026-08-30T00:00:00Z") },
  ];
  for (const invalidMeal of invalidMeals) {
    const response = await buildPublicMealPhotoResponse({
      ownerKey: "owner-1", mealId: meal.id, now,
      loadMeal: async () => invalidMeal,
      loadPhoto: async () => { throw new Error("must not load"); },
    });
    assert.equal(response.status, 404);
  }
});

test("public photos include the exact start of the seven-day window and handle missing R2 objects", async () => {
  let loads = 0;
  const response = await buildPublicMealPhotoResponse({
    ownerKey: "owner-1", mealId: meal.id, now,
    loadMeal: async () => ({ ...meal, consumedAt: Date.parse("2026-08-23T00:00:00Z") }),
    loadPhoto: async () => { loads++; return null; },
  });
  assert.equal(loads, 1);
  assert.equal(response.status, 404);
});

test("photo metadata uses one SQL query without loading items and enforces ownership", async () => {
  const fixture = createSqliteTestDb();
  try {
    fixture.sqlite.prepare("INSERT INTO meal_logs (id, owner_key, consumed_at) VALUES (?, ?, ?)").run(meal.id, meal.ownerKey, meal.consumedAt);
    assert.equal((await findMealPhoto({ db: fixture.db, ownerKey: meal.ownerKey, mealId: meal.id }))?.id, meal.id);
    assert.equal(fixture.queries.length, 1);
    assert.equal(await findMealPhoto({ db: fixture.db, ownerKey: "other-owner", mealId: meal.id }), undefined);
  } finally {
    fixture.sqlite.close();
  }
});
