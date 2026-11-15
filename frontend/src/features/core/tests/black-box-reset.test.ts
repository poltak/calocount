import { describe, expect, it } from "vitest";
import { createFullApplication } from "./full-application.js";

const RESET_URL = "http://app.test/api/__black-box/reset";

async function countPasskeys(
  app: Awaited<ReturnType<typeof createFullApplication>>["backend"],
) {
  const rows = await app.db.selectFrom("passkeys").selectAll().execute();
  return rows.length;
}

// No UI Logic calls the reset route, which only the black-box tests use, so
// these tests send requests through the transport that the frontend uses.
describe("reset route for the black-box tests", () => {
  it("should not exist without the test-only setting", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: true,
    });

    const response = await transport.fetch(RESET_URL, { method: "POST" });

    expect(response.status).toEqual(404);
    expect(await countPasskeys(backend)).toEqual(1);
  });

  it("should refuse to reset when Logic runs without the setting", async () => {
    const { backend } = await createFullApplication({ authenticated: false });

    await expect(backend.logic.blackBox.reset()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await countPasskeys(backend)).toEqual(1);
  });

  it("should empty the database with the test-only setting", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: true,
      backendOptions: { config: { blackBox: true } },
    });
    expect(await countPasskeys(backend)).toEqual(1);

    const response = await transport.fetch(RESET_URL, { method: "POST" });

    expect(response.status).toEqual(204);
    expect(await countPasskeys(backend)).toEqual(0);
    const status = await transport.fetch("http://app.test/api/auth/status");
    expect(await status.json()).toMatchObject({ signedIn: false });
  });
});
