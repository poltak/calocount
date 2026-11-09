import { expect } from "@playwright/test";
import { test } from "../../core/black-box-tests/black-box-test.js";
import { TodayPageObject, type PhotoFile } from "./today-page-object.js";

const PNG_PHOTO: PhotoFile = {
  name: "snack.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
};

test.describe("the owner adds a photo to an entry", () => {
  test("should show a thumbnail that opens a preview, and close the preview", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({
      name: "Photo snack",
      calories: 120,
      photo: PNG_PHOTO,
    });
    await page.reload();

    await expect(today.photoThumbnail("Photo snack")).toBeVisible();
    await today.photoThumbnail("Photo snack").click();
    await expect(today.photoPreview).toBeVisible();
    await expect(today.photoPreview).toContainText("Photo snack");

    await page.keyboard.press("Escape");
    await expect(today.photoPreview).toBeHidden();

    await today.photoThumbnail("Photo snack").click();
    await today.photoPreviewCloseButton.click();
    await expect(today.photoPreview).toBeHidden();
  });

  test("should show no thumbnail for an entry without a photo", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();

    await today.addEntry({ name: "Plain snack", calories: 80 });

    await expect(today.entry("Plain snack")).toBeVisible();
    await expect(today.photoThumbnail("Plain snack")).toHaveCount(0);
  });

  test("should refuse a file of the wrong type before saving", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.openEntryForm();
    await today.fillEntryForm({
      name: "Photo snack",
      calories: 120,
      photo: { ...PNG_PHOTO, name: "snack.gif", mimeType: "image/gif" },
    });

    await today.saveEntryForm();

    await expect(
      today.entryFormError("Select a JPEG, PNG, or WebP image."),
    ).toBeVisible();
    await expect(today.entry("Photo snack")).toHaveCount(0);
    await expect(today.entriesPanel).toContainText("Entries 0");
  });

  test("should refuse a file over 10 MB before saving, and save after a valid file", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.openEntryForm();
    await today.fillEntryForm({
      name: "Photo snack",
      calories: 120,
      photo: {
        ...PNG_PHOTO,
        name: "huge.png",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      },
    });

    await today.saveEntryForm();

    await expect(
      today.entryFormError("Select an image that is 10 MB or smaller."),
    ).toBeVisible();
    await expect(today.entry("Photo snack")).toHaveCount(0);

    await today.fillEntryForm({
      name: "Photo snack",
      calories: 120,
      photo: PNG_PHOTO,
    });
    await today.saveEntryForm();

    await expect(today.photoThumbnail("Photo snack")).toBeVisible();
  });
});

test.describe("the owner changes the photo of an entry", () => {
  test("should replace the saved photo in the editor", async ({ page }) => {
    const today = new TodayPageObject(page);
    await today.goto();
    await today.addEntry({
      name: "Photo snack",
      calories: 120,
      photo: PNG_PHOTO,
    });
    await today.editEntry("Photo snack");

    await today.replaceEntryPhoto("Photo snack", {
      ...PNG_PHOTO,
      name: "replacement.png",
    });
    await today.saveEntryEditor("Photo snack");

    await page.reload();
    await expect(today.photoThumbnail("Photo snack")).toBeVisible();
  });
});
