import assert from "node:assert/strict";
import test from "node:test";

import {
  createMealWithDashboardPhoto,
  deleteUploadedMealPhoto,
  isMultipartMealRequest,
  MAX_DASHBOARD_MEAL_MULTIPART_BYTES,
  MAX_DASHBOARD_MEAL_PHOTO_BYTES,
  MealPhotoError,
  parseMultipartMealRequest,
  replaceMealPhoto,
  type MealPhotoBucket,
  uploadDashboardMealPhoto,
} from "../app/api/_lib/meal-photo";

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function multipartRequest(entries: { readonly name: string; readonly value: string | File }[]): Request {
  const form = new FormData();
  for (const entry of entries) form.append(entry.name, entry.value);
  return new Request("https://calocount.test/api/meals", { method: "POST", body: form });
}

function streamingMultipartRequest(
  chunks: readonly Uint8Array[],
  extraHeaders: Record<string, string> = {},
  onCancel?: () => void,
): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
  const requestInit = {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=calocount-stream", ...extraHeaders },
    body,
    duplex: "half",
  } as RequestInit & { readonly duplex: "half" };
  return new Request("https://calocount.test/api/meals", requestInit);
}

test("multipart meal requests accept the existing JSON payload with a JPEG photo", async () => {
  const request = multipartRequest([
    {
      name: "payload",
      value: JSON.stringify({
        caption: "Chicken and rice",
        mealType: "lunch",
        items: [{ name: "Chicken", calories: 400, proteinG: 35 }],
        photoKey: "private/old-key",
      }),
    },
    { name: "photo", value: new File([JPEG_BYTES], "lunch.jpg", { type: "image/jpeg" }) },
  ]);

  assert.equal(isMultipartMealRequest(request), true);
  const parsed = await parseMultipartMealRequest(request);

  assert.equal(parsed.body.caption, "Chicken and rice");
  assert.deepEqual(parsed.body.items, [{ name: "Chicken", calories: 400, proteinG: 35 }]);
  assert.equal(parsed.body.photoKey, undefined);
  assert.equal(parsed.body.photoMimeType, undefined);
  assert.equal(parsed.photo?.contentType, "image/jpeg");
  assert.equal(parsed.photo?.sizeBytes, JPEG_BYTES.byteLength);
  assert.deepEqual(new Uint8Array(parsed.photo?.bytes ?? []), JPEG_BYTES);
});

test("multipart meal requests also accept direct scalar fields and a PNG photo", async () => {
  const parsed = await parseMultipartMealRequest(multipartRequest([
    { name: "caption", value: "A quick snack" },
    { name: "mealType", value: "snack" },
    { name: "items", value: JSON.stringify([{ name: "Yogurt", calories: 120 }]) },
    { name: "photo", value: new File([PNG_BYTES], "snack.png", { type: "image/png" }) },
  ]));

  assert.deepEqual(parsed.body, {
    caption: "A quick snack",
    mealType: "snack",
    items: [{ name: "Yogurt", calories: 120 }],
  });
  assert.equal(parsed.photo?.contentType, "image/png");
});

test("multipart photo validation rejects unsupported, mismatched, and oversized files", async () => {
  await assert.rejects(
    () => parseMultipartMealRequest(multipartRequest([
      { name: "photo", value: new File([JPEG_BYTES], "meal.gif", { type: "image/gif" }) },
    ])),
    (error: unknown) => error instanceof MealPhotoError && error.code === "unsupported_photo_type" && error.status === 415,
  );

  await assert.rejects(
    () => parseMultipartMealRequest(multipartRequest([
      { name: "photo", value: new File([JPEG_BYTES], "meal.png", { type: "image/png" }) },
    ])),
    (error: unknown) => error instanceof MealPhotoError && error.code === "unsupported_photo_type" && error.status === 415,
  );

  const oversized = new File([new Uint8Array(MAX_DASHBOARD_MEAL_PHOTO_BYTES + 1)], "large.jpg", { type: "image/jpeg" });
  await assert.rejects(
    () => parseMultipartMealRequest(multipartRequest([{ name: "photo", value: oversized }])),
    (error: unknown) => error instanceof MealPhotoError && error.code === "payload_too_large" && error.status === 413,
  );

  const declaredLarge = new Request("https://calocount.test/api/meals", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=calocount",
      "content-length": String(MAX_DASHBOARD_MEAL_MULTIPART_BYTES + 1),
    },
    body: "--calocount--",
  });
  await assert.rejects(
    () => parseMultipartMealRequest(declaredLarge),
    (error: unknown) => error instanceof MealPhotoError && error.code === "payload_too_large" && error.status === 413,
  );
});

test("multipart parsing rejects an oversized streamed body before formData parsing", async () => {
  const chunks = [
    new Uint8Array(MAX_DASHBOARD_MEAL_MULTIPART_BYTES),
    new Uint8Array(1),
  ] as const;

  for (const [label, headers] of [
    ["without Content-Length", {}],
    ["with a misleading Content-Length", { "content-length": "1" }],
  ] as const) {
    let cancelled = false;
    await assert.rejects(
      () => parseMultipartMealRequest(streamingMultipartRequest(chunks, headers, () => { cancelled = true; })),
      (error: unknown) => error instanceof MealPhotoError && error.code === "payload_too_large" && error.status === 413,
      label,
    );
    assert.equal(cancelled, true, `${label} stream should be cancelled after the size limit is exceeded`);
  }
});

test("multipart parsing maps a malformed streamed body to invalid_multipart", async () => {
  const request = streamingMultipartRequest([new TextEncoder().encode("not a multipart form")]);

  await assert.rejects(
    () => parseMultipartMealRequest(request),
    (error: unknown) => error instanceof MealPhotoError && error.code === "invalid_multipart" && error.status === 400,
  );
});

