import { expect } from "@playwright/test";
import { test } from "./api-test.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function expectPrivateJson(headers: Record<string, string>) {
  expect(headers["content-type"]).toContain("application/json");
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["pragma"]).toBe("no-cache");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
}

test.describe("private JSON headers", () => {
  test("should mark each JSON answer as private, with and without a session", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const settings = await ownerRequest.get(`${apiOrigin}/api/settings`);
    expect(settings.status()).toBe(200);
    expectPrivateJson(settings.headers());

    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    const summary = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=daily`,
    );
    expect(summary.status()).toBe(200);
    expectPrivateJson(summary.headers());

    const unsigned = await anonymousRequest.get(`${apiOrigin}/api/settings`);
    expect(unsigned.status()).toBe(401);
    expectPrivateJson(unsigned.headers());
  });

  test("should leave the cache rules of a private photo as they are", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        payload: JSON.stringify({
          caption: "Soup",
          mealType: "lunch",
          items: [{ name: "Soup", calories: 200 }],
        }),
        photo: { name: "soup.png", mimeType: "image/png", buffer: PNG },
      },
    });
    expect(created.status()).toBe(201);
    const { meal } = await created.json();
    const photo = await ownerRequest.get(
      `${apiOrigin}/api/photos/${meal.photoKey}`,
    );
    expect(photo.status()).toBe(200);
    expect(photo.headers()["cache-control"]).toBe("private, max-age=300");
    expect(photo.headers()["pragma"]).toBeUndefined();
    expect(photo.headers()["x-robots-tag"]).toBeUndefined();
  });
});
