import { describe, expect, it } from "vitest";
import { createFullApplication } from "./full-application.js";
import { TEST_OWNER_CREDENTIALS } from "./test-owner.js";

describe("full application fixture", () => {
  it("should give each application its own database", async () => {
    const first = await createFullApplication();
    const second = await createFullApplication();
    const readNames = async ({ backend }: typeof first) => {
      const users = await backend.db
        .selectFrom("user")
        .select("name")
        .execute();
      return users.map((user) => user.name);
    };

    await first.backend.db
      .updateTable("user")
      .set({ name: "Changed" })
      .execute();

    expect(await readNames(first)).toEqual(["Changed"]);
    expect(await readNames(second)).toEqual([TEST_OWNER_CREDENTIALS.name]);
  });
});
