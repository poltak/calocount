import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const ENTRY = {
  caption: "Soup",
  mealType: "lunch",
  consumedAt: Date.parse("2026-09-12T08:00:00Z"),
  items: [{ name: "Soup", calories: 200, proteinG: 8 }],
};

test.describe("read one entry", () => {
  test("should send the entry as the day read does, and refuse an unknown id or another profile", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      data: ENTRY,
    });
    expect(created.status()).toBe(201);
    const { meal } = await created.json();

    const read = await ownerRequest.get(`${apiOrigin}/api/meals/${meal.id}`);
    expect(read.status()).toBe(200);
    expect(await read.json()).toEqual({ meal });
    const day = await (
      await ownerRequest.get(`${apiOrigin}/api/days/2026-09-12`)
    ).json();
    expect(day.meals).toContainEqual(meal);
    expect(JSON.stringify(meal)).not.toContain("ownerKey");

    const unknown = await ownerRequest.get(
      `${apiOrigin}/api/meals/${crypto.randomUUID()}`,
    );
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Entry not found." },
    });

    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { partnerProfileEnabled: true },
    });
    const partner = await ownerRequest.get(
      `${apiOrigin}/api/meals/${meal.id}?profile=partner`,
    );
    expect(partner.status()).toBe(404);

    const unsigned = await anonymousRequest.get(
      `${apiOrigin}/api/meals/${meal.id}`,
    );
    expect(unsigned.status()).toBe(401);
  });
});
