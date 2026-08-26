# Read-only sharing

Calocount can create a public dashboard link for people who do not have a Cloudflare Access account. The normal owner app remains private. A public link gives read-only access to a small, explicit data projection. It does not give access to the private dashboard or to any write API.

## Security boundary

There are two separate access paths:

| Path | Access rule | Purpose |
| --- | --- | --- |
| `/` and the normal app | Cloudflare Access plus a server-side signed JWT check | Owner dashboard |
| `/api/*` in general | Private | Owner data and all write operations |
| `/api/share-links` and `/api/share-links/*` | Private | Create, list, and revoke links |
| `/share/<token>` | Public only after a narrow Access bypass is configured | Read-only dashboard |
| `/api/share/<token>/*` | Public only after a narrow Access bypass is configured | Read-only summary data |
| photos, exports, AI routes, and settings | Private | Sensitive data and mutations |

The owner API does not trust a user-supplied identity header. In production, the Worker verifies the Cloudflare Access JWT signature and claims, then checks the identity against the configured owner allowlist. A forged email or user ID header is not sufficient. Missing JWT configuration or a missing owner allowlist fails closed.

The public API returns `Cache-Control: no-store`. It must not be put behind a broad public API rule.

## Production configuration

Set the following values on the dashboard Worker. The recommended email allowlist is the SHA-256 binding. Keep plaintext email allowlists encrypted with `wrangler secret put`; do not commit plaintext email values to `wrangler.jsonc`, `.dev.vars.example`, or source control.

| Variable | Kind | Required production value |
| --- | --- | --- |
| `CALOCOUNT_ACCESS_TEAM_DOMAIN` | Worker variable | The Cloudflare Access team domain, without a URL path. |
| `CALOCOUNT_ACCESS_AUDIENCE` | Worker variable | The Access application audience (`aud`) for the protected Calocount app. |
| `CALOCOUNT_ALLOWED_EMAIL_SHA256` | Worker variable | Recommended email allowlist. The lower-case SHA-256 digest of the trimmed, lower-case Access email. |
| `CALOCOUNT_OWNER_EMAIL` | Encrypted Worker secret | Compatibility email allowlist. The owner email in plaintext, or use the hash or user ID binding above/below. |
| `CALOCOUNT_ALLOWED_EMAIL` | Encrypted Worker secret | Legacy compatibility email allowlist for older or local deployments. |
| `CALOCOUNT_ALLOWED_USER_ID` | Encrypted Worker secret | The owner Access user ID, or use the email secret above. |
| `CALOCOUNT_ALLOW_LOCAL` | Worker variable | `false` in production. `true` is for local development only. |

Configure at least one owner allowlist: `CALOCOUNT_ALLOWED_EMAIL_SHA256`, `CALOCOUNT_OWNER_EMAIL`, `CALOCOUNT_ALLOWED_EMAIL`, or `CALOCOUNT_ALLOWED_USER_ID`. For a new production deployment, prefer `CALOCOUNT_ALLOWED_EMAIL_SHA256`. To create its value, trim the Access email, convert it to lower case, and calculate its SHA-256 digest. Store exactly 64 lower-case hexadecimal characters. If several allowlists are configured, every configured check must match; a missing email, wrong digest, or malformed digest fails closed. The plaintext email names are kept for compatibility with older and local deployments. Keep `CALOCOUNT_OWNER_KEY` stable for the existing D1 data owner; changing it can make existing data appear to be missing.

The Access team domain and audience are not secrets, but they must match the Access app that protects the owner dashboard. The Worker validates the JWT against the Access public keys. The old pattern of trusting `Cf-Access-Authenticated-User-Email` or another identity header alone is not an acceptable production configuration.

## What a share link exposes

Share links are bearer credentials. Anyone who has the complete URL can read the projection until the link expires or the owner revokes it. Treat a link like a password: share it only with the intended people, do not put it in public issue text or analytics events, and do not log the URL.

The token is generated from secure random bytes. Only its hash is stored in D1. The raw token is returned once when the link is created, as the share URL. If it is lost, create a new link; it cannot be recovered from D1.

The public projection contains:

- the dashboard date;
- calorie and protein targets;
- today’s calorie, protein, carbohydrate, fat, and meal-count totals;
- seven-day calorie and macro totals, averages, meal counts, and daily trend points;
- recent weight values with their logical date and recorded time; and
- recent completed meal summaries and item nutrition: meal ID, time, meal type, totals, item name, quantity, unit, calories, protein, carbohydrates, and fat. Internal meal status is not exposed.

The projection does not contain:

