import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const TOP_LEVEL_FIELDS = [
  "date",
  "timezone",
  "targets",
  "proteinGoal",
  "today",
  "sevenDay",
  "trend",
  "nutrition",
  "insights",
  "recentMeals",
  "recentWeights",
];

function dateOf(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

test.describe("public dashboard summary", () => {
  test("should be the default view and refuse reads while the public view is off", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const off = await anonymousRequest.get(`${apiOrigin}/api/public/summary`);
    expect(off.status()).toBe(404);
    expect(await off.json()).toMatchObject({
      error: { code: "public_view_off" },
    });
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });

    const implicit = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary`,
    );
    const named = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=dashboard`,
    );

    for (const response of [implicit, named]) {
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(Object.keys(await response.json()).toSorted()).toEqual(
        TOP_LEVEL_FIELDS.toSorted(),
      );
    }
  });

  test("should give 30 days of totals, the weights and the entries of the last 7 days without private fields", async ({
    agent,
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const today = dateOf(0);
    await agent.callTool("add_meals", {
      meals: [
        {
          request_id: crypto.randomUUID(),
          name: "Dashboard oats",
          kcal: 400,
          protein: 20,
          carbs: 50,
          fat: 8,
          eaten_at: `${today}T08:00:00Z`,
          nutrients: { fiberG: 6 },
        },
        {
          request_id: crypto.randomUUID(),
          name: "Old soup",
          kcal: 200,
          protein: 5,
          carbs: 20,
          fat: 4,
          eaten_at: `${dateOf(10)}T12:00:00Z`,
        },
      ],
    });
    for (const [daysAgo, weightKg] of [
      [2, 80],
      [20, 81],
    ] as const) {
      const saved = await ownerRequest.put(`${apiOrigin}/api/weights`, {
        data: { logicalDate: dateOf(daysAgo), weightKg },
      });
      expect(saved.status()).toBe(200);
    }
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true, dailyCalorieTarget: 2000 },
    });

    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary`,
    );
    const body = await response.json();

    expect(body).toMatchObject({
      date: today,
      timezone: "UTC",
      targets: { calories: 2000 },
      today: { calories: 400, proteinG: 20, mealCount: 1 },
      sevenDay: { calories: 400, daysWithMeals: 1 },
    });
    expect(body.trend.byDate).toHaveLength(30);
    expect(body.trend.byDate.at(-1)).toMatchObject({
      date: today,
      calories: 400,
    });
    expect(body.trend.byDate.at(-1).nutrients.fiberG).toEqual({
      amount: 6,
      knownItemCount: 1,
      totalItemCount: 1,
      complete: true,
    });
    expect(
      body.trend.weights.map((weight: { weightKg: number }) => weight.weightKg),
    ).toEqual([80, 81]);
    expect(body.recentWeights).toMatchObject([{ weightKg: 80 }]);
    expect(body.sevenDay.trend).toHaveLength(7);
    expect(body.nutrition.byDate).toHaveLength(7);
    expect(body.proteinGoal.byDate).toHaveLength(31);
    expect(body.recentMeals).toHaveLength(1);
    expect(Object.keys(body.recentMeals[0]).toSorted()).toEqual(
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
    expect(body.insights).toMatchObject({
      fromDate: dateOf(30),
      toDate: today,
    });
    expect(
      body.insights.entries
        .map((entry: { date: string }) => entry.date)
        .toSorted(),
    ).toEqual([dateOf(10), today].toSorted());
    expect(JSON.stringify(body)).not.toMatch(
      /ownerKey|photoKey|caption|notes|externalRequestId|confidence|nutrientProvenance/,
    );
  });

  test("should refuse an unknown view and name the views in the message", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });

    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=weekly`,
    );

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_query",
        message: "view must be one of: dashboard, daily, month, day.",
      },
    });
  });
});
