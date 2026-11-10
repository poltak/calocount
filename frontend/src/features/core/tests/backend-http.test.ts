import { routeBodyLimit } from "backend/testing";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { inspectRoutes } from "hono/dev";
import { createFullApplication } from "./full-application.js";

/**
 * Each route that a caller with no session can reach. A new route outside the
 * session gate needs a line here, so that no route goes public by omission.
 * See docs/agents/recipes/route-classes.md.
 */
const PUBLIC_ROUTES = [
  "GET /health",
  "GET /health/ready",
  "GET /llms.txt",
  "GET /api/auth/status",
  "POST /api/auth/register/options",
  "POST /api/auth/register/verify",
  "POST /api/auth/login/options",
  "POST /api/auth/login/verify",
  "POST /api/auth/logout",
  "GET /api/public/summary",
  // The routes for agents. `/mcp` and `/oauth/token` answer 401 without a
  // token, so they are not in this list. The rest are discovery documents, the
  // client registration, the preflight requests, and the consent page, which
  // sends a visitor without a session to the sign-in page.
  "GET /.well-known/oauth-authorization-server",
  "OPTIONS /.well-known/oauth-authorization-server",
  "GET /.well-known/oauth-protected-resource",
  "OPTIONS /.well-known/oauth-protected-resource",
  "GET /.well-known/oauth-protected-resource/mcp",
  "OPTIONS /.well-known/oauth-protected-resource/mcp",
  "POST /oauth/register",
  "OPTIONS /oauth/register",
  "OPTIONS /oauth/token",
  "GET /oauth/authorize",
  "POST /oauth/authorize",
];

const ORIGIN = "http://app.test";
const KILOBYTE = 1024;
/** More than the default limit of 100 kB. */
const LARGE_BODY = "x".repeat(200 * KILOBYTE);

/** A body with no `Content-Length`, which the server must count as it reads. */
function chunkedBody(text: string) {
  const bytes = new TextEncoder().encode(text);
  let sentBytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = bytes.subarray(sentBytes, sentBytes + 16 * KILOBYTE);
      sentBytes += chunk.length;
      if (chunk.length > 0) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
  });
  return { init: { body: stream, duplex: "half" }, sentBytes: () => sentBytes };
}

const LARGE_REQUESTS = [
  { form: "with a Content-Length", init: () => ({ body: LARGE_BODY }) },
  { form: "chunked", init: () => chunkedBody(LARGE_BODY).init },
];

