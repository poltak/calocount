import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const DAY_MS = 86_400_000;

test.describe("public summary history", () => {
  test("should count days in the saved timezone across a change of the clocks", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    const beforeSaving = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=month&month=2026-03`,
    );
    // The owner saved no timezone yet, so days count in UTC.
    expect((await beforeSaving.json()).timezone).toBe("UTC");
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { timezone: "America/New_York" },
    });
    // New York is 5 hours behind UTC until 02:00 on 8 March 2026, then 4 hours behind.
    for (const [name, eatenAt, calories] of [
      ["Before the change", "2026-03-08T04:30:00Z", 100],
      ["Night of the change", "2026-03-08T05:30:00Z", 200],
      ["After the change", "2026-03-09T03:30:00Z", 300],
      ["Next day", "2026-03-09T04:30:00Z", 400],
    ] as const) {
      const saved = await ownerRequest.post(`${apiOrigin}/api/meals`, {
        data: {
          consumedAt: Date.parse(eatenAt),
          items: [{ name, calories }],
        },
      });
      expect(saved.status()).toBe(201);
    }

    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=month&month=2026-03`,
    );

    const month = await response.json();
    expect(month.timezone).toBe("America/New_York");
    expect(month.firstDate).toBe("2026-03-07");
    expect(
      month.days.map((day: { date: string; calories: number }) => [
        day.date,
        day.calories,
      ]),
    ).toEqual([
      ["2026-03-07", 100],
      ["2026-03-08", 500],
      ["2026-03-09", 400],
    ]);
  });

  test("should keep the latest 366 days and say when tracking began", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    const longAgo = new Date(Date.now() - 400 * DAY_MS);
    await ownerRequest.post(`${apiOrigin}/api/meals`, {
      data: {
        consumedAt: longAgo.getTime(),
        items: [{ name: "Long ago", calories: 500 }],
      },
    });
    await ownerRequest.post(`${apiOrigin}/api/meals`, {
      data: { items: [{ name: "Today", calories: 800 }] },
    });
    await ownerRequest.put(`${apiOrigin}/api/weights`, {
      data: {
        logicalDate: new Date(Date.now() - 390 * DAY_MS)
          .toISOString()
          .slice(0, 10),
        weightKg: 75,
      },
    });

    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=daily`,
    );

    const daily = await response.json();
    expect(daily.firstEntryDate).toBe(longAgo.toISOString().slice(0, 10));
    expect(daily.days).toHaveLength(366);
    expect(daily.fromDate).toBe(daily.days[0].date);
    expect(daily.fromDate > daily.firstEntryDate).toBe(true);
    expect(daily.toDate).toBe(daily.date);
    expect(daily.days.at(-1).date).toBe(daily.date);
    expect(
      daily.days.reduce(
        (total: number, day: { calories: number }) => total + day.calories,
        0,
      ),
    ).toBe(800);
  });

  test("should give the current targets and the recorded goal changes", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: {
        publicViewEnabled: true,
        dailyCalorieTarget: 2100,
        proteinGoalMode: "grams",
        dailyProteinTargetG: 140,
      },
    });
    await ownerRequest.put(`${apiOrigin}/api/weights`, {
      data: {
        logicalDate: new Date(Date.now() - 2 * DAY_MS)
          .toISOString()
          .slice(0, 10),
        weightKg: 75,
      },
    });
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: {
        proteinGoalMode: "gramsPerKg",
        dailyProteinTargetPerKg: 2,
      },
    });

    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=daily`,
    );

    const daily = await response.json();
    // The target per kilogram uses the latest weight, which is older than today.
    expect(daily.targets).toEqual({ calories: 2100, proteinG: 150 });
    expect(daily.goalChanges).toEqual([
      expect.objectContaining({
        calories: 2100,
        proteinMode: "grams",
        proteinG: 140,
        proteinGramsPerKg: null,
      }),
      expect.objectContaining({
        calories: 2100,
        proteinMode: "gramsPerKg",
        proteinG: null,
        proteinGramsPerKg: 2,
      }),
    ]);
  });

  test("should round amounts and give the protein goal of the day", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true, dailyProteinTargetG: 120 },
    });
    const date = new Date().toISOString().slice(0, 10);
    await ownerRequest.post(`${apiOrigin}/api/meals`, {
      data: {
        items: [
          { name: "First", calories: 0.1 },
          { name: "Second", calories: 0.2 },
        ],
      },
    });

    const response = await anonymousRequest.get(
      `${apiOrigin}/api/public/summary?view=day&date=${date}`,
    );

    const day = await response.json();
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(day.meals[0].totalCalories).toBe(0.3);
    expect(day.meals[0].hasPhoto).toBe(false);
    expect(day.proteinGoal).toEqual({
      date,
      targetG: 120,
      weightKg: null,
      weightDate: null,
    });
  });

  test("should answer 400 for an unknown view and for a bad date", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    for (const query of [
      "view=weekly",
      "view=month",
      "view=day&date=2026-02-30",
    ]) {
      const response = await anonymousRequest.get(
        `${apiOrigin}/api/public/summary?${query}`,
      );
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "invalid_query" },
      });
    }
  });
});
