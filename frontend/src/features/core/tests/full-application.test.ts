import { describe, expect, inject, it } from "vitest";
import { createFullApplication } from "./full-application.js";
import { TEST_OWNER_CREDENTIALS } from "./test-owner.js";

describe("full application fixture", () => {
  // This test builds two applications, and the default limit allows for one.
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
  }, 40_000);

  it("should start the backend again on the same database, where the session of the owner is still valid", async () => {
    const { owner, restartBackend } = await createFullApplication();
    const cookie = inject("databaseTemplate")
      .signedIn.setCookies.map((setCookie) => setCookie.split(";")[0])
      .join("; ");

    const restarted = await restartBackend();

    const session = await restarted.services.auth.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.id).toEqual(owner.id);
  });
});
