import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadTelegramPhoto,
  parseTelegramMealMessage,
  sendTelegramMealResult,
  sendTelegramSafeError,
  TelegramApiError,
} from "../workers/ingest/telegram";
import type { MealAnalysisResult } from "../workers/ingest/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseUpdate = {
  update_id: 1001,
  message: {
    date: 1_700_000_000,
    from: { id: 12345 },
    chat: { id: -67890 },
    caption: "  Chicken and rice  ",
    photo: [{ file_id: "small" }, { file_id: "medium" }, { file_id: "largest" }],
  },
};

test("Telegram meal parsing selects the largest photo and normalises captions", () => {
  const parsed = parseTelegramMealMessage(baseUpdate);

  assert.ok(parsed);
  assert.equal(parsed.updateId, 1001);
  assert.equal(parsed.userId, "12345");
  assert.equal(parsed.chatId, "-67890");
  assert.equal(parsed.fileId, "largest");
  assert.equal(parsed.caption, "Chicken and rice");
  assert.equal(parsed.capturedAt, "2023-11-14T22:13:20.000Z");
  assert.match(parsed.payloadJson, /Chicken and rice/);

  const withoutCaption = parseTelegramMealMessage({
    ...baseUpdate,
    message: { ...baseUpdate.message, caption: undefined },
  });
  assert.ok(withoutCaption);
  assert.equal(withoutCaption.caption, "");
});

test("Telegram parser rejects malformed or unsupported updates", () => {
  const malformedUpdates: unknown[] = [
    null,
    {},
    { update_id: 0, message: baseUpdate.message },
    { update_id: 1001, message: {} },
    {
      update_id: 1001,
      message: {
        ...baseUpdate.message,
        from: { id: "not-a-telegram-id" },
      },
    },
    {
      update_id: 1001,
      message: {
        ...baseUpdate.message,
        caption: 123,
      },
    },
    {
      update_id: 1001,
      message: {
        ...baseUpdate.message,
        photo: [],
      },
    },
  ];

  for (const update of malformedUpdates) {
    assert.equal(parseTelegramMealMessage(update), null);
  }
});

test("Telegram photo download calls getFile and returns the image stream", async () => {
  const imageBytes = Uint8Array.from([1, 2, 3, 4]);
  const imageResponse = new Response(imageBytes, {
    headers: { "content-type": "image/png" },
  });
  const imageBody = imageResponse.body;
  assert.ok(imageBody);
  const calls: Array<{ readonly url: string; readonly init?: RequestInit }> = [];

  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) {
      return jsonResponse({ ok: true, result: { file_path: "photos/meal 1.jpg" } });
    }
    return imageResponse;
  };

  const photo = await downloadTelegramPhoto("token", "file-id", fetchFn);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "https://api.telegram.org/bottoken/getFile?file_id=file-id");
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(calls[1]?.url, "https://api.telegram.org/file/bottoken/photos/meal%201.jpg");
  assert.equal(calls[1]?.init?.method, "GET");
  assert.equal(photo.contentType, "image/png");
  assert.strictEqual(photo.body, imageBody);
  assert.deepEqual(new Uint8Array(await new Response(photo.body).arrayBuffer()), imageBytes);
});

test("Telegram photo download detects JPEG bytes with a generic content type", async () => {
  const imageBytes = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
  ]);
  let callCount = 0;
  const fetchFn: typeof fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({ ok: true, result: { file_path: "photos/meal.jpg" } });
    }
    return new Response(imageBytes, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  };

  const photo = await downloadTelegramPhoto("token", "file-id", fetchFn);

  assert.equal(photo.contentType, "image/jpeg");
  assert.deepEqual(new Uint8Array(await new Response(photo.body).arrayBuffer()), imageBytes);
});

test("Telegram photo download detects PNG and WebP bytes with a generic content type", async () => {
  const fixtures = [
    {
      contentType: "image/png",
      imageBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
    },
    {
      contentType: "image/webp",
      imageBytes: Uint8Array.from([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 5, 6]),
    },
  ];

  for (const fixture of fixtures) {
    let callCount = 0;
    const fetchFn: typeof fetch = async () => {
      callCount += 1;
      if (callCount === 1) {
        return jsonResponse({ ok: true, result: { file_path: "photos/meal.bin" } });
      }
      return new Response(fixture.imageBytes, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    };

    const photo = await downloadTelegramPhoto("token", "file-id", fetchFn);

    assert.equal(photo.contentType, fixture.contentType);
    assert.deepEqual(new Uint8Array(await new Response(photo.body).arrayBuffer()), fixture.imageBytes);
  }
});

test("Telegram photo download rejects non-image responses", async () => {
  let callCount = 0;
  const fetchFn: typeof fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({ ok: true, result: { file_path: "photos/meal.jpg" } });
    }
    return new Response("not an image", {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  };

  await assert.rejects(
    () => downloadTelegramPhoto("token", "file-id", fetchFn),
    (error: unknown) => {
      assert.ok(error instanceof TelegramApiError);
      assert.equal(error.message, "telegram_photo_not_an_image");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

const analysis: MealAnalysisResult = {
  summary: "Chicken and rice",
  items: [
    {
      name: "Chicken",
      serving: "one breast",
      grams: 180,
      calories: 321.4,
      proteinGrams: 45.6,
      carbsGrams: null,
      fatGrams: 12.2,
      confidence: "low",
      assumptions: [],
    },
  ],
  totals: {
    calories: 321.4,
    proteinGrams: 45.6,
    carbsGrams: null,
    fatGrams: 12.2,
  },
  confidence: "low",
  assumptions: [],
  questions: ["Was oil used when cooking the chicken?"],
};

test("Telegram meal result sends the compact, safe result payload", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenInit = init;
    return jsonResponse({ ok: true, result: { message_id: 55 } });
  };

  await sendTelegramMealResult("token", "-67890", analysis, fetchFn);

  assert.equal(seenUrl, "https://api.telegram.org/bottoken/sendMessage");
  assert.equal(seenInit?.method, "POST");
  assert.equal(new Headers(seenInit?.headers).get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(seenInit?.body)), {
    chat_id: "-67890",
    text: [
      "Estimated: 321 kcal",
      "Protein: 46 g",
      "Fat: 12 g",
      "Confidence: low",
      "Question: Was oil used when cooking the chicken?",
    ].join("\n"),
    disable_web_page_preview: true,
  });
});

test("Telegram 429 errors are marked retryable", async () => {
  await assert.rejects(
    () => sendTelegramMealResult("token", "-67890", analysis, async () =>
      jsonResponse({ ok: false, description: "Too Many Requests" }, 429),
    ),
    (error: unknown) => {
      assert.ok(error instanceof TelegramApiError);
      assert.equal(error.message, "telegram_http_429");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("Telegram safe error delivery uses fixed text without provider details", async () => {
  let seenInit: RequestInit | undefined;
  const fetchFn: typeof fetch = async (_input, init) => {
    seenInit = init;
    return jsonResponse({ ok: true, result: { message_id: 56 } });
  };

  await sendTelegramSafeError("token", "-67890", fetchFn);

  const payload = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
  assert.equal(payload.chat_id, "-67890");
  assert.equal(payload.text, "I could not estimate this meal. Please try the photo again.");
  assert.equal(payload.disable_web_page_preview, true);
  assert.doesNotMatch(String(payload.text), /provider|token|secret|error/i);
});
