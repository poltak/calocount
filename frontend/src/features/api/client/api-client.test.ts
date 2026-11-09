import type { InferRequestType, InferResponseType } from "hono/client";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createApiClient, type BackendApi } from "./api-client.js";

type SetUp = BackendApi["auth"]["register"]["options"]["$post"];
type Status = BackendApi["auth"]["status"]["$get"];

// The UI Logic tests cover the client's runtime behavior, because they send
// every request through it. Its types need a test of their own. If they became
// `any`, every Logic would still compile.
describe("typed API client", () => {
  it("derives request, response, and error types from the backend routes", () => {
    expectTypeOf<BackendApi>().not.toBeAny();
    expectTypeOf<InferRequestType<SetUp>["json"]>().toEqualTypeOf<{
      setupCode?: unknown;
    }>();
    expectTypeOf<InferResponseType<Status, 200>>().toEqualTypeOf<{
      mode: "passkey";
      signedIn: boolean;
      hasPasskeys: boolean;
      setupCode: "missing" | "too_short" | "ready";
    }>();
    expectTypeOf<InferResponseType<Status, 404>>().toEqualTypeOf<{
      error: {
        code: "NOT_FOUND" | "ROUTE_NOT_FOUND";
        message: string;
        issues?: { path: string; message: string }[];
      };
    }>();
    expectTypeOf<InferResponseType<Status, 409>>().toEqualTypeOf<{
      error: {
        code: "CONFLICT" | "SETUP_REQUIRED" | "PASSKEY_EXISTS" | "LAST_PASSKEY";
        message: string;
        issues?: { path: string; message: string }[];
      };
    }>();
  });
});

// Each test fixture sets one absolute base URL, so no other test reaches this.
describe("API client base URL", () => {
  it("should build an absolute link to a route", () => {
    const api = createApiClient({ baseUrl: "http://app.test/" });

    expect(api.auth.status.$url().href).toEqual(
      "http://app.test/api/auth/status",
    );
  });

  it("should refuse a base URL that is not absolute", () => {
    expect(() => createApiClient({ baseUrl: "/app" })).toThrow(
      'The API base URL is not absolute: "/app"',
    );
    expect(() => createApiClient({ baseUrl: "" })).toThrow(
      'The API base URL is not absolute: ""',
    );
  });
});