// No UI Logic reaches this behavior of the backend's HTTP app, so these tests
// send requests through the same transport that the frontend uses.
describe("backend HTTP app", () => {
  it("should refuse a caller with no session on each route that is not public", async () => {
    const { httpApp, transport } = await createFullApplication({
      authenticated: false,
    });
    const routes = inspectRoutes(httpApp).filter(
      ({ isMiddleware }) => !isMiddleware,
    );

    const reached: string[] = [];
    for (const { method, path } of routes) {
      const response = await transport.fetch(
        `${ORIGIN}${path.replaceAll(/:\w+/g, "value")}`,
        { method: method === "ALL" ? "POST" : method },
      );
      if (response.status !== 401) {
        reached.push(`${method} ${path}`);
      }
    }

    expect(reached).toEqual(PUBLIC_ROUTES);
  });

  it("should answer the health routes without a session", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: false,
    });

    const live = await transport.fetch(`${ORIGIN}/health`);
    expect(live.status).toEqual(200);
    expect(await live.json()).toEqual({ status: "ok" });

    const ready = await transport.fetch(`${ORIGIN}/health/ready`);
    expect(ready.status).toEqual(200);
    expect(await ready.json()).toEqual({ status: "ready" });

    // Probes arrive every few seconds, so they stay out of the request log.
    expect(backend.services.logger.entries).toEqual([]);
  });

  it("should report that it is not ready when the database does not respond", async () => {
    const { backend, transport } = await createFullApplication();
    await backend.db.destroy();
    const logged = backend.services.logger.entries.length;

    const ready = await transport.fetch(`${ORIGIN}/health/ready`);
    expect(ready.status).toEqual(503);
    expect(await ready.json()).toEqual({
      error: {
        code: "UNAVAILABLE",
        message: "The database does not respond",
      },
    });
    expect(backend.services.logger.entries.slice(logged)).toMatchObject([
      { level: "warn", message: "Readiness check failed" },
    ]);

    // The process itself still answers.
    const live = await transport.fetch(`${ORIGIN}/health`);
    expect(live.status).toEqual(200);
  });

  it("should set the security headers on every response", async () => {
    const { transport } = await createFullApplication({ authenticated: false });

    const response = await transport.fetch(`${ORIGIN}/api/auth/passkeys`);
    expect(response.status).toEqual(401);
    expect(response.headers.get("x-content-type-options")).toEqual("nosniff");
    expect(response.headers.get("x-frame-options")).toEqual("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toEqual("no-referrer");
    expect(response.headers.get("strict-transport-security")).toEqual(
      "max-age=15552000; includeSubDomains",
    );
  });

  it("should give each request an ID and log the request with it", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: false,
    });

    const generated = await transport.fetch(
      `${ORIGIN}/api/auth/passkeys?secret=1`,
    );
    const generatedId = generated.headers.get("x-request-id");
    expect(generatedId).toMatch(/^[\w-]{36}$/);

    const supplied = await transport.fetch(`${ORIGIN}/api/auth/passkeys`, {
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
          path: "/api/auth/passkeys",
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

  it("should answer a path with no route with a code of its own", async () => {
    const { transport } = await createFullApplication();

    const response = await transport.fetch(`${ORIGIN}/api/no-such-route`);

    expect(response.status).toEqual(404);
    expect(await response.json()).toEqual({
      error: { code: "ROUTE_NOT_FOUND", message: "Route not found" },
    });
  });

  it("should refuse a request that changes data from another origin", async () => {
    const { backend, transport } = await createFullApplication();
    const logOut = (origin: string) =>
      transport.fetch(`${ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: { origin },
      });

    const refused = await logOut("http://other.test");

    expect(refused.status).toEqual(403);
    expect(await refused.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "The request must come from this site.",
      },
    });
    expect(
      await backend.db.selectFrom("authSessions").selectAll().execute(),
    ).toHaveLength(1);

    expect((await logOut(ORIGIN)).status).toEqual(200);
    expect(
      await backend.db.selectFrom("authSessions").selectAll().execute(),
    ).toEqual([]);
  });

  it("should refuse a request body that is larger than the limit", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: false,
    });

    const response = await transport.fetch(
      `${ORIGIN}/api/auth/register/options`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupCode: "x".repeat(200 * 1024) }),
      },
    );

    expect(response.status).toEqual(413);
    expect(await response.json()).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request is too large" },
    });
    expect(
      await backend.db.selectFrom("authAttempts").selectAll().execute(),
    ).toEqual([]);
  });

  it.each(LARGE_REQUESTS)(
    "should apply a route's own limit in place of the default to a body $form",
    async ({ init }) => {
      const { httpApp, transport } = await createFullApplication();
      httpApp
        .post("/api/uploads", routeBodyLimit(300 * KILOBYTE), async (context) =>
          context.json({ receivedBytes: (await context.req.text()).length }),
        )
        .post("/api/avatars", routeBodyLimit(150 * KILOBYTE), (context) =>
          context.text("stored"),
        );
      const send = (path: string) =>
        transport.fetch(`${ORIGIN}${path}`, { method: "POST", ...init() });

      const allowed = await send("/api/uploads");
      expect(allowed.status).toEqual(200);
      expect(await allowed.json()).toEqual({
        receivedBytes: LARGE_BODY.length,
      });

      const refused = await send("/api/avatars");
      expect(refused.status).toEqual(413);
      expect(await refused.json()).toEqual({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "The request is too large",
        },
      });

      // The higher limit of one route does not reach any other route.
      expect((await send("/api/other")).status).toEqual(413);
    },
  );

  it("should apply a route's own limit that is lower than the default", async () => {
    const { httpApp, transport } = await createFullApplication();
    httpApp.post("/api/tags", routeBodyLimit(KILOBYTE), (context) =>
      context.text("stored"),
    );

    const response = await transport.fetch(`${ORIGIN}/api/tags`, {
      method: "POST",
      body: "x".repeat(2 * KILOBYTE),
    });

    expect(response.status).toEqual(413);
  });

  it("should find a route's own limit in a sub-app with its own error handler", async () => {
    const { httpApp, transport } = await createFullApplication();
    httpApp.route(
      "/api/uploads",
      new Hono()
        .onError((_error, context) => context.text("failed", 500))
        .post("/", routeBodyLimit(300 * KILOBYTE), (context) =>
          context.text("stored"),
        ),
    );

    const response = await transport.fetch(`${ORIGIN}/api/uploads`, {
      method: "POST",
      body: LARGE_BODY,
    });

    expect(response.status).toEqual(200);
  });

  it("should not read a large body before the session gate", async () => {
    const { httpApp, transport } = await createFullApplication({
      authenticated: false,
    });
    httpApp.post("/api/uploads", routeBodyLimit(300 * KILOBYTE), (context) =>
      context.text("stored"),
    );
    const body = chunkedBody(LARGE_BODY);

    const response = await transport.fetch(`${ORIGIN}/api/uploads`, {
      method: "POST",
      ...body.init,
    });

    expect(response.status).toEqual(401);
    expect(body.sentBytes()).toBeLessThan(LARGE_BODY.length);
  });

  it("should hide an unexpected error from the caller and log it with the request ID", async () => {
    const { backend, transport } = await createFullApplication({
      authenticated: false,
    });
    await backend.db.destroy();

    const response = await transport.fetch(`${ORIGIN}/api/auth/login/options`, {
      method: "POST",
    });
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
        method: "POST",
        path: "/api/auth/login/options",
      },
    });
    expect(failure?.fields?.error).toBeInstanceOf(Error);
  });

  it("should answer UNAVAILABLE, and refuse nobody, when the session gate cannot read the session", async () => {
    const { backend, transport } = await createFullApplication();
    await backend.db.destroy();

    const response = await transport.fetch(`${ORIGIN}/api/auth/passkeys`);

    expect(response.status).toEqual(503);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAVAILABLE",
        message: "The service is not available. Try again later.",
      },
    });
    const failure = backend.services.logger.entries.find(
      (entry) => entry.message === "Session check failed",
    );
    expect(failure).toMatchObject({
      level: "error",
      fields: { requestId: response.headers.get("x-request-id") },
    });
    expect(failure?.fields?.error).toBeInstanceOf(Error);
  });

  it("should send the session cookie again when a session renews, and not before", async () => {
    const { backend, transport } = await createFullApplication();
    const listPasskeys = () => transport.fetch(`${ORIGIN}/api/auth/passkeys`);

    const sameDay = await listPasskeys();
    backend.services.clock.advance(2 * 24 * 60 * 60 * 1000);
    const renewed = await listPasskeys();

    expect(sameDay.headers.get("set-cookie")).toBeNull();
    expect(renewed.headers.get("set-cookie")).toMatch(
      /^calocount_session=[A-Za-z0-9_-]{20,200}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=34560000$/,
    );
  });
});
