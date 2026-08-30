import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalMealResult, MealWithItems } from "../db/repository";
import {
  AddMealRequestError,
  handleAddMealRequest,
  parseAddMealRequest,
  type AddMealHandlerOptions,
  type AddMealRequest,
  type StoredAddMealPhoto,
} from "../app/api/_lib/add-meal";
import { MAX_DASHBOARD_MEAL_PHOTO_BYTES, type MealPhotoUpload } from "../app/api/_lib/meal-photo";

const TOKEN = "test-chatgpt-token";
const OWNER_KEY = "owner-1";
const REQUEST_ID = "c5a84680-d0c7-4af6-a4f5-89495c3923ec";
const OTHER_REQUEST_ID = "d7e4b7f1-8f16-4d6e-9f9c-b9f4d5d4b0b6";
const EATEN_AT = "2026-08-30T18:25:00+07:00";
const EATEN_TS = Date.parse(EATEN_AT);
const NOW = 1_756_560_300_000;
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Body = Record<string, unknown>;

function mealBody(overrides: Body = {}): Body {
  return {
    request_id: REQUEST_ID,
    name: "Chicken rice and morning glory",
    kcal: 610,
    protein: 58,
    carbs: 41,
    fat: 20,
    eaten_at: EATEN_AT,
    ...overrides,
  };
}

function request(body: Body = mealBody(), headers: Record<string, string | undefined> = { authorization: `Bearer ${TOKEN}` }): Request {
  const requestHeaders: Record<string, string> = { "content-type": "application/json" };
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) requestHeaders[name] = value;
  }
  return new Request("https://calocount.test/api/add-meal", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function entry(
  ownerKey: string,
  input: AddMealRequest,
  id = `meal-${input.requestId}`,
  photo: StoredAddMealPhoto | null = null,
): MealWithItems {
  return {
    meal: {
      id,
      ownerKey,
      consumedAt: input.consumedAt,
      source: "chatgpt",
      caption: input.name,
      mealType: null,
      status: "complete",
      photoKey: photo?.key ?? null,
      photoMimeType: photo?.mimeType ?? null,
      photoSizeBytes: photo?.sizeBytes ?? null,
      totalCalories: input.kcal,
      totalProteinG: input.protein,
      totalCarbsG: input.carbs,
      totalFatG: input.fat,
      confidence: null,
      assumptionsJson: "[]",
      notes: null,
      externalRequestId: input.requestId,
      createdAt: input.consumedAt,
      updatedAt: input.consumedAt,
    },
    items: [],
  };
}

function handler(
  createMeal: AddMealHandlerOptions["createMeal"],
  body: Body = mealBody(),
  options: Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">> = {},
): Promise<Response> {
  return handleAddMealRequest(request(body), {
    expectedToken: TOKEN,
    ownerKey: OWNER_KEY,
    body,
    createMeal,
    ...options,
  }, NOW);
}

function imageResponse(bytes: Uint8Array = PNG_BYTES, contentType = "image/png", headers: Record<string, string> = {}): Response {
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      ...headers,
    },
  });
}

function imageRef(overrides: Body = {}): Body {
  return {
    name: "untrusted-name.png",
    id: "file-123",
    mime_type: "image/png",
    download_link: "https://files.oaiusercontent.com/file-123?sig=temporary",
    ...overrides,
  };
}

test("creates a meal from a JSON POST and returns the response contract", async () => {
  let received: { ownerKey: string; input: AddMealRequest; photo: StoredAddMealPhoto | null } | undefined;
  const body = mealBody({ name: "  Chicken rice and morning glory  " });
  const response = await handleAddMealRequest(request(body), {
    expectedToken: TOKEN,
    ownerKey: OWNER_KEY,
    readBody: async () => body,
    createMeal: async (ownerKey, input, photo) => {
      received = { ownerKey, input, photo };
      return { created: true, meal: entry(ownerKey, input, undefined, photo) };
    },
  }, NOW);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.deepEqual(await response.json(), {
    status: "created",
    meal_id: `meal-${REQUEST_ID}`,
    request_id: REQUEST_ID,
    name: "Chicken rice and morning glory",
    kcal: 610,
    protein: 58,
    carbs: 41,
    fat: 20,
    eaten_at: "2026-08-30T11:25:00.000Z",
    has_image: false,
  });
  assert.equal(received?.ownerKey, OWNER_KEY);
  assert.equal(received?.photo, null);
  assert.equal(parseAddMealRequest(mealBody({ openaiFileIdRefs: [] }), NOW).imageRef, undefined);
  assert.deepEqual(received?.input, {
    requestId: REQUEST_ID,
    name: "Chicken rice and morning glory",
    kcal: 610,
    protein: 58,
    carbs: 41,
    fat: 20,
    eatenAt: EATEN_AT,
    imageRef: undefined,
    consumedAt: EATEN_TS,
  });
});

