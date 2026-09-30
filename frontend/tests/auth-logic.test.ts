import { describe, expect, it } from "vitest";
import { AuthLogic } from "../src/features/auth/ui/auth-logic.js";
import { createApp } from "../src/tests/index.js";

const user = { id: "owner", email: "owner@example.test", name: "Owner" };
function createLogic(fetch: typeof globalThis.fetch) {
  const app = createApp({ fetch });
  return new AuthLogic({
    storage: {},
    services: {},
    api: { api: app.api.api },
    auth: app.auth,
    apiAccessEvents: app.apiAccessEvents,
  });
}

describe("session state", () => {
  it("does not restore access when an old profile response arrives after sign-out", async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    let profiles = 0;
    const logic = createLogic(async (input) => {
      if (String(input).endsWith("/sign-out"))
        return Response.json({ success: true });
      profiles += 1;
      return profiles === 2 ? pending : Response.json({ user });
    });
    try {
      await logic.initialize();
      expect(logic.state.status).toBe("signedIn");
      const refresh = logic.refresh();
      await logic.signOut();
      complete(Response.json({ user }));
      await refresh;
      expect(logic.state).toMatchObject({
        status: "signedOut",
        user: null,
        busy: false,
      });
    } finally {
      complete(Response.json({ user }));
      await logic.cleanup();
    }
  });

  it("keeps access closed after a connection failure and permits a retry", async () => {
    let offline = true;
    const logic = createLogic(async () => {
      if (offline) throw new Error("Connection unavailable");
      return Response.json({ user });
    });
    try {
      await logic.initialize();
      expect(logic.state).toMatchObject({
        status: "error",
        user: null,
        error: "Connection unavailable",
      });
      offline = false;
      await logic.refresh();
      expect(logic.state).toMatchObject({
        status: "signedIn",
        user,
        error: null,
      });
    } finally {
      await logic.cleanup();
    }
  });
});
