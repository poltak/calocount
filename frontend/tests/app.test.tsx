import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FrontendAppProvider,
  useFrontendApp,
} from "../src/app/frontend-app-context.js";
import { createApp } from "../src/tests/index.js";

function ApiAvailable() {
  const app = useFrontendApp();
  return (
    <p>
      {typeof app.api.encounters[":encounterId"].start.$post === "function"
        ? "API ready"
        : "API missing"}
    </p>
  );
}

const fetch: typeof globalThis.fetch = async () =>
  new Response(null, { status: 204 });

afterEach(() => cleanup());

describe("frontend app", () => {
  it("creates isolated storage and services for each test app", () => {
    const firstApp = createApp({ fetch });
    const secondApp = createApp({ fetch });

    expect(firstApp.storage).not.toBe(secondApp.storage);
    expect(firstApp.services).not.toBe(secondApp.services);
    expect(firstApp.api).not.toBe(secondApp.api);
    expect(firstApp.apiAccessEvents).not.toBe(secondApp.apiAccessEvents);
  });

  it("makes the app available through its provider", () => {
    render(
      <FrontendAppProvider app={createApp({ fetch })}>
        <ApiAvailable />
      </FrontendAppProvider>,
    );

    expect(screen.getByText("API ready")).toBeTruthy();
  });
});