test("downloads and stores the first valid OpenAI image reference", async () => {
  const fetched: Array<{ url: string; redirect: unknown }> = [];
  const uploaded: Array<{ ownerKey: string; requestId: string; photo: MealPhotoUpload }> = [];
  let savedPhoto: StoredAddMealPhoto | null = null;
  const response = await handler(
    async (ownerKey, input, photo) => {
      savedPhoto = photo;
      return { created: true, meal: entry(ownerKey, input, undefined, photo) };
    },
    mealBody({
      openaiFileIdRefs: [
        { id: "not-image", mime_type: "application/pdf", download_link: "https://files.oaiusercontent.com/pdf" },
        imageRef(),
      ],
    }),
    {
      fetchImage: async (url, init) => {
        fetched.push({ url: String(url), redirect: (init as RequestInit | undefined)?.redirect });
        return imageResponse();
      },
      uploadPhoto: async (ownerKey, requestId, photo) => {
        uploaded.push({ ownerKey, requestId, photo });
        return { key: "meals/owner/dashboard/meal/photo-1", mimeType: photo.contentType, sizeBytes: photo.sizeBytes };
      },
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(fetched, [{
    url: "https://files.oaiusercontent.com/file-123?sig=temporary",
    redirect: "error",
  }]);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0]?.ownerKey, OWNER_KEY);
  assert.equal(uploaded[0]?.requestId, REQUEST_ID);
  assert.equal(uploaded[0]?.photo.contentType, "image/png");
  assert.deepEqual(savedPhoto, {
    key: "meals/owner/dashboard/meal/photo-1",
    mimeType: "image/png",
    sizeBytes: PNG_BYTES.byteLength,
  });
  assert.equal((await response.json() as Record<string, unknown>).has_image, true);
});

test("records the meal and reports a failed image download", async () => {
  let createCalls = 0;
  let savedPhoto: StoredAddMealPhoto | null = null;
  const response = await handler(
    async (ownerKey, input, photo) => {
      createCalls += 1;
      savedPhoto = photo;
      return { created: true, meal: entry(ownerKey, input, undefined, photo) };
    },
    mealBody({ openaiFileIdRefs: [imageRef()] }),
    {
      fetchImage: async () => {
        throw new Error("network down");
      },
      uploadPhoto: async () => {
        throw new Error("must not upload when download fails");
      },
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    status: "created",
    meal_id: `meal-${REQUEST_ID}`,
    request_id: REQUEST_ID,
    name: "Chicken rice and morning glory",
    kcal: 610,
    protein: 58,
    carbs: 41,
    fat: 20,
    eaten_at: "2026-08-30T11:25:00.000Z",
    has_image: false,
    photo_status: "download_failed",
  });
  assert.equal(createCalls, 1);
  assert.equal(savedPhoto, null);
});