- photos or photo storage keys;
- captions, notes, assumptions, confidence, follow-up questions, or other analysis text;
- AI model, provider, prompt, token, latency, cost, or upstream response data;
- Telegram user, chat, update, or webhook data; or
- private settings, API keys, profile data, exports, or any other owner-only fields.

The public dashboard has no add, edit, delete, correction, weight-entry, settings, export, photo, AI, or share-link-management controls. A public share page must not call the owner endpoints.

Links may have a future expiry time. The owner can revoke an active link from the private dashboard. Expired, revoked, malformed, or unknown tokens return the same generic not-found response.

## Safe rollout order

Keep the existing whole-app Cloudflare Access protection in place until the application and the public projection pass the tests below.

1. Create or use the feature branch. Review the migration, API projection, auth changes, and read-only UI.
2. Apply the additive D1 migration to the remote `calocount` database. Do this while the existing Access application still protects every app path.
3. Set the `CALOCOUNT_ALLOWED_EMAIL_SHA256` Worker variable to the owner email digest, or use one of the compatibility allowlists in a runtime that exposes encrypted Worker secrets to the app. Set the Access variables and `CALOCOUNT_ALLOW_LOCAL=false`.
4. Build and deploy the dashboard Worker.
5. Sign in as the owner and verify the normal dashboard, private APIs, photo delivery, and write flows. Verify that an anonymous request to `/share/<token>` and `/api/share/<token>/summary` is still protected before changing Access.
6. In Cloudflare Access, add narrow public Bypass applications or path rules for `/share/*` and `/api/share/*`. Keep the existing root application and its owner policy. More-specific public paths must not make `/`, `/api/*`, or `/api/share-links*` public.
7. Load the deployed share page in a separate anonymous browser. Inspect its network requests and add only the exact non-data static asset paths that the built page needs. Do not guess hashed filenames. Do not add a broad `/*`, `/_next/*`, or `/api/*` bypass. Do not make photos, manifests, exports, AI, or settings public unless a separate reviewed decision explicitly requires it.
8. Re-test both anonymous sharing and owner access. Record the final Access path list and the deployed commit.

Cloudflare Access `Bypass` disables Access enforcement and Access logging for the matched request. This is why the public paths must stay narrow and the Worker must enforce the share-token lookup, expiry, revocation, projection, and no-store response itself.

Before changing Access applications, policies, or paths in the Cloudflare dashboard, obtain the required action-time confirmation. A code deployment alone does not make the share URL public.

## Test checklist

Run the repository checks before deployment:

```bash
npm run check
npm run deploy:dry
```

Then test the deployed app in two separate browser sessions.

Owner session:

- Access login reaches `/` and the dashboard loads real data.
- `/api/dashboard/summary`, `/api/meals`, `/api/settings`, `/api/weights`, `/api/export`, and `/api/photos/...` remain available only to the owner.
- Create a link with a label and a future expiry. Confirm that the raw URL is shown once and that the owner can copy it.
- List active, expired, and revoked links. Revoke the test link and confirm that it is no longer readable.

Anonymous session:

- The complete share URL loads without an Access login.
- The summary request returns only the documented projection and uses `Cache-Control: no-store`.
- The page has no write controls and sends no owner write requests.
- `/`, `/api/dashboard/summary`, `/api/meals`, `/api/settings`, `/api/weights`, `/api/export`, `/api/photos/...`, `/api/share-links`, and `/api/share-links/<id>` remain private. Expect the Access challenge or another configured private response; do not treat a public success as acceptable.
- A malformed, unknown, expired, or revoked token returns the same generic not-found response and does not reveal owner data.
- Only the exact static assets recorded during the deployed share-page load are public. A guessed or unrelated asset path is not a reason to widen the bypass.
- Confirm the projection has weights, completed meal and macro totals, trend points, and targets, and has no meal status, photos, captions, notes, AI/provider fields, Telegram data, or private settings.

## Rollback

If the public page, projection, or auth check is wrong, remove or disable the narrow `/share/*`, `/api/share/*`, and static-asset Bypass rules first. The existing whole-app Access application then protects the site again. Do not disable the root Access application.

If the Worker deployment is wrong, redeploy the last known-good dashboard version while the root Access application remains enabled. Keep the additive D1 migration in place; do not remove migration history or reset the production database. Revoke any test links that were exposed during the test.

After rollback, confirm from an anonymous browser that `/share/<token>`, `/api/share/<token>/summary`, `/`, and the private APIs all have the intended protection. Record the failed path, Access rule, deployment version, and link status before attempting another rollout.
