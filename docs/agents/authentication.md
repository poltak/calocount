# Authentication

- Better Auth 1.7.6 runs inside the backend, behind the `AuthService` interface at `backend/src/features/auth/services/types.ts`. `LiveAuthService` implements it with Better Auth in both the live and test roots.
- Live configuration requires `BETTER_AUTH_SECRET` (at least 32 characters) and `BETTER_AUTH_URL` (the server's HTTP(S) origin). `SHADOW_TRUSTED_ORIGINS` is an optional comma-separated list of frontend origins.
- Compose one Service per App. It resolves each request's session from headers; it never stores a current user. SDK construction stays lazy.
- Better Auth owns its user, account, session, and verification tables through its native Kysely adapter. Application queries still belong in Storage. Its schema migration is an explicit operation, not part of normal server startup.
- The public SDK instance disables email/password registration. A separate private SDK instance supports trusted local account provisioning; its handler is never mounted.
- Integration tests use the real SDK against isolated PGlite databases, including migrations, cookie sessions, bad credentials, and sign-out.
- The Hono app mounts `/api/auth/*` outside the session gate. All business routes share the gate, including `/api/me`, which returns only the verified user profile. Missing or invalid sessions return 401.
- Verified identity lives in typed Hono request context. Feature Logic can receive caller identity as operation context when its contracts need it; never set a current user on shared App or Logic instances.
- CORS permits only configured trusted origins with credentials. Mutation requests with an untrusted Origin are rejected before feature Logic runs. Auth endpoints retain Better Auth's own origin checks.
- `backend/testing` migrates isolated auth tables and provides one cookie-aware transport per simulated browser. The raw transport is stateless. The cookie helper is test-only and limited to one configured origin.
- Single-user admission belongs in `AuthAccessLogic`. A valid session for any email other than the configured `SHADOW_OWNER_EMAIL` returns 403. User IDs and sessions remain normal Better Auth records; changing to a multi-user policy later does not require a new auth system.
- `OwnerSetupLogic` reads the existing account count through AuthStorage and creates only the configured owner through the Service. It refuses to replace existing credentials. The SDK's unique email constraint prevents concurrent attempts from creating multiple owners.
- The frontend exposes Better Auth's native client as `app.auth`, alongside the Hono `app.api` client. Both include cookies and use the same transport. AuthLogic owns session and sign-in state; components render that state and call its methods. UI route guards are convenience checks; server middleware remains the access boundary.
- Sign-in checks the protected `/api/me` profile before showing the app. Sign-out clears the SDK session. Business API 401 responses and window focus refreshes update UI access. AuthLogic listens for focus through the `windowFocus` Service. There is no signup page, default password, token in local storage, or password recovery flow yet.
- Full application tests exercise the sign-in form, rejected passwords, owner admission, expiry, and sign-out with real handlers and auth tables in one process. Tests inject a cookie-aware transport into both clients; no network fetch is required.

## Local setup

1. Copy the root `.env.example` to `.env`. Set a working PostgreSQL URL and `SHADOW_OWNER_EMAIL`.
2. Generate a secret with `node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("base64"))'` and put it in `BETTER_AUTH_SECRET`. Keep `.env` private and untracked.
3. Run `pnpm --filter backend auth:setup-owner` in a terminal. It migrates auth tables and prompts for the owner's name and password. Password input is hidden and is never accepted as a command argument.
4. Run `pnpm run build`, then `pnpm --filter backend start`. Backend commands read the root `.env`; explicit process environment values take precedence.

- `pnpm --filter backend auth:migrate` applies auth schema updates without creating an account. Review dependency upgrades before applying migrations to a populated database.
- Server startup does not migrate or create users. No default live password or auth secret is supplied. Email delivery and password recovery are not configured yet.