test("does not retry a failed image download after the meal UUID is stored", async () => {
  let existing: MealWithItems | null = null;
  let fetchCalls = 0;
  let createCalls = 0;
  const body = mealBody({ openaiFileIdRefs: [imageRef()] });
  const options = {
    findExistingMeal: async () => existing,
    fetchImage: async () => {
      fetchCalls += 1;
      throw new Error("network down");
    },
    uploadPhoto: async () => {
      throw new Error("must not upload when download fails");
    },
  } satisfies Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">>;

  const first = await handler(async (ownerKey, input, photo) => {
    createCalls += 1;
    existing = entry(ownerKey, input, "meal-without-photo", photo);
    return { created: true, meal: existing };
  }, body, options);
  const retry = await handler(async () => {
    createCalls += 1;
    throw new Error("the idempotency pre-check should return first");
  }, body, options);

  assert.equal(first.status, 201);
  assert.equal((await first.json() as Record<string, unknown>).photo_status, "download_failed");
  assert.equal(retry.status, 200);
  assert.equal((await retry.json() as Record<string, unknown>).has_image, false);
  assert.equal(fetchCalls, 1);
  assert.equal(createCalls, 1);
});

test("requires a valid Bearer token and checks it before reading the body", async () => {
  let readCalls = 0;
  let createCalls = 0;
  const run = (headers: Record<string, string | undefined>) => handleAddMealRequest(request(mealBody(), headers), {
    expectedToken: TOKEN,
    ownerKey: OWNER_KEY,
    readBody: async () => {
      readCalls += 1;
      return mealBody();
    },
    createMeal: async () => {
      createCalls += 1;
      throw new Error("must not create");
    },
  });

  for (const headers of [
    {},
    { authorization: "" },
    { authorization: "Basic test-chatgpt-token" },
    { authorization: "Bearer wrong" },
  ]) {
    await assert.rejects(run(headers), (error: unknown) => error instanceof AddMealRequestError
      && error.status === 401 && error.code === "unauthorized");
  }
  await assert.rejects(
    handleAddMealRequest(request(mealBody(), { authorization: "" }), {
      expectedToken: TOKEN,
      ownerKey: OWNER_KEY,
      body: mealBody(),
      createMeal: async () => {
        throw new Error("must not create");
      },
    }),
    (error: unknown) => error instanceof AddMealRequestError && error.status === 401,
  );
  assert.equal(readCalls, 0);
  assert.equal(createCalls, 0);
});

test("returns 503 when the server token is not configured", async () => {
  await assert.rejects(
    () => handleAddMealRequest(request(), {
      expectedToken: " ",
      ownerKey: OWNER_KEY,
      body: mealBody(),
      createMeal: async () => {
        throw new Error("must not create");
      },
    }),
    (error: unknown) => error instanceof AddMealRequestError && error.status === 503,
  );
});

test("rejects invalid JSON body values, duplicate-like values, and missing eaten_at", async () => {
  const invalidBodies = [
    mealBody({ request_id: "not-a-uuid" }),
    mealBody({ name: "   " }),
    mealBody({ name: "x".repeat(201) }),
    mealBody({ kcal: "610" }),
    mealBody({ kcal: Number.NaN }),
    mealBody({ protein: -1 }),
    mealBody({ carbs: 10_001 }),
    mealBody({ fat: Number.POSITIVE_INFINITY }),
    mealBody({ eaten_at: undefined }),
    mealBody({ eaten_at: "2026-08-30 18:25:00+07:00" }),
    mealBody({ eaten_at: "2026-02-30T18:25:00+07:00" }),
    mealBody({ eaten_at: "2026-08-30T18:25:00" }),
    mealBody({ eaten_at: "2026-08-30T18:25:00+24:00" }),
    mealBody({ openaiFileIdRefs: ["file-123"] }),
  ];
  let calls = 0;
  for (const body of invalidBodies) {
    await assert.rejects(
      () => handler(async () => {
        calls += 1;
        throw new Error("must not create");
      }, body),
      (error: unknown) => error instanceof AddMealRequestError && error.status === 400,
    );
  }
  assert.equal(calls, 0);
});

