import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("weight reads", () => {
  test("should return the saved weights in date order within the range", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    for (const [logicalDate, weightKg] of [
      ["2026-08-20", 70.4],
      ["2026-09-03", 69.1],
      ["2026-09-01", 69.5],
    ] as const) {
      const saved = await ownerRequest.put(`${apiOrigin}/api/weights`, {
        data: { logicalDate, weightKg },
      });
      expect(saved.status()).toBe(200);
    }
    const result = await agent.callTool("get_weight_history", {
      start_date: "2026-09-01",
      end_date: "2026-09-03",
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({
      firstWeightDate: "2026-08-20",
      profile: "owner",
      weights: [
        { date: "2026-09-01", weightKg: 69.5 },
        { date: "2026-09-03", weightKg: 69.1 },
      ],
    });
  });
});
