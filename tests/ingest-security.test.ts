import assert from "node:assert/strict";
import test from "node:test";

import {
  createMediaToken,
  isAllowedTelegramUpdate,
  isAuthorizedWebhookRequest,
  verifyMediaToken,
} from "../workers/ingest/security";

test("media tokens verify and expire after five minutes", async () => {
  const token = await createMediaToken("meals/job-1/original", "test-secret", 1_000_000, 300);
  const verified = await verifyMediaToken(token, "test-secret", 1_000_000);
  assert.equal(verified?.key, "meals/job-1/original");
  assert.equal(verified?.expiresAt, 1_000 + 300);
  assert.match(verified?.nonce ?? "", /^[A-Za-z0-9_-]{22}$/u);
  assert.equal(await verifyMediaToken(token, "test-secret", 1_300_000), null);
  assert.equal(await verifyMediaToken(`${token}x`, "test-secret", 1_000_000), null);
});

test("webhook secret and Telegram identifiers use exact allowlists", async () => {
  const environment = {
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
    TELEGRAM_ALLOWED_USER_IDS: "123, 456",
    TELEGRAM_ALLOWED_CHAT_IDS: "-789",
  };
  const request = new Request("https://example.test/telegram/webhook", {
    headers: { "X-Telegram-Bot-Api-Secret-Token": "webhook-secret" },
  });
  assert.equal(await isAuthorizedWebhookRequest(request, environment), true);
  assert.equal(
    isAllowedTelegramUpdate({ fromId: "123", chatId: -789 }, environment),
    true,
  );
  assert.equal(
    isAllowedTelegramUpdate({ fromId: "1234", chatId: -789 }, environment),
    false,
  );
  assert.equal(
    isAllowedTelegramUpdate({ fromId: "123", chatId: "789" }, environment),
    false,
  );
});
