# Authentication

- Better Auth 1.7.6 runs inside the backend, behind the `AuthService` interface at `backend/src/features/auth/services/types.ts`.
- Live configuration requires `BETTER_AUTH_SECRET` (at least 32 characters) and `BETTER_AUTH_URL` (the server's HTTP(S) origin). `SHADOW_TRUSTED_ORIGINS` is an optional comma-separated list of frontend origins.
- Compose one Service per App. It resolves each request's session from headers; it never stores a current user. SDK construction stays lazy.
- Better Auth owns its user, account, session, and verification tables through its native Kysely adapter. Application queries still belong in Storage. Its schema migration is an explicit operation, not part of normal server startup.
- The public SDK instance disables email/password registration. A separate private SDK instance supports trusted local account provisioning; its handler is never mounted.
- Integration tests use the real SDK against isolated PGlite databases, including migrations, cookie sessions, bad credentials, and sign-out.
- The Hono app mounts `/api/auth/*` outside the session gate. All business routes share the gate, including `/api/me`, which returns only the verified user profile. Missing or invalid sessions return 401.
- Verified identity lives in typed Hono request context. Feature Logic can receive caller identity as operation context when its contracts need it; never set a current user on shared App or Logic instances.
- CORS permits only configured trusted origins with credentials. Mutation requests with an untrusted Origin are rejected before feature Logic runs. Auth endpoints retain Better Auth's own origin checks.
- `backend/testing` migrates isolated auth tables and provides one cookie-aware transport per simulated browser. The raw transport is stateless. The cookie helper is test-only and limited to one configured origin.
