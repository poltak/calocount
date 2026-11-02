# Route classes

Each route under `/api` has one of three classes. This recipe adds no code to
the template. A project follows it when it needs its first route without a
session.

| Class      | Who reaches it                 | Refusal           | Examples                       |
| ---------- | ------------------------------ | ----------------- | ------------------------------ |
| Session    | A signed-in user               | `UNAUTHENTICATED` | Each route of a normal feature |
| Public     | Any caller                     | The route decides | A webhook, a public page       |
| Capability | A caller with a token or a key | `NOT_FOUND`       | A share link, an API key       |

A route is in the session class by default. Hono runs middleware of a sub-app
that is mounted at `/` for each route that comes after it, so the order of the
`.route()` lines in `createApiHttpApp` is the access rule. The test in
`backend-http.test.ts` sends a request with no session to each route. It fails
when a route answers and has no line in `PUBLIC_ROUTES`, and when a line has no
such route.

## Add a public route

1. Mount the route before `createBusinessHttpApp` in `createApiHttpApp`.
2. Add the method and the path to `PUBLIC_ROUTES`.
3. Check the sender in the handler or its Logic. A webhook checks its
   signature before it reads the body as JSON.
4. Add a rate limit if a caller can make the route do slow or paid work.

## Add a capability route

Keep these rules, also when the token is a short-lived link:

- The token travels in the `Authorization` header, never in a query string,
  because request logs and proxies store a query string. A share link carries
  it after the `#`, and the page moves it to the header.
- The token has at least 128 random bits. The database holds only its hash.
- A bad, ended, or revoked token gives `NOT_FOUND`. It must not give 401. The
  API client ends the session on `UNAUTHENTICATED`, so a bad share link would
  sign out a user who has a session of their own.
- With this header present, the route does not read the cookies. A token never
  falls through to a session.
- Each request reads the token's record, so a revoke works on the next request.
- A failed read of that record gives `UNAVAILABLE`. See
  [Access decisions](../code-architecture.md#access-decisions).
- Each response has `Cache-Control: no-store`.

A capability route is outside the session gate, so it needs a line in
`PUBLIC_ROUTES`. Give it a gate of its own, as a sub-app with its own
`.use("*", …)`, or use the next section.

## One route for a session and a token

When a user and a token holder use the same path, one gate reads both and
stores an actor. Logic takes the actor, so one access rule covers both:

```ts
type Actor =
  | { kind: "user"; user: AuthUser }
  | { kind: "capability"; scope: string; role: "viewer" | "editor" };
```

Do not add `Actor` to a route that only a session reaches.

A project with many such routes can give each route a class as its first
middleware, for example `sessionRoute({ maxBodyBytes })`. The middleware checks
access, then applies the body limit, so a caller with no access costs no body
read. The test then lists each route with its class.

## A public page in the frontend

`AppRoutes` wraps each route in `AuthProvider`, and `AuthLogic` sends a session
request when it starts. To open a public page with no session request, move
`AuthProvider` under a layout route that wraps `/login`, `/sign-up`, and
`SessionGate`, and put the public page outside it. `SessionGate` needs no
change.
