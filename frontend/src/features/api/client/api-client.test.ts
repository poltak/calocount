import type { InferRequestType, InferResponseType } from "hono/client";
import { describe, expectTypeOf, it } from "vitest";
import type { BackendApi } from "./api-client.js";

type Start = BackendApi["encounters"][":encounterId"]["start"]["$post"];

// The UI Logic tests cover the client's runtime behavior, because they send
// every request through it. Its types need a test of their own. If they became
// `any`, every Logic would still compile.
describe("typed API client", () => {
  it("derives request and error types from the backend routes", () => {
    expectTypeOf<BackendApi>().not.toBeAny();
    expectTypeOf<InferRequestType<Start>["param"]>().toEqualTypeOf<{
      encounterId: string;
    }>();
    expectTypeOf<InferResponseType<Start, 501>>().toEqualTypeOf<{
      error: {
        code: "NOT_IMPLEMENTED";
        message: string;
        issues?: { path: string; message: string }[];
      };
    }>();
  });
});
