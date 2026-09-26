import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalMealResult, MealWithItems } from "../db/repository";
import {
  AddMealRequestError,
  createHeicPhotoConverter,
  handleAuthorizedAddMealRequest,
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
const HEIC_BYTES = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
  0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

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

test("authorized meal core works without bearer-token options", async () => {
  let savedOwner: string | undefined;
  const response = await handleAuthorizedAddMealRequest(OWNER_KEY, mealBody(), {
    createMeal: async (ownerKey, input, photo) => {
      savedOwner = ownerKey;
      return { created: true, meal: entry(ownerKey, input, undefined, photo) };
    },
  }, NOW);

  assert.equal(response.status, 201);
  assert.equal(savedOwner, OWNER_KEY);
  assert.equal((await response.json() as Record<string, unknown>).request_id, REQUEST_ID);
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

test("infers an omitted photo MIME type from the response and validates the image bytes", async () => {
  const uploaded: MealPhotoUpload[] = [];
  const response = await handler(
    async (ownerKey, input, photo) => ({ created: true, meal: entry(ownerKey, input, undefined, photo) }),
    mealBody({ openaiFileIdRefs: [{
      id: "file-123",
      download_link: "https://files.oaiusercontent.com/file-123?sig=temporary",
    }] }),
    {
      fetchImage: async () => imageResponse(PNG_BYTES, "image/png; charset=binary"),
      uploadPhoto: async (_ownerKey, _requestId, photo) => {
        uploaded.push(photo);
        return { key: "photo-inferred", mimeType: photo.contentType, sizeBytes: photo.sizeBytes };
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0]?.contentType, "image/png");
  assert.equal((await response.json() as Record<string, unknown>).has_image, true);
});

test("converts an external HEIC photo to JPEG before storage", async () => {
  let conversionInput: Uint8Array | undefined;
  let outputFormat: string | undefined;
  const convertHeicToJpeg = createHeicPhotoConverter({
    input: (stream) => ({
      transform: () => {
        throw new Error("Unexpected image transform");
      },
      draw: () => {
        throw new Error("Unexpected image draw");
      },
      output: async ({ format }) => {
        outputFormat = format;
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          chunks.push(chunk.value);
        }
        conversionInput = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          conversionInput.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          response: () => imageResponse(JPEG_BYTES, "image/jpeg"),
          contentType: () => "image/jpeg",
          image: () => new ReadableStream<Uint8Array>(),
        };
      },
    }),
  });
  const uploaded: MealPhotoUpload[] = [];
  const response = await handler(
    async (ownerKey, input, photo) => ({ created: true, meal: entry(ownerKey, input, undefined, photo) }),
    mealBody({ openaiFileIdRefs: [imageRef({ mime_type: "image/heic" })] }),
    {
      fetchImage: async () => imageResponse(HEIC_BYTES, "image/heic"),
      convertHeicToJpeg,
      uploadPhoto: async (_ownerKey, _requestId, photo) => {
        uploaded.push(photo);
        return { key: "heic-converted-photo", mimeType: photo.contentType, sizeBytes: photo.sizeBytes };
      },
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(conversionInput, HEIC_BYTES);
  assert.equal(outputFormat, "image/jpeg");
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0]?.contentType, "image/jpeg");
  assert.deepEqual(new Uint8Array(uploaded[0]?.bytes ?? new ArrayBuffer(0)), JPEG_BYTES);
  assert.equal((await response.json() as Record<string, unknown>).has_image, true);
});

test("infers an omitted HEIC MIME type from the downloaded response", async () => {
  let conversions = 0;
  const response = await handler(
    async (ownerKey, input, photo) => ({ created: true, meal: entry(ownerKey, input, undefined, photo) }),
    mealBody({ openaiFileIdRefs: [imageRef({ mime_type: undefined })] }),
    {
      fetchImage: async () => imageResponse(HEIC_BYTES, "image/heic"),
      convertHeicToJpeg: async () => {
        conversions += 1;
        return imageResponse(JPEG_BYTES, "image/jpeg");
      },
      uploadPhoto: async (_ownerKey, _requestId, photo) => ({
        key: "heic-inferred-photo",
        mimeType: photo.contentType,
        sizeBytes: photo.sizeBytes,
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.equal(conversions, 1);
  assert.equal((await response.json() as Record<string, unknown>).has_image, true);
});

test("fails hard when HEIC conversion is missing or fails", async () => {
  const scenarios: Array<{
    name: string;
    convertHeicToJpeg?: AddMealHandlerOptions["convertHeicToJpeg"];
    status: number;
    code: string;
    message: string;
  }> = [
    {
      name: "missing binding",
      status: 503,
      code: "image_conversion_unavailable",
      message: "HEIC photo conversion is not configured.",
    },
    {
      name: "failed conversion",
      convertHeicToJpeg: async () => {
        throw new Error("Images unavailable");
      },
      status: 502,
      code: "image_conversion_failed",
      message: "The HEIC photo could not be converted. Try a JPEG, PNG, or WebP copy.",
    },
  ];

  for (const scenario of scenarios) {
    let mealWrites = 0;
    let photoWrites = 0;
    const options: Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">> = {
      fetchImage: async () => imageResponse(HEIC_BYTES, "image/heic"),
      uploadPhoto: async () => {
        photoWrites += 1;
        return { key: "unexpected-photo", mimeType: "image/jpeg", sizeBytes: JPEG_BYTES.byteLength };
      },
    };
    if (scenario.convertHeicToJpeg) options.convertHeicToJpeg = scenario.convertHeicToJpeg;

    await assert.rejects(
      () => handler(async () => {
        mealWrites += 1;
        throw new Error("Must not write a meal after HEIC conversion fails");
      }, mealBody({ openaiFileIdRefs: [imageRef({ mime_type: "image/heic" })] }), options),
      (error: unknown) => error instanceof AddMealRequestError
        && error.status === scenario.status && error.code === scenario.code && error.message === scenario.message,
      scenario.name,
    );
    assert.equal(mealWrites, 0, scenario.name);
    assert.equal(photoWrites, 0, scenario.name);
  }
});

test("rejects mismatched HEIC MIME and invalid or oversized conversion output", async () => {
  let conversionCalls = 0;
  let mealWrites = 0;
  let photoWrites = 0;
  await assert.rejects(
    () => handler(async () => {
      mealWrites += 1;
      throw new Error("Must not write a meal after a MIME mismatch");
    }, mealBody({ openaiFileIdRefs: [imageRef({ mime_type: "image/heic" })] }), {
      fetchImage: async () => imageResponse(JPEG_BYTES, "image/jpeg"),
      convertHeicToJpeg: async () => {
        conversionCalls += 1;
        return imageResponse(JPEG_BYTES, "image/jpeg");
      },
      uploadPhoto: async () => {
        photoWrites += 1;
        return { key: "unexpected-photo", mimeType: "image/jpeg", sizeBytes: JPEG_BYTES.byteLength };
      },
    }),
    (error: unknown) => error instanceof AddMealRequestError
      && error.status === 400 && error.code === "invalid_image",
  );
  assert.equal(conversionCalls, 0);
  assert.equal(mealWrites, 0);

  const outputTooLarge = new Uint8Array(MAX_DASHBOARD_MEAL_PHOTO_BYTES + 1);
  outputTooLarge.set(JPEG_BYTES);
  const outputs: Array<{ response: Response; status: number; code: string }> = [
    {
      response: new Response(JPEG_BYTES, { status: 500, headers: { "content-type": "image/jpeg" } }),
      status: 502,
      code: "image_conversion_failed",
    },
    { response: imageResponse(JPEG_BYTES, "image/png"), status: 502, code: "image_conversion_failed" },
    { response: imageResponse(PNG_BYTES, "image/jpeg"), status: 400, code: "unsupported_photo_type" },
    { response: imageResponse(outputTooLarge, "image/jpeg"), status: 413, code: "payload_too_large" },
  ];
  for (const output of outputs) {
    await assert.rejects(
      () => handler(async () => {
        mealWrites += 1;
        throw new Error("Must not write a meal after invalid converted output");
      }, mealBody({ openaiFileIdRefs: [imageRef({ mime_type: "image/heic" })] }), {
        fetchImage: async () => imageResponse(HEIC_BYTES, "image/heic"),
        convertHeicToJpeg: async () => output.response,
        uploadPhoto: async () => {
          photoWrites += 1;
          return { key: "unexpected-photo", mimeType: "image/jpeg", sizeBytes: JPEG_BYTES.byteLength };
        },
      }),
      (error: unknown) => error instanceof AddMealRequestError
        && error.status === output.status && error.code === output.code,
    );
  }
  assert.equal(mealWrites, 0);
  assert.equal(photoWrites, 0);
});

test("rejects oversized HEIC input before conversion and does not convert again on retry", async () => {
  const sourceTooLarge = new Uint8Array(MAX_DASHBOARD_MEAL_PHOTO_BYTES + 1);
  let conversions = 0;
  let creates = 0;
  await assert.rejects(
    () => handler(async () => {
      creates += 1;
      throw new Error("Must not write a meal with oversized HEIC input");
    }, mealBody({ openaiFileIdRefs: [imageRef({ mime_type: "image/heic" })] }), {
      fetchImage: async () => imageResponse(sourceTooLarge, "image/heic"),
      convertHeicToJpeg: async () => {
        conversions += 1;
        return imageResponse(JPEG_BYTES, "image/jpeg");
      },
      uploadPhoto: async () => ({
        key: "unexpected-photo",
        mimeType: "image/jpeg",
        sizeBytes: JPEG_BYTES.byteLength,
      }),
    }),
    (error: unknown) => error instanceof AddMealRequestError
      && error.status === 413 && error.code === "payload_too_large",
  );
  assert.equal(conversions, 0);
  assert.equal(creates, 0);

  let existing: MealWithItems | null = null;
  let fetches = 0;
  const body = mealBody({ openaiFileIdRefs: [imageRef({ mime_type: "image/heic" })] });
  const options = {
    findExistingMeal: async () => existing,
    fetchImage: async () => {
      fetches += 1;
      return imageResponse(HEIC_BYTES, "image/heic");
    },
    convertHeicToJpeg: async () => {
      conversions += 1;
      return imageResponse(JPEG_BYTES, "image/jpeg");
    },
    uploadPhoto: async (_ownerKey: string, _requestId: string, photo: MealPhotoUpload) => ({
      key: "heic-retry-photo",
      mimeType: photo.contentType,
      sizeBytes: photo.sizeBytes,
    }),
  } satisfies Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">>;
  const first = await handler(async (ownerKey, input, photo) => {
    creates += 1;
    existing = entry(ownerKey, input, "meal-heic-retry", photo);
    return { created: true, meal: existing };
  }, body, options);
  const retry = await handler(async () => {
    creates += 1;
    throw new Error("The retry should return the stored meal");
  }, body, options);

  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(fetches, 1);
  assert.equal(conversions, 1);
  assert.equal(creates, 1);
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

test("accepts public Azure Blob account hosts and preserves signed queries", async () => {
  const host = "oaisdmntpraustraliaeast.blob.core.windows.net";
  for (const account of ["oaisdmntpraustraliaeast", "otheraccount", "abc", "a".repeat(24), "abc-secondary", `${"a".repeat(24)}-secondary`]) {
    const signedLink = `https://${account}.blob.core.windows.net/private/synthetic.heic?sv=2025-01-05&sig=synthetic%2Bsignature%2Fvalue%3D&sp=r`;
    const parsed = parseAddMealRequest(mealBody({
      openaiFileIdRefs: [imageRef({ download_link: signedLink, mime_type: "image/heic" })],
    }), NOW);
    assert.equal(parsed.imageRef?.downloadLink, signedLink);
    assert.equal(parsed.imageRef?.declaredContentType, "image/heic");
  }

  const rejectedLinks = [
    "https://ab.blob.core.windows.net/private/synthetic.heic",
    `https://${"a".repeat(25)}.blob.core.windows.net/private/synthetic.heic`,
    "https://other-account.blob.core.windows.net/private/synthetic.heic",
    "https://ab-secondary.blob.core.windows.net/private/synthetic.heic",
    `https://${"a".repeat(25)}-secondary.blob.core.windows.net/private/synthetic.heic`,
    "https://otheraccount--secondary.blob.core.windows.net/private/synthetic.heic",
    "https://otheraccount-secondary-secondary.blob.core.windows.net/private/synthetic.heic",
    "https://otheraccount-primary.blob.core.windows.net/private/synthetic.heic",
    "https://otheraccount.privatelink.blob.core.windows.net/private/synthetic.heic",
    "https://blob.core.windows.net/private/synthetic.heic",
    "https://otheraccount.queue.core.windows.net/private/synthetic.heic",
    `https://child.${host}/private/synthetic.heic`,
    `https://${host}.evil.example/private/synthetic.heic`,
    `http://${host}/private/synthetic.heic`,
    `https://${host}:8443/private/synthetic.heic`,
    `https://user:password@${host}/private/synthetic.heic`,
    `https://${host}/?sig=synthetic`,
  ];
  let fetchCalls = 0;
  let writeCalls = 0;
  for (const downloadLink of rejectedLinks) {
    await assert.rejects(
      () => handler(async () => {
        writeCalls += 1;
        throw new Error("Must not create.");
      }, mealBody({ openaiFileIdRefs: [imageRef({ download_link: downloadLink })] }), {
        fetchImage: async () => { fetchCalls += 1; throw new Error("Must not fetch."); },
        uploadPhoto: async () => { writeCalls += 1; throw new Error("Must not upload."); },
      }),
      (error: unknown) => error instanceof AddMealRequestError && error.status === 400 && error.code === "invalid_image_refs",
    );
  }
  assert.equal(fetchCalls, 0);
  assert.equal(writeCalls, 0);
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

test("reports safe image reference reasons without private URL or file values", () => {
  const privateUrl = "https://provider.example/private-photo?signature=secret-query#secret-fragment";
  const cases: Array<{ ref: unknown; reason: string }> = [
    { ref: "secret-file-id", reason: "missing_ref_object" },
    { ref: null, reason: "missing_ref_object" },
    { ref: [], reason: "missing_ref_object" },
    { ref: { download_url: privateUrl }, reason: "missing_download_link" },
    { ref: imageRef({ download_link: " " }), reason: "missing_download_link" },
    { ref: imageRef({ download_link: "/private-photo" }), reason: "malformed_download_url" },
    { ref: imageRef({ download_link: "http://provider.example/private-photo?signature=secret-query" }), reason: "unsupported_scheme" },
    { ref: imageRef({ download_link: "https://secret-user:secret-pass@provider.example/private-photo" }), reason: "credentials_or_port" },
    { ref: imageRef({ download_link: "https://provider.example:8443/private-photo" }), reason: "credentials_or_port" },
    { ref: imageRef({ download_link: "https://provider.example/?signature=secret-query" }), reason: "missing_path" },
    { ref: imageRef({ download_link: privateUrl }), reason: "unsupported_host(host=provider.example)" },
    { ref: imageRef({ download_link: `https://${"a".repeat(254)}.example/private-photo` }), reason: "unsupported_host" },
    { ref: imageRef({ download_link: "https://[::1]/private-photo" }), reason: "unsupported_host" },
    { ref: imageRef({ mime_type: "application/octet-stream" }), reason: "unsupported_mime" },
    { ref: imageRef({ mime_type: "image/heif" }), reason: "unsupported_mime" },
  ];
  for (const { ref, reason } of cases) {
    assert.throws(
      () => parseAddMealRequest(mealBody({ openaiFileIdRefs: [ref] }), NOW),
      (error: unknown) => {
        assert.ok(error instanceof AddMealRequestError);
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_image_refs");
        assert.equal(error.message, `openaiFileIdRefs contains no usable image. [image-ref-v2: ${reason}]`);
        assert.doesNotMatch(error.message, /private-photo|secret-|signature|https?:|file-123/u);
        return true;
      },
    );
  }
  const validRef = imageRef({ mime_type: "image/heic" });
  assert.ok(parseAddMealRequest(mealBody({ openaiFileIdRefs: [null, validRef] }), NOW).imageRef);
  assert.throws(
    () => parseAddMealRequest(mealBody({ openaiFileIdRefs: [null, null, {}] }), NOW),
    /\[image-ref-v2: missing_ref_object, missing_download_link\]/u,
  );
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

test("returns current daily calorie and protein totals after a meal is added", async () => {
  const response = await handler(
    async (ownerKey, input, photo) => ({ created: true, meal: entry(ownerKey, input, undefined, photo) }),
    mealBody(),
    {
      getDailyTotals: async () => ({
        date: "2026-08-30",
        calories: 1_420,
        proteinG: 112,
        mealCount: 3,
      }),
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual((await response.json() as Record<string, unknown>).daily_totals, {
    date: "2026-08-30",
    kcal: 1_420,
    protein: 112,
    meal_count: 3,
  });
});

test("creates a batch and returns one daily total for the whole batch", async () => {
  const secondId = OTHER_REQUEST_ID;
  const body = {
    meals: [
      mealBody(),
      mealBody({ request_id: secondId, name: "Greek yogurt", kcal: 220, protein: 20 }),
    ],
  };
  const created: string[] = [];
  const response = await handler(
    async () => {
      throw new Error("single-meal creator must not be used for a batch");
    },
    body,
    {
      createMeals: async (ownerKey, requests) => {
        created.push(...requests.map(({ request }) => request.requestId));
        return requests.map(({ request, photo }) => ({
          created: true,
          meal: entry(ownerKey, request, undefined, photo),
        }));
      },
      getDailyTotals: async () => ({ date: "2026-08-30", calories: 830, proteinG: 78, mealCount: 4 }),
    },
  );

  assert.equal(response.status, 201);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.status, "batch_processed");
  assert.equal(payload.created_count, 2);
  assert.equal(payload.already_exists_count, 0);
  assert.deepEqual(created, [REQUEST_ID, secondId]);
  assert.deepEqual(payload.daily_totals, {
    date: "2026-08-30",
    kcal: 830,
    protein: 78,
    meal_count: 4,
  });
  assert.deepEqual((payload.meals as Array<Record<string, unknown>>).map((meal) => meal.status), ["created", "created"]);
});

test("batch retries return already_exists without creating duplicates", async () => {
  const body = { meals: [mealBody(), mealBody({ request_id: OTHER_REQUEST_ID, name: "Greek yogurt" })] };
  const stored = new Map<string, MealWithItems>();
  let createCalls = 0;
  const options = {
    findExistingMeal: async (_ownerKey: string, requestId: string) => stored.get(requestId) ?? null,
    createMeals: async (ownerKey: string, requests: Array<{ request: AddMealRequest; photo: StoredAddMealPhoto | null }>) => {
      createCalls += 1;
      const results = requests.map(({ request, photo }) => {
        const meal = entry(ownerKey, request, undefined, photo);
        stored.set(request.requestId, meal);
        return { created: true, meal };
      });
      return results;
    },
    getDailyTotals: async () => ({ date: "2026-08-30", calories: 830, proteinG: 78, mealCount: 2 }),
  } satisfies Partial<Omit<AddMealHandlerOptions, "createMeal" | "expectedToken" | "ownerKey" | "body">>;

  const first = await handler(async () => {
    throw new Error("single-meal creator must not be used for a batch");
  }, body, options);
  const retry = await handler(async () => {
    throw new Error("the idempotency pre-check should return both meals");
  }, body, options);

  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  const payload = await retry.json() as Record<string, unknown>;
  assert.equal(payload.created_count, 0);
  assert.equal(payload.already_exists_count, 2);
  assert.deepEqual((payload.meals as Array<Record<string, unknown>>).map((meal) => meal.status), ["already_exists", "already_exists"]);
  assert.equal(createCalls, 1);
});

test("rejects duplicate request IDs inside a batch before creation", async () => {
  await assert.rejects(
    () => handler(async () => {
      throw new Error("must not create");
    }, { meals: [mealBody(), mealBody({ name: "Duplicate UUID" })] }),
    (error: unknown) => error instanceof AddMealRequestError
      && error.status === 400 && error.code === "invalid_field",
  );
});
