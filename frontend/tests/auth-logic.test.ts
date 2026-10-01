import { InitializationCancelledError } from "@shadow/common/features/core/logic/logic";
import { describe, expect, it, vi } from "vitest";
import { AuthLogic } from "../src/features/auth/ui/auth-logic.js";
import { createApp } from "../src/tests/index.js";

const user = { id: "owner", email: "owner@example.test", name: "Owner" };
function createLogic(fetch: typeof globalThis.fetch) {
  const app = createApp({ fetch });
  const logic = new AuthLogic({
    storage: {},
    services: app.services,
    api: { me: app.api.me, session: app.api.session },
    apiAccessEvents: app.apiAccessEvents,
  });
  return { app, logic };
}

describe("session state", () => {
  it("does not restore access when an old profile response arrives after sign-out", async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      complete = resolve;
    });
    let profiles = 0;
    const { logic } = createLogic(async (_input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
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
    const { logic } = createLogic(async () => {
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

  it("checks the session again when the window regains focus", async () => {
    let signedIn = true;
    let profileRequests = 0;
    const { app, logic } = createLogic(async () => {
      profileRequests += 1;
      return signedIn
        ? Response.json({ user })
        : Response.json(
            { error: { code: "UNAUTHENTICATED", message: "Sign in" } },
            { status: 401 },
          );
    });
    try {
      await logic.initialize();
      expect(logic.state.status).toBe("signedIn");
      signedIn = false;
      app.services.windowFocus.focus();
      await vi.waitFor(() => expect(logic.state.status).toBe("signedOut"));
      expect(profileRequests).toBe(2);

      await logic.cleanup();
      app.services.windowFocus.focus();
      expect(profileRequests).toBe(2);
    } finally {
      await logic.cleanup();
    }
  });

  it("cancels an in-flight session check during cleanup", async () => {
    let signal: AbortSignal | undefined;
    const { logic } = createLogic(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(signal?.reason));
        }),
    );
    const initialization = logic.initialize();
    await vi.waitFor(() => expect(signal).toBeDefined());

    const cleanup = logic.cleanup();
    expect(signal?.aborted).toBe(true);
    await expect(initialization).rejects.toBeInstanceOf(
      InitializationCancelledError,
    );
    await cleanup;
    expect(logic.state.status).toBe("loading");
  });
});
