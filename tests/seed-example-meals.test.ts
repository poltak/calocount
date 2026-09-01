import assert from "node:assert/strict";
import test from "node:test";

import { buildCompleteMealFixtures } from "./fixtures/example-meals";
import { logicalDateForTimezone, seedExampleMeals } from "../scripts/seed-example-meals";

test("seedExampleMeals inserts missing fixture IDs and skips existing IDs", async () => {
  const fixtures = buildCompleteMealFixtures({ anchorDate: "2026-09-01" });
  const storedIds = new Set(fixtures.slice(0, 2).map((meal) => meal.id));
  const postedIds: string[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!init?.method || init.method === "GET") {
      assert.equal(url.hostname, "localhost");
      assert.equal(url.searchParams.get("limit"), "500");
      return Response.json({ meals: [...storedIds].map((id) => ({ id })) });
    }
    assert.equal(init.method, "POST");
    const meal = JSON.parse(String(init.body)) as { id: string };
    postedIds.push(meal.id);
    storedIds.add(meal.id);
    return Response.json({ meal }, { status: 201 });
  };

  const first = await seedExampleMeals({ anchorDate: "2026-09-01", fetchImpl });
  const second = await seedExampleMeals({ anchorDate: "2026-09-01", fetchImpl });

  assert.deepEqual(first, { inserted: 19, skipped: 2 });
  assert.deepEqual(second, { inserted: 0, skipped: 21 });
  assert.deepEqual(postedIds, fixtures.slice(2).map((meal) => meal.id));
});

test("seedExampleMeals refuses non-local destinations", async () => {
  await assert.rejects(
    seedExampleMeals({ anchorDate: "2026-09-01", baseUrl: "https://example.com" }),
    /only write to a local HTTP server/u,
  );
});

test("logicalDateForTimezone uses the requested local date", () => {
  const instant = new Date("2026-09-01T18:30:00.000Z");
  assert.equal(logicalDateForTimezone(instant, "Asia/Ho_Chi_Minh"), "2026-09-02");
  assert.equal(logicalDateForTimezone(instant, "UTC"), "2026-09-01");
});
