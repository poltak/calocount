import assert from "node:assert/strict";
import test from "node:test";

import { approveAuthorization, checkAuthorizationRequest, deleteExpiredOAuthRows, registerClient } from "../app/auth/oauth";
import { createSqliteTestDb } from "./helpers/sqlite-db";

const ORIGIN = "https://calocount.example";
const DAY_MS = 24 * 60 * 60 * 1000;

function clientIds(fixture: ReturnType<typeof createSqliteTestDb>): string[] {
  return (fixture.sqlite.prepare("SELECT id FROM oauth_clients ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
}

test("the cleanup keeps a client that the owner allowed, and removes one that nobody allowed within a day", async () => {
  const fixture = createSqliteTestDb();
  try {
    const now = Date.parse("2026-10-24T00:00:00Z");
    const register = (name: string) => registerClient({
      db: fixture.db,
      body: { client_name: name, redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] },
      network: "test-network",
      now,
    });
    const allowed = await register("ChatGPT");
    const ignored = await register("Never allowed");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: allowed.client_id,
      redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    });
    const check = await checkAuthorizationRequest({ db: fixture.db, params, origin: ORIGIN });
    assert.ok(check.ok);
    await approveAuthorization({ db: fixture.db, request: check.request, ownerKey: "owner", origin: ORIGIN, now });

    // Within the first day, both clients stay.
    await deleteExpiredOAuthRows({ db: fixture.db, now: now + DAY_MS / 2 });
    assert.equal(clientIds(fixture).length, 2);

    // Later the code expires and the connection has no refresh token, so the connection goes.
    // The allowed client stays: ChatGPT uses its client ID again after a disconnect.
    await deleteExpiredOAuthRows({ db: fixture.db, now: now + 2 * DAY_MS });
    assert.deepEqual(clientIds(fixture), [allowed.client_id]);
    assert.equal((fixture.sqlite.prepare("SELECT count(*) AS value FROM oauth_grants").get() as { value: number }).value, 0);
    assert.notEqual(ignored.client_id, allowed.client_id);
  } finally {
    fixture.sqlite.close();
  }
});
