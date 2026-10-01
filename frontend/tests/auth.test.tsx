import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrontendAppProvider } from "../src/app/frontend-app-context.js";
import { AppRoutes } from "../src/app/routes.js";
import { createFullApplication } from "./fixtures/full-application.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderApp(
  fixture: Awaited<ReturnType<typeof createFullApplication>>,
  path = "/examples/api/enc-42",
) {
  return render(
    <StrictMode>
      <FrontendAppProvider app={fixture.frontend}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </FrontendAppProvider>
    </StrictMode>,
  );
}
function enterCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("authentication UI with the real backend", () => {
  it("rejects bad credentials, signs in to the requested page, and signs out without network fetch", async () => {
    const fixture = await createFullApplication({ authenticated: false });
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network must not be used"));
    try {
      const view = renderApp(fixture);
      await screen.findByRole("heading", { name: "Sign in to Shadow" });
      await waitFor(() =>
        expect(
          screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" })
            .disabled,
        ).toBe(false),
      );
      enterCredentials({ ...fixture.credentials, password: "wrong-password" });
      await screen.findByRole("alert");
      expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
      expect(
        (screen.getByLabelText("Password") as HTMLInputElement).value,
      ).toBe("");
      enterCredentials(fixture.credentials);
      await screen.findByRole("button", { name: "Start" });
      expect(screen.getByText("enc-42")).toBeTruthy();
      expect((await fixture.frontend.api.me.$get()).status).toBe(200);
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      await screen.findByRole("heading", { name: "Sign in to Shadow" });
      expect((await fixture.frontend.api.me.$get()).status).toBe(401);
      expect(network).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      cleanup();
      await Promise.resolve();
      await fixture.close();
    }
  }, 15000);

  it("returns to sign-in when a business request finds an expired session", async () => {
    const fixture = await createFullApplication();
    try {
      renderApp(fixture);
      await screen.findByRole("button", { name: "Start" });
      await fixture.backend.storage.auth.props.db
        .withTables<{ session: { expiresAt: Date } }>()
        .updateTable("session")
        .set({ expiresAt: new Date(0) })
        .execute();
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await screen.findByRole("heading", { name: "Sign in to Shadow" });
      expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    } finally {
      cleanup();
      await Promise.resolve();
      await fixture.close();
    }
  }, 15000);

  it("does not admit another account even when the SDK accepts its password", async () => {
    const fixture = await createFullApplication({ authenticated: false });
    try {
      const other = {
        email: "other@example.test",
        name: "Other",
        password: "another-test-password",
      };
      await fixture.backend.services.auth.createAccount(other);
      renderApp(fixture);
      await screen.findByRole("heading", { name: "Sign in to Shadow" });
      await waitFor(() =>
        expect(
          screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" })
            .disabled,
        ).toBe(false),
      );
      enterCredentials(other);
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain(
          "cannot access Shadow",
        ),
      );
      expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
      expect((await fixture.frontend.api.me.$get()).status).toBe(403);
    } finally {
      cleanup();
      await Promise.resolve();
      await fixture.close();
    }
  }, 15000);
});
