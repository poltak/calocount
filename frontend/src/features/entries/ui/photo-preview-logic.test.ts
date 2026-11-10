import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { EntryView } from "../utils/entry-view.js";
import { PhotoPreviewLogic } from "./photo-preview-logic.js";
import { readEntryView, seedEntry } from "./entry-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new PhotoPreviewLogic(app.frontend));
}

/** An entry as the dashboard lists it, with the photo key set. */
async function viewWithKey(
  app: Awaited<ReturnType<typeof setupTest>>,
  photoKey: string | null,
): Promise<EntryView> {
  const id = await seedEntry(app, { name: "Soup" });
  return { ...(await readEntryView(app, id)), photoKey };
}

describe("PhotoPreviewLogic tests", () => {
  it("should name the private address of a photo, with each segment of the key encoded", async () => {
    const app = await setupTest();
    const entry = await viewWithKey(app, "meals/job 1/original%2Fphoto");

    expect(app.logic.photoUrl({ entry })).toEqual(
      "http://app.test/api/photos/meals/job%201/original%252Fphoto",
    );
    expect(app.logic.shownPhotoUrl({ entry })).toEqual(
      app.logic.photoUrl({ entry }),
    );
  });

  it("should name no address for an entry without a photo or with an unsafe key", async () => {
    const app = await setupTest();

    for (const photoKey of [null, "", "meals//photo", "/meals/photo/"]) {
      const entry = await viewWithKey(app, photoKey);
      expect(app.logic.photoUrl({ entry })).toBeNull();
      expect(app.logic.shownPhotoUrl({ entry })).toBeNull();
    }
  });

  it("should open the large view of an entry and close it", async () => {
    const app = await setupTest();
    const entry = await viewWithKey(app, "meals/owner/dashboard/new/one");

    app.logic.open({ entry });
    expect(app.logic.state.previewEntry).toEqual(entry);

    app.logic.close();
    expect(app.logic.state.previewEntry).toBeNull();
  });

  it("should stop showing a photo that failed to load, once", async () => {
    const app = await setupTest();
    const entry = await viewWithKey(app, "meals/owner/dashboard/new/one");
    const url = app.logic.photoUrl({ entry });
    expect(url).not.toBeNull();

    app.logic.markFailed({ url: url ?? "" });
    app.logic.markFailed({ url: url ?? "" });

    expect(app.logic.state.failedUrls).toEqual([url]);
    expect(app.logic.shownPhotoUrl({ entry })).toBeNull();
    expect(app.logic.photoUrl({ entry })).toEqual(url);
  });
});
