import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const DAY_MS = 86_400_000;

const ENTRY = {
  mealType: "lunch",
  source: "dashboard",
  status: "complete",
  items: [
    {
      name: "Photo oats",
      quantity: 1,
      unit: "serving",
      calories: 400,
      proteinG: 20,
      carbsG: 50,
      fatG: 8,
    },
  ],
};

test.describe("public meal photo requests", () => {
  test("should answer a matching If-None-Match with 304 and keep the photo revalidated", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    const saved = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        payload: JSON.stringify({ ...ENTRY, consumedAt: Date.now() }),
        photo: { name: "oats.png", mimeType: "image/png", buffer: PNG },
      },
    });
    const { meal } = await saved.json();
    const url = `${apiOrigin}/meal-photos/${meal.id}`;

    const first = await anonymousRequest.get(url);

    expect(first.status()).toBe(200);
    expect(first.headers()["cache-control"]).toBe(
      "public, max-age=0, must-revalidate",
    );
    const etag = first.headers()["etag"] ?? "";
    expect(etag).not.toBe("");
    const unchanged = await anonymousRequest.get(url, {
      headers: { "if-none-match": etag },
    });
    expect(unchanged.status()).toBe(304);
    expect(unchanged.headers()["etag"]).toBe(etag);
    expect(unchanged.headers()["x-content-type-options"]).toBe("nosniff");
    const changed = await anonymousRequest.get(url, {
      headers: { "if-none-match": '"another"' },
    });
    expect(changed.status()).toBe(200);
  });

  test("should count the seven days in the saved timezone of the owner", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    // Pick the zone whose date differs from the UTC date at this hour, then
    // an entry that only that zone puts inside the window.
    const now = Date.now();
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const eastHour = new Date(now).getUTCHours() >= 10;
    const timezone = eastHour ? "Pacific/Kiritimati" : "Pacific/Pago_Pago";
    const utcMidnight = Date.parse(`${utcDay}T00:00:00Z`);
    // East (+14): the window starts at 10:00 UTC six days ago, so 05:00 UTC is outside it.
    // West (-11): the window starts at 11:00 UTC seven days ago, so 15:00 UTC is inside it.
    const consumedAt = eastHour
      ? utcMidnight - 6 * DAY_MS + 5 * 3_600_000
      : utcMidnight - 7 * DAY_MS + 15 * 3_600_000;
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    const saved = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        payload: JSON.stringify({ ...ENTRY, consumedAt }),
        photo: { name: "oats.png", mimeType: "image/png", buffer: PNG },
      },
    });
    const { meal } = await saved.json();
    const url = `${apiOrigin}/meal-photos/${meal.id}`;
    const inWindowInUtc = eastHour;
    expect((await anonymousRequest.get(url)).status()).toBe(
      inWindowInUtc ? 200 : 404,
    );

    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { timezone },
    });

    expect((await anonymousRequest.get(url)).status()).toBe(
      inWindowInUtc ? 404 : 200,
    );
  });
});
