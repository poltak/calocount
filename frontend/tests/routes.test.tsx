import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { FrontendAppProvider } from "../src/app/frontend-app-context.js";
import { AppRoutes } from "../src/app/routes.js";
import { createApp } from "../src/features/core/tests/index.js";

const fetch: typeof globalThis.fetch = async (input) =>
  String(input).endsWith("/api/me")
    ? Response.json({
        user: { id: "owner", email: "owner@example.test", name: "Owner" },
      })
    : new Response(null, { status: 204 });
afterEach(cleanup);

function renderApp(path = "/") {
  return render(
    <StrictMode>
      <FrontendAppProvider app={createApp({ fetch })}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </FrontendAppProvider>
    </StrictMode>,
  );
}

describe("example routes", () => {
  it("mutates local Logic state and creates fresh state after navigation", async () => {
    renderApp();
    await screen.findByRole("button", { name: "Increase" });
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(screen.getByLabelText("Count").textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Decrease" }));
    expect(screen.getByLabelText("Count").textContent).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("Count").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    fireEvent.click(screen.getByRole("link", { name: "API example" }));
    expect(screen.getByRole("heading", { name: "API example" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Counter" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Count").textContent).toBe("0"),
    );
  });

  it("reads route parameters and reports a successful command", async () => {
    renderApp("/examples/api/enc-42");
    await screen.findByRole("button", { name: "Start" });
    expect(screen.getByText("enc-42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Command status").textContent).toBe(
        "start completed.",
      ),
    );
    expect(screen.getByLabelText("Completed commands").textContent).toBe("1");
  });

  it("renders a fallback for an unknown route", async () => {
    renderApp("/missing");
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
  });
});
