# Authentication

- Better Auth 1.7.6 runs inside the backend, behind the `AuthService` interface at `backend/src/features/auth/services/types.ts`.
- Live configuration requires `BETTER_AUTH_SECRET` (at least 32 characters) and `BETTER_AUTH_URL` (the server's HTTP(S) origin). `SHADOW_TRUSTED_ORIGINS` is an optional comma-separated list of frontend origins.
- Compose one Service per App. It resolves each request's session from headers; it never stores a current user. SDK construction stays lazy.
- Better Auth owns its user, account, session, and verification tables through its native Kysely adapter. Application queries still belong in Storage. Its schema migration is an explicit operation, not part of normal server startup.
- The public SDK instance disables email/password registration. A separate private SDK instance supports trusted local account provisioning; its handler is never mounted.
- Integration tests use the real SDK against isolated PGlite databases, including migrations, cookie sessions, bad credentials, and sign-out.
