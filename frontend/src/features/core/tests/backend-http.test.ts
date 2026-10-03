import { describe, expect, it } from "vitest";
import { createFullApplication } from "./full-application.js";

const ORIGIN = "http://shadow.test";

// No UI Logic reaches this behavior of the backend's HTTP app, so these tests
// send requests through the same transport that the frontend uses.
describe("backend HTTP app", () => {
  it("should give each request an ID and log the request with it", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: false,
    });

    const generated = await transport.fetch(`${ORIGIN}/api/me?secret=1`);
    const generatedId = generated.headers.get("x-request-id");
    expect(generatedId).toMatch(/^[\w-]{36}$/);

    const supplied = await transport.fetch(`${ORIGIN}/api/me`, {
      headers: { "x-request-id": "from-the-caller" },
    });
    expect(supplied.headers.get("x-request-id")).toEqual("from-the-caller");

    expect(backend.services.logger.entries).toMatchObject([
      {
        level: "info",
        message: "Request handled",
        // The path has no query string.
        fields: {
          requestId: generatedId,
          method: "GET",
          path: "/api/me",
          status: 401,
        },
      },
      {
        level: "info",
        message: "Request handled",
        fields: { requestId: "from-the-caller", status: 401 },
      },
    ]);
  });

  it("should hide an unexpected error from the caller and log it with the request ID", async () => {
    const { backend, transport } = await createFullApplication();
    await backend.db.destroy();

    const response = await transport.fetch(`${ORIGIN}/api/me`);
    expect(response.status).toEqual(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL", message: "Internal server error" },
    });

    const failure = backend.services.logger.entries.find(
      (entry) => entry.message === "Request failed with an unexpected error",
    );
    expect(failure).toMatchObject({
      level: "error",
      fields: {
        requestId: response.headers.get("x-request-id"),
        method: "GET",
        path: "/api/me",
      },
    });
    expect(failure?.fields?.error).toBeInstanceOf(Error);
  });
});