test("multipart parsing allows the exact body-size cap to reach form validation", async () => {
  const body = new Uint8Array(MAX_DASHBOARD_MEAL_MULTIPART_BYTES);
  body.fill(0x20);

  await assert.rejects(
    () => parseMultipartMealRequest(streamingMultipartRequest([body])),
    (error: unknown) => error instanceof MealPhotoError && error.code === "invalid_multipart" && error.status === 400,
  );
});

test("dashboard photo upload uses an owner-scoped key and R2 content type metadata", async () => {
  const events: string[] = [];
  let storedKey = "";
  let storedBytes: ArrayBuffer | null = null;
  let storedOptions: unknown;
  const bucket: MealPhotoBucket = {
    async put(key, value, options) {
      storedKey = key;
      storedBytes = value;
      storedOptions = options;
      events.push("put");
      return null;
    },
    async delete(key) {
      events.push(`delete:${key}`);
    },
  };

  const photo = await parseMultipartMealRequest(multipartRequest([
    { name: "photo", value: new File([JPEG_BYTES], "meal.jpg", { type: "image/jpeg" }) },
  ])).then((parsed) => parsed.photo);
  assert.ok(photo);

  const uploaded = await uploadDashboardMealPhoto({ bucket, ownerKey: "owner@example.com", mealId: "meal-1", photo });
  assert.match(uploaded.key, /^meals\/owner-example-com\/dashboard\/meal-1\/[0-9a-f-]+$/);
  assert.equal(storedKey, uploaded.key);
  assert.deepEqual(new Uint8Array(storedBytes ?? []), JPEG_BYTES);
  assert.deepEqual(storedOptions, { httpMetadata: { contentType: "image/jpeg" } });
  assert.equal(uploaded.sizeBytes, JPEG_BYTES.byteLength);
  assert.deepEqual(events, ["put"]);
});

test("create photo cleanup removes the new object when the meal save fails", async () => {
  const events: string[] = [];
  let uploadedKey = "";
  const bucket: MealPhotoBucket = {
    async put(key) {
      uploadedKey = key;
      events.push("put");
      return { size: JPEG_BYTES.byteLength };
    },
    async delete(key) {
      events.push(`delete:${key}`);
    },
  };
  const photo = { bytes: JPEG_BYTES.buffer.slice(0), contentType: "image/jpeg" as const, sizeBytes: JPEG_BYTES.byteLength };

  await assert.rejects(
    () => createMealWithDashboardPhoto({
      bucket,
      ownerKey: "owner",
      photo,
      save: async () => {
        events.push("save");
        throw new Error("d1 failed");
      },
    }),
    /d1 failed/,
  );
  assert.deepEqual(events, ["put", "save", `delete:${uploadedKey}`]);
});

test("replacement cleanup preserves the old object until save succeeds", async () => {
  const successEvents: string[] = [];
  const successBucket: MealPhotoBucket = {
    async put() {
      successEvents.push("put");
      return { size: JPEG_BYTES.byteLength };
    },
    async delete(key) {
      successEvents.push(`delete:${key}`);
    },
  };
  const photo = { bytes: JPEG_BYTES.buffer.slice(0), contentType: "image/jpeg" as const, sizeBytes: JPEG_BYTES.byteLength };
  const saved = await replaceMealPhoto({
    bucket: successBucket,
    ownerKey: "owner",
    mealId: "meal-1",
    previousPhotoKey: "meals/old/original",
    photo,
    save: async () => {
      successEvents.push("save");
      return "saved";
    },
  });
  assert.equal(saved.value, "saved");
  assert.equal(saved.previousPhotoDeleted, true);
  assert.deepEqual(successEvents, ["put", "save", "delete:meals/old/original"]);

  const sharedEvents: string[] = [];
  const sharedSaved = await replaceMealPhoto({
    bucket: {
      async put() {
        sharedEvents.push("put");
        return { size: JPEG_BYTES.byteLength };
      },
      async delete(key) {
        sharedEvents.push(`delete:${key}`);
      },
    },
    ownerKey: "owner",
    mealId: "meal-1",
    previousPhotoKey: "meals/shared/original",
    photo,
    save: async () => {
      sharedEvents.push("save");
      return "saved";
    },
    shouldDeletePrevious: async () => false,
  });
  assert.equal(sharedSaved.previousPhotoDeleted, undefined);
  assert.deepEqual(sharedEvents, ["put", "save"]);

  const failureEvents: string[] = [];
  let newKey = "";
  const failureBucket: MealPhotoBucket = {
    async put(key) {
      newKey = key;
      failureEvents.push("put");
      return { size: JPEG_BYTES.byteLength };
    },
    async delete(key) {
      failureEvents.push(`delete:${key}`);
    },
  };
  await assert.rejects(
    () => replaceMealPhoto({
      bucket: failureBucket,
      ownerKey: "owner",
      mealId: "meal-1",
      previousPhotoKey: "meals/old/original",
      photo,
      save: async () => {
        failureEvents.push("save");
        throw new Error("d1 failed");
      },
    }),
    /d1 failed/,
  );
  assert.deepEqual(failureEvents, ["put", "save", `delete:${newKey}`]);
});

test("photo cleanup reports a failed delete without hiding the original failure", async () => {
  const bucket: MealPhotoBucket = {
    async put() {
      return { size: 1 };
    },
    async delete() {
      throw new Error("r2 unavailable");
    },
  };
  assert.equal(await deleteUploadedMealPhoto(bucket, "meals/owner/dashboard/new/photo"), false);
});
