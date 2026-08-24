import assert from "node:assert/strict";
import test from "node:test";

import { photoUrlForKey } from "../app/photo-url";

test("photo URLs encode each R2 key segment without changing path separators", () => {
  assert.equal(photoUrlForKey("meals/job 1/original%2Fphoto"), "/api/photos/meals/job%201/original%252Fphoto");
  assert.equal(photoUrlForKey("meals/job/original"), "/api/photos/meals/job/original");
});

test("missing photo keys do not produce a request URL", () => {
  assert.equal(photoUrlForKey(null), null);
  assert.equal(photoUrlForKey(""), null);
  assert.equal(photoUrlForKey("meals//original"), null);
});
