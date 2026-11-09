import type { InferRequestType, InferResponseType } from "hono/client";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createApiClient, type BackendApi } from "./api-client.js";

type GetNote = BackendApi["notes"][":noteId"]["$get"];
type DeleteNote = BackendApi["notes"][":noteId"]["$delete"];

// The UI Logic tests cover the client's runtime behavior, because they send
// every request through it. Its types need a test of their own. If they became
// `any`, every Logic would still compile.
describe("typed API client", () => {
  it("derives request, response, and error types from the backend routes", () => {
    expectTypeOf<BackendApi>().not.toBeAny();
    expectTypeOf<InferRequestType<GetNote>["param"]>().toEqualTypeOf<{
      noteId: string;
    }>();
    expectTypeOf<InferResponseType<GetNote, 200>>().toEqualTypeOf<{
      note: {
        id: string;
        title: string;
        body: string;
        // A date arrives as text.
        createdAt: string;
        updatedAt: string;
      };
    }>();
    expectTypeOf<InferResponseType<DeleteNote, 404>>().toEqualTypeOf<{
      error: {
        code: "NOT_FOUND";
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

    expect(api.me.$url().href).toEqual("http://app.test/api/me");
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
