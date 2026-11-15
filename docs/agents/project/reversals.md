# Reversals

- **PostgreSQL** (`docs/agents/decisions.md`, "One database engine for each project"): Calocount runs on Cloudflare D1 through Kysely, with an atomic batch in place of `transaction()`. Reason: the production data is in D1, and the Deploy to Cloudflare button makes an instance with no outside database. Approved by the owner, 2026-11-09.
- **Better Auth with email and password** (`docs/agents/decisions.md`, the auth framework): Calocount signs in with passkeys only, through @simplewebauthn, with a setup code for the first passkey and for recovery. Reason: the old app's owner sign-in is passkeys, and the existing passkeys and sessions must keep working. Approved by the owner, 2026-11-09.
- **A long-lived Node process as the host** (`docs/agents/hosting.md`): Calocount's backend runs on Cloudflare Workers. Reason: the old app and its D1, R2 and cron run there. Approved by the owner, 2026-11-09.
