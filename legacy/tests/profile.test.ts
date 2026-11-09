import assert from "node:assert/strict";
import test from "node:test";

import { photoUrlForKey } from "../app/photo-url";
import { parseProfile, profileDataKey, profileFromPath, withProfile } from "../app/profile";

test("the owner profile keeps the account key, and the partner gets its own key", () => {
  assert.equal(profileDataKey({ accountKey: "default", profile: "owner" }), "default");
  assert.equal(profileDataKey({ accountKey: "default", profile: "partner" }), "default:partner");
});

test("only owner and partner are profiles, and no value is the owner", () => {
  assert.equal(parseProfile(null), "owner");
  assert.equal(parseProfile("owner"), "owner");
  assert.equal(parseProfile("partner"), "partner");
  for (const value of ["", "Partner", "wife", "owner:partner"]) assert.equal(parseProfile(value), null, value);
});

test("the partner page and its requests name the partner profile; owner URLs stay as they were", () => {
  assert.equal(profileFromPath("/owner"), "owner");
  assert.equal(profileFromPath("/owner/partner"), "partner");
  assert.equal(profileFromPath("/owner/partner/x"), "owner");
  assert.equal(withProfile({ url: "/api/meals", profile: "owner" }), "/api/meals");
  assert.equal(withProfile({ url: "/api/meals", profile: "partner" }), "/api/meals?profile=partner");
  assert.equal(withProfile({ url: "/api/days?month=2026-10", profile: "partner" }), "/api/days?month=2026-10&profile=partner");
  assert.equal(photoUrlForKey("meals/a/b.png"), "/api/photos/meals/a/b.png");
  assert.equal(photoUrlForKey("meals/a/b.png", "partner"), "/api/photos/meals/a/b.png?profile=partner");
});
