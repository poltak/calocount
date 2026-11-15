import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("the agent guide", () => {
  test("should serve the public paths and the offered MCP tools only while public view is on", async ({
    agent,
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const off = await anonymousRequest.get(`${apiOrigin}/llms.txt`);
    expect(off.status()).toBe(404);
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { publicViewEnabled: true },
    });
    const on = await anonymousRequest.get(`${apiOrigin}/llms.txt`);
    expect(on.status()).toBe(200);
    expect(on.headers()["content-type"]).toContain("text/plain");
    const guide = await on.text();
    for (const path of [
      "/api/public/summary?view=daily",
      "/api/public/summary?view=month",
      "/api/public/summary?view=day",
      "/meal-photos/",
      "/mcp",
    ]) {
      expect(guide).toContain(path);
    }
    for (const tool of await agent.listTools()) {
      expect(guide).toContain(`\`${tool.name}\``);
    }
  });
});
