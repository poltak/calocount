import { expect } from "@playwright/test";
import { test } from "./black-box-test.js";
import { PwaPageObject } from "./pwa-page-object.js";
import { TodayPageObject } from "../../entries/black-box-tests/today-page-object.js";

test.describe("the app can be installed", () => {
  test("should give the browser a manifest with the name, the start page and the icons of an app", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const pwa = new PwaPageObject(page);
    await today.goto();

    const manifest = await pwa.readManifest();

    expect(manifest.url).toMatch(/^http:\/\/localhost:\d+\//);
    expect(manifest.problems).toEqual([]);
    expect(manifest.data.name).toBe("Calocount — simple calorie tracking");
    expect(manifest.data.short_name).toBe("Calocount");
    expect(manifest.data.start_url).toBe("/owner");
    expect(manifest.data.scope).toBe("/");
    expect(manifest.data.display).toBe("standalone");
    const icons = manifest.data.icons ?? [];
    expect(icons).toContainEqual(
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
    );
    expect(icons).toContainEqual(
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    );
    expect(icons).toContainEqual(
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    );
  });

  test("should serve each icon of the manifest as an image", async ({
    page,
  }) => {
    const today = new TodayPageObject(page);
    const pwa = new PwaPageObject(page);
    await today.goto();
    const { data } = await pwa.readManifest();
    const icons = data.icons ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of icons) {
      const response = await pwa.open(icon.src ?? "");
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"], icon.src).toBe("image/png");
    }
  });
});
