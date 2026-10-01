import { createTestBackend } from "backend/testing";
import type { InferRequestType, InferResponseType } from "hono/client";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  ApiRequestError,
  createApiClient,
  encodeApiParam,
  requireApiSuccess,
  type BackendApi,
} from "../src/features/api/client/api-client.js";

type Start = BackendApi["encounters"][":encounterId"]["start"]["$post"];

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

  it("uses the configured HTTP fetch with the backend route shape", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient({
      baseUrl: "https://api.example.test/",
      fetch,
    });
    const endpoint = api.encounters[":encounterId"];
    await requireApiSuccess(
      await endpoint.start.$post({ param: { encounterId: "enc-1" } }),
    );
    await endpoint.pause.$post({ param: { encounterId: "enc-1" } });
    await endpoint.stop.$post({ param: { encounterId: "enc-1" } });
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.example.test/api/encounters/enc-1/start",
      "https://api.example.test/api/encounters/enc-1/pause",
      "https://api.example.test/api/encounters/enc-1/stop",
    ]);
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "POST",
      "POST",
    ]);
    expect(
      fetch.mock.calls.every(([, init]) => init?.credentials === "include"),
    ).toBe(true);
  });

  it("calls real handlers and validation in memory without global fetch", async () => {
    const backend = await createTestBackend();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network must not be used"));
    try {
      const api = createApiClient({
        baseUrl: "http://shadow.test",
        fetch: backend.createBrowserTransport(),
      });
      // Use a real session; the injected transport keeps cookies in memory.
      const credentials = {
        email: "owner@example.test",
        name: "Owner",
        password: "test-password-for-auth-only",
      };
      await backend.app.services.auth.createAccount(credentials);
      const fetch = backend.createBrowserTransport();
      await fetch("http://shadow.test/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const authenticatedApi = createApiClient({
        baseUrl: "http://shadow.test",
        fetch,
      });
      expect((await api.me.$get()).status).toBe(401);
      const start = vi
        .spyOn(backend.app.logic.encounterLifecycle, "start")
        .mockResolvedValue(undefined);
      const success = await authenticatedApi.encounters[
        ":encounterId"
      ].start.$post({
        param: { encounterId: "enc-1" },
      });
      expect(success.status).toBe(204);
      expect(start).toHaveBeenCalledWith({ encounterId: "enc-1" });
      const reservedId = "enc/part?tag=#%";
      const reserved = await authenticatedApi.encounters[
        ":encounterId"
      ].start.$post({
        param: { encounterId: encodeApiParam(reservedId) },
      });
      expect(reserved.status).toBe(204);
      expect(start).toHaveBeenLastCalledWith({ encounterId: reservedId });
      const invalid = await authenticatedApi.encounters[
        ":encounterId"
      ].start.$post({
        param: { encounterId: " " },
      });
      await expect(requireApiSuccess(invalid)).rejects.toMatchObject({
        status: 400,
        code: "INVALID_REQUEST",
      } satisfies Partial<ApiRequestError>);
      expect(start).toHaveBeenCalledTimes(2);
      const stub = await authenticatedApi.encounters[":encounterId"].stop.$post(
        {
          param: { encounterId: "enc-1" },
        },
      );
      await expect(requireApiSuccess(stub)).rejects.toMatchObject({
        name: "ApiRequestError",
        status: 501,
        code: "NOT_IMPLEMENTED",
      } satisfies Partial<ApiRequestError>);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
      await backend.close();
    }
  });

  it("preserves non-JSON HTTP failures", async () => {
    await expect(
      requireApiSuccess(new Response("Unavailable", { status: 503 })),
    ).rejects.toMatchObject({
      status: 503,
      message: "Request failed with status 503",
    });
  });
});
