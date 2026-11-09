import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("owner export", () => {
  test("should export every entry with exact values and safe CSV cells", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    const names = ['Rice, "white"', "=1+1"];
    await agent.callTool("add_meals", {
      meals: names.map((name) => ({
        request_id: crypto.randomUUID(),
        name,
        kcal: 400,
        protein: 20,
        carbs: 50,
        fat: 8,
        nutrients: { fiberG: 2.5 },
        eaten_at: "2026-09-12T08:00:00Z",
      })),
    });
    const json = await ownerRequest.get(`${apiOrigin}/api/export?format=json`);
    expect(json.status()).toBe(200);
    expect(json.headers()["content-type"]).toContain("application/json");
    expect(json.headers()["content-disposition"]).toContain(
      'filename="calocount-export.json"',
    );
    expect(json.headers()["cache-control"]).toBe("no-store");
    const body = await json.json();
    expect(body.meals).toHaveLength(2);
    for (const name of names) {
      expect(body.meals).toContainEqual(
        expect.objectContaining({
          totalCalories: 400,
          items: [
            expect.objectContaining({
              name,
              calories: 400,
              proteinG: 20,
              carbsG: 50,
              fatG: 8,
              fiberG: 2.5,
              magnesiumMg: null,
            }),
          ],
        }),
      );
    }
    expect(JSON.stringify(body)).not.toContain("ownerKey");
    const csv = await ownerRequest.get(`${apiOrigin}/api/export?format=csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(csv.headers()["content-disposition"]).toContain(
      'filename="calocount-export.csv"',
    );
    const text = await csv.text();
    expect(text.trim().split("\n")).toHaveLength(3);
    expect(text).toContain('"Rice, ""white"""');
    expect(text).toContain('"\'=1+1"');
    expect(text).toContain('"2.5",""');
  });
  test("should refuse an invalid format and a request without a session", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const invalid = await ownerRequest.get(
      `${apiOrigin}/api/export?format=xml`,
    );
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "invalid_format" },
    });
    const unsigned = await anonymousRequest.get(`${apiOrigin}/api/export`);
    expect(unsigned.status()).toBe(401);
  });
});