test("accepts regional OpenAI image hosts and rejects deceptive lookalikes", () => {
  const regionalLink = "https://sdmntpraustraliaeast.oaiusercontent.com/file-123?sig=temporary";
  const regionalRequest = parseAddMealRequest(mealBody({
    openaiFileIdRefs: [imageRef({ download_link: regionalLink })],
  }), NOW);
  assert.equal(regionalRequest.imageRef?.downloadLink, regionalLink);

  const legacyLink = "https://files.openai.com/file-123?sig=temporary";
  const legacyRequest = parseAddMealRequest(mealBody({
    openaiFileIdRefs: [imageRef({ download_link: legacyLink })],
  }), NOW);
  assert.equal(legacyRequest.imageRef?.downloadLink, legacyLink);

  for (const downloadLink of [
    "https://oaiusercontent.com/file-123",
    "https://eviloaiusercontent.com/file-123",
    "https://oaiusercontent.com.evil.example/file-123",
  ]) {
    assert.throws(
      () => parseAddMealRequest(mealBody({ openaiFileIdRefs: [imageRef({ download_link: downloadLink })] }), NOW),
      (error: unknown) => error instanceof AddMealRequestError
        && error.status === 400 && error.code === "invalid_image_refs",
    );
  }
});

test("rejects unsafe or unsupported image references before download", async () => {
  const refs = [
    imageRef({ mime_type: "image/gif" }),
    imageRef({ download_link: "http://files.oaiusercontent.com/file" }),
    imageRef({ download_link: "https://example.com/file" }),
    imageRef({ download_link: "https://files.oaiusercontent.com/" }),
    imageRef({ download_link: "https://user:pass@files.oaiusercontent.com/file" }),
  ];
  let fetchCalls = 0;
  for (const ref of refs) {
    await assert.rejects(
      () => handler(async () => {
        throw new Error("must not create");
      }, mealBody({ openaiFileIdRefs: [ref] }), {
        fetchImage: async () => {
          fetchCalls += 1;
          return imageResponse();
        },
      }),
      (error: unknown) => error instanceof AddMealRequestError
        && error.status === 400 && error.code === "invalid_image_refs",
    );
  }
  assert.equal(fetchCalls, 0);
});

test("keeps invalid image and oversized downloads as hard errors", async () => {
  const uploadPhoto = async (_ownerKey: string, _requestId: string, photo: MealPhotoUpload) => ({
    key: "photo-test",
    mimeType: photo.contentType,
    sizeBytes: photo.sizeBytes,
  });
  await assert.rejects(
    () => handler(async () => {
      throw new Error("must not create");
    }, mealBody({ openaiFileIdRefs: [imageRef()] }), {
      fetchImage: async () => imageResponse(PNG_BYTES, "image/jpeg"),
      uploadPhoto,
    }),
    (error: unknown) => error instanceof AddMealRequestError
      && error.status === 400 && error.code === "invalid_image",
  );

  await assert.rejects(
    () => handler(async () => {
      throw new Error("must not create");
    }, mealBody({ openaiFileIdRefs: [imageRef()] }), {
      fetchImage: async () => imageResponse(PNG_BYTES, "image/png", {
        "content-length": String(MAX_DASHBOARD_MEAL_PHOTO_BYTES + 1),
      }),
      uploadPhoto,
    }),
    (error: unknown) => error instanceof AddMealRequestError
      && error.status === 413 && error.code === "payload_too_large",
  );

  const oversizedStream = new Uint8Array(MAX_DASHBOARD_MEAL_PHOTO_BYTES + 1);
  oversizedStream.set(PNG_BYTES);
  await assert.rejects(
    () => handler(async () => {
      throw new Error("must not create");
    }, mealBody({ openaiFileIdRefs: [imageRef()] }), {
      fetchImage: async () => imageResponse(oversizedStream),
      uploadPhoto,
    }),
    (error: unknown) => error instanceof AddMealRequestError
      && error.status === 413 && error.code === "payload_too_large",
  );
});

