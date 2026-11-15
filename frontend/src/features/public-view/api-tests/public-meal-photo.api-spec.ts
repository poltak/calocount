import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("public meal photos", () => {
  test("should refuse unknown and invalid IDs", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    for (const id of [crypto.randomUUID(), "invalid%20id"]) {
      const response = await anonymousRequest.get(
        `${apiOrigin}/meal-photos/${id}`,
      );
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(await response.json()).toMatchObject({
        error: { code: "not_found" },
      });
    }
  });
  test("should serve an owned photo only while public and inside the window", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const photo = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
      "base64",
    );
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { partnerProfileEnabled: true },
    });
    for (const { daysAgo, profile } of [
      { daysAgo: 0, profile: "owner" },
      { daysAgo: 8, profile: "owner" },
      { daysAgo: 0, profile: "partner" },
    ]) {
      const saved = await ownerRequest.post(
        `${apiOrigin}/api/meals?profile=${profile}`,
        {
          multipart: {
            payload: JSON.stringify({
              consumedAt: Date.now() - daysAgo * 86400000,
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
            }),
            photo: { name: "oats.png", mimeType: "image/png", buffer: photo },
          },
        },
      );
      expect(saved.status()).toBe(201);
      const body = await saved.json();
      const url = `${apiOrigin}/meal-photos/${body.meal.id}`;
      await ownerRequest.patch(`${apiOrigin}/api/settings`, {
        data: { publicViewEnabled: false },
      });
      expect((await anonymousRequest.get(url)).status()).toBe(404);
      await ownerRequest.patch(`${apiOrigin}/api/settings`, {
        data: { publicViewEnabled: true },
      });
      const response = await anonymousRequest.get(url);
      if (daysAgo === 0 && profile === "owner") {
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toBe("image/png");
        expect(response.headers()["x-content-type-options"]).toBe("nosniff");
        expect(await response.body()).toEqual(photo);
      } else {
        expect(response.status()).toBe(404);
      }
    }
  });
});
