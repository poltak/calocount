import assert from "node:assert/strict";
import test from "node:test";

import { dashboardFailureMessage } from "../app/page";

const knownMessages = {
  database_unavailable: "Your saved log is unavailable because the database is not configured.",
  auth_access_settings_missing: "Your saved log is unavailable because owner sign-in is not configured.",
  auth_owner_allowlist_missing: "Your saved log is unavailable because owner access is not configured.",
  auth_unavailable: "Your saved log is unavailable because owner authentication is temporarily unavailable.",
} as const;

test("dashboard failure codes map to safe, accurate unavailable messages", () => {
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

  assert.equal(message, "Your saved log is unavailable. Try again later.");
  assert.doesNotMatch(message, /owner@example\.com|token=secret/u);
});

test("dashboard failures handle sign-in, malformed, and unknown responses safely", () => {
  assert.equal(
    dashboardFailureMessage(401, { error: { code: "unauthorized", message: "Sign-in is required." } }),
    "Your saved log could not be loaded. Sign in again and try again.",
  );
  assert.equal(dashboardFailureMessage(503, null), "Your saved log is unavailable. Try again later.");
  assert.equal(dashboardFailureMessage(500, { error: "not an object" }), "Your saved log is unavailable. Try again later.");
});