test("same UUID retry returns the original meal without downloading or uploading again", async () => {
  let existing: MealWithItems | null = null;
  let createCalls = 0;
  let fetchCalls = 0;
  let uploadCalls = 0;
  const options = {
    findExistingMeal: async () => existing,
    fetchImage: async () => {
      fetchCalls += 1;
      return imageResponse();
    },
    uploadPhoto: async (_ownerKey: string, _requestId: string, photo: MealPhotoUpload) => {
      uploadCalls += 1;
      return { key: "photo-original", mimeType: photo.contentType, sizeBytes: photo.sizeBytes };
    },
  } satisfies Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">>;
  const firstBody = mealBody({ openaiFileIdRefs: [imageRef()] });
  const first = await handler(async (ownerKey, input, photo) => {
    createCalls += 1;
    existing = entry(ownerKey, input, "meal-original", photo);
    return { created: true, meal: existing };
  }, firstBody, options);
  const retry = await handler(async () => {
    createCalls += 1;
    throw new Error("the idempotency pre-check should return first");
  }, mealBody({ name: "Changed on retry", kcal: 1, openaiFileIdRefs: [imageRef()] }), options);

  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), {
    status: "already_exists",
    meal_id: "meal-original",
    request_id: REQUEST_ID,
    name: "Chicken rice and morning glory",
    kcal: 610,
    protein: 58,
    carbs: 41,
    fat: 20,
    eaten_at: "2026-08-30T11:25:00.000Z",
    has_image: true,
  });
  assert.equal(createCalls, 1);
  assert.equal(fetchCalls, 1);
  assert.equal(uploadCalls, 1);
});

test("concurrent image uploads keep the winner and delete the conflict loser", async () => {
  let checked = 0;
  let releaseChecks!: () => void;
  const checksReleased = new Promise<void>((resolve) => { releaseChecks = resolve; });
  let existing: MealWithItems | null = null;
  const uploads: StoredAddMealPhoto[] = [];
  const deleted: string[] = [];
  const created: boolean[] = [];
  const options = {
    findExistingMeal: async () => {
      checked += 1;
      if (checked === 2) releaseChecks();
      await checksReleased;
      return existing;
    },
    fetchImage: async () => imageResponse(),
    uploadPhoto: async (_ownerKey: string, _requestId: string, photo: MealPhotoUpload) => {
      const uploaded = { key: `photo-${uploads.length + 1}`, mimeType: photo.contentType, sizeBytes: photo.sizeBytes };
      uploads.push(uploaded);
      return uploaded;
    },
    deletePhoto: async (photo: StoredAddMealPhoto) => {
      deleted.push(photo.key);
    },
  } satisfies Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">>;
  const create = async (ownerKey: string, input: AddMealRequest, photo: StoredAddMealPhoto | null): Promise<ExternalMealResult> => {
    if (existing) {
      created.push(false);
      return { created: false, meal: existing };
    }
    const meal = entry(ownerKey, input, "meal-winner", photo);
    existing = meal;
    created.push(true);
    return { created: true, meal };
  };

  const [first, second] = await Promise.all([
    handler(create, mealBody({ openaiFileIdRefs: [imageRef()] }), options),
    handler(create, mealBody({ openaiFileIdRefs: [imageRef()] }), options),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 201]);
  assert.equal(uploads.length, 2);
  assert.equal(created.filter(Boolean).length, 1);
  assert.equal(deleted.length, 1);
  assert.ok(uploads.some((photo) => photo.key === deleted[0]));
});

test("deletes an uploaded image when the database save fails", async () => {
  const deleted: string[] = [];
  await assert.rejects(
    () => handler(async () => {
      throw new Error("database failed");
    }, mealBody({ openaiFileIdRefs: [imageRef()] }), {
      fetchImage: async () => imageResponse(),
      uploadPhoto: async (_ownerKey: string, _requestId: string, photo: MealPhotoUpload) => ({
        key: "photo-orphan",
        mimeType: photo.contentType,
        sizeBytes: photo.sizeBytes,
      }),
      deletePhoto: async (photo: StoredAddMealPhoto) => {
        deleted.push(photo.key);
      },
    }),
    /database failed/,
  );
  assert.deepEqual(deleted, ["photo-orphan"]);
});

test("identical meal data with different UUIDs creates two meals", async () => {
  const ids: string[] = [];
  const create = async (ownerKey: string, input: AddMealRequest): Promise<ExternalMealResult> => {
    ids.push(input.requestId);
    return { created: true, meal: entry(ownerKey, input) };
  };
  const first = await handler(create, mealBody({ request_id: REQUEST_ID }));
  const second = await handler(create, mealBody({ request_id: OTHER_REQUEST_ID }));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(ids, [REQUEST_ID, OTHER_REQUEST_ID]);
});
