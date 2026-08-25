import assert from "node:assert/strict";
import test from "node:test";

import { dashboardFailureMessage } from "../app/page";

const knownMessages = {
  database_unavailable: "Demo mode — no D1 database binding is available, so changes stay local.",
  auth_access_settings_missing: "Demo mode — owner sign-in settings are incomplete, so changes stay local.",
  auth_owner_allowlist_missing: "Demo mode — owner allowlist is incomplete, so changes stay local.",
  auth_unavailable: "Demo mode — owner authentication is temporarily unavailable, so changes stay local.",
} as const;

test("dashboard failure codes map to safe, accurate demo messages", () => {
  for (const [code, message] of Object.entries(knownMessages)) {
    assert.equal(
      dashboardFailureMessage(503, { error: { code, message: "sensitive internal details" } }),
      message,
    );
  }
});

test("dashboard failures do not expose arbitrary response content", () => {
  const message = dashboardFailureMessage(503, {
    error: { code: "unexpected_code", message: "owner@example.com token=secret" },
  });

  assert.equal(message, "Demo mode — saved data is unavailable, so changes stay local.");
  assert.doesNotMatch(message, /owner@example\.com|token=secret/u);
});

test("dashboard failures handle sign-in, malformed, and unknown responses safely", () => {
  assert.equal(
    dashboardFailureMessage(401, { error: { code: "unauthorized", message: "Sign-in is required." } }),
    "Demo mode — sign in to load your saved meals. Changes stay local for now.",
  );
  assert.equal(dashboardFailureMessage(503, null), "Demo mode — saved data is unavailable, so changes stay local.");
  assert.equal(dashboardFailureMessage(500, { error: "not an object" }), "Demo mode — saved data is unavailable, so changes stay local.");
});
