import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("public summary", () => {
  test("should refuse reads while off and expose only public fields while on", async ({
    agent,
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const off = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=daily`,
    );
    expect(off.status()).toBe(404);
    expect(await off.json()).toMatchObject({
      error: { code: "public_view_off" },
    });
    const date = new Date().toISOString().slice(0, 10);
    await agent.callTool("add_meals", {
      meals: [
        {
          request_id: crypto.randomUUID(),
          name: "Public oats",
          kcal: 400,
          protein: 20,
          carbs: 50,
          fat: 8,
          eaten_at: `${date}T08:00:00Z`,
        },
      ],
    });
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    for (const query of [
      "view=daily",
      `view=month&month=${date.slice(0, 7)}`,
      `view=day&date=${date}`,
    ]) {
      const response = await anonymousRequest.get(
        `${apiOrigin}/api/public/summary?${query}`,
      );
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("application/json");
      expect(response.headers()["cache-control"]).toBe("no-store");
      const body = await response.json();
      if (body.view === "daily") {
        expect(Object.keys(body).toSorted()).toEqual(
          [
            "view",
            "date",
            "timezone",
            "units",
            "firstEntryDate",
            "firstWeightDate",
            "fromDate",
            "toDate",
            "targets",
            "goalChanges",
            "days",
          ].toSorted(),
        );
        expect(body.days).toContainEqual(
          expect.objectContaining({ date, calories: 400, mealCount: 1 }),
        );
      } else if (body.view === "month") {
        expect(Object.keys(body).toSorted()).toEqual(
          ["view", "month", "timezone", "firstDate", "days"].toSorted(),
        );
        expect(body.days).toContainEqual({
          date,
          calories: 400,
          proteinG: 20,
          mealCount: 1,
        });
      } else {
        expect(Object.keys(body).toSorted()).toEqual(
          [
            "view",
            "date",
            "timezone",
            "meals",
            "weight",
            "proteinGoal",
          ].toSorted(),
        );
        expect(body.meals).toHaveLength(1);
        expect(Object.keys(body.meals[0]).toSorted()).toEqual(
          [
            "id",
            "consumedAt",
            "mealType",
            "hasPhoto",
            "totalCalories",
            "totalProteinG",
            "totalCarbsG",
            "totalFatG",
            "items",
          ].toSorted(),
        );
        expect(body.meals[0].items[0]).toMatchObject({
          name: "Public oats",
          calories: 400,
        });
      }
      expect(JSON.stringify(body)).not.toMatch(
        /ownerKey|photoKey|caption|notes|externalRequestId|confidence|nutrientProvenance/,
      );
    }
  });
  test("should refuse an invalid query", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=month&month=invalid`,
    );
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_query" },
    });
  });
});
