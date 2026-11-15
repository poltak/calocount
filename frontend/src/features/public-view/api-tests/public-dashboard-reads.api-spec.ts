import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
  "base64",
);

interface Timed {
  timezone: string;
}
interface SummaryBody extends Timed {
  profile: string;
  partnerProfileEnabled: boolean;
  recentWeights: unknown[];
}
interface DayBody extends Timed {
  meals: { items: object[] }[];
  weight: unknown;
}
interface InsightsBody extends Timed {
  entries: { items: object[] }[];
  referenceSettings: unknown;
}

/** Each route is public, and gives a body that the owner's frontend code can read. */
const READS = (date: string) => [
  `/api/public/dashboard/summary?timezone=UTC`,
  `/api/public/days/${date}?timezone=UTC`,
  `/api/public/days?month=${date.slice(0, 7)}&timezone=UTC`,
  `/api/public/insights?timezone=UTC`,
];

test.describe("public dashboard reads", () => {
  test("should refuse each read while the public view is off, and answer once it is on", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const date = new Date().toISOString().slice(0, 10);

    for (const path of READS(date)) {
      const off = await anonymousRequest.get(`${apiOrigin}${path}`);
      expect(off.status(), path).toBe(404);
      expect(off.headers()["cache-control"], path).toBe("no-store");
      expect(await off.json(), path).toMatchObject({
        error: { code: "public_view_off" },
      });
    }

    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });

    for (const path of READS(date)) {
      const on = await anonymousRequest.get(`${apiOrigin}${path}`);
      expect(on.status(), path).toBe(200);
      expect(on.headers()["cache-control"], path).toBe("no-store");
    }
  });

  test("should give a visitor the values of the log and nothing that the owner keeps private", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const saved = await ownerRequest.post(`${apiOrigin}/api/meals`, {
      multipart: {
        payload: JSON.stringify({
          consumedAt: Date.now(),
          mealType: "lunch",
          source: "dashboard",
          status: "complete",
          caption: "Secret caption",
          notes: "Secret notes",
          assumptions: ["Secret assumption"],
          confidence: 0.8,
          items: [
            {
              name: "Oats",
              quantity: 1,
              unit: "bowl",
              calories: 400,
              proteinG: 20,
              carbsG: 50,
              fatG: 8,
              fiberG: 4,
              source: "secret-source",
              confidence: 0.7,
              nutrientProvenance: { fiberG: "ai" },
            },
          ],
        }),
        photo: { name: "oats.png", mimeType: "image/png", buffer: PNG },
      },
    });
    expect(saved.status()).toBe(201);
    const { meal } = await saved.json();
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: {
        timezone: "Asia/Tokyo",
        vitaminB6UsFnbAdultUlEnabled: true,
        partnerProfileEnabled: true,
        publicViewEnabled: true,
      },
    });
    const date = (
      await (
        await anonymousRequest.get(
          `${apiOrigin}/api/public/dashboard/summary?timezone=UTC`,
        )
      ).json()
    ).date;
    const weight = await ownerRequest.put(`${apiOrigin}/api/weights`, {
      data: { logicalDate: date, weightKg: 70 },
    });
    expect(weight.status()).toBe(200);
    const ownerDay = await (
      await ownerRequest.get(
        `${apiOrigin}/api/days/${date}?timezone=Asia/Tokyo`,
      )
    ).json();
    const photoKey: string = ownerDay.meals[0].photoKey;
    expect(photoKey).toBeTruthy();

    const texts: string[] = [];
    async function read<Body>(path: string): Promise<Body> {
      const response = await anonymousRequest.get(`${apiOrigin}${path}`);
      expect(response.status(), path).toBe(200);
      const text = await response.text();
      texts.push(text);
      return JSON.parse(text) as Body;
    }
    const [summaryPath, dayPath, monthPath, insightsPath] = READS(date);
    const summary = await read<SummaryBody>(summaryPath ?? "");
    const day = await read<DayBody>(dayPath ?? "");
    const month = await read<Timed>(monthPath ?? "");
    const insights = await read<InsightsBody>(insightsPath ?? "");

    // The days count in the saved timezone, not in the one that the visitor asks for.
    for (const body of [summary, day, month, insights]) {
      expect(body.timezone).toBe("Asia/Tokyo");
    }
    expect(summary).toMatchObject({
      profile: "owner",
      partnerProfileEnabled: false,
    });
    expect(summary.recentWeights).toEqual([
      expect.objectContaining({
        logicalDate: date,
        weightKg: 70,
        createdAt: 0,
        updatedAt: 0,
      }),
    ]);
    expect(day.meals).toHaveLength(1);
    expect(day.meals[0]).toMatchObject({
      id: meal.id,
      mealType: "lunch",
      totalCalories: 400,
      totalProteinG: 20,
      caption: "",
      notes: null,
      assumptions: [],
      confidence: null,
      photoKey: null,
      photoMimeType: null,
      photoSizeBytes: null,
      source: "",
      externalRequestId: null,
      savedEntryId: null,
      createdAt: 0,
      updatedAt: 0,
      hasPhoto: true,
    });
    expect(day.meals[0]?.items[0]).toMatchObject({
      name: "Oats",
      calories: 400,
      fiberG: 4,
      source: "",
      confidence: null,
      createdAt: 0,
      updatedAt: 0,
    });
    expect(day.meals[0]?.items[0]).not.toHaveProperty("nutrientProvenance");
    expect(day.weight).toMatchObject({ weightKg: 70, createdAt: 0 });
    expect(insights.entries[0]?.items[0]).not.toHaveProperty(
      "nutrientProvenance",
    );
    expect(insights.referenceSettings).toEqual({
      vitaminB6UsFnbAdultUlEnabled: false,
      usFnbAdultUlEnabled: false,
    });
    for (const text of texts) {
      for (const secret of ["Secret", photoKey, "ownerKey", "secret-source"]) {
        expect(text, `a body holds ${secret}`).not.toContain(secret);
      }
    }
  });
});
