# Public read-only dashboard

Calocount has two dashboard entry points:

- `/` is public and read-only. It loads the configured owner's deliberately
  limited dashboard projection.
- `/owner` is private and read-write. It loads the normal owner dashboard and
  may call the private data APIs.

This document keeps its existing filename for repository continuity. The
application no longer creates or serves token-based links. The existing D1
`share_links` migration and schema declaration remain unused for non-destructive
compatibility; do not remove or alter them without a separate database decision.

## Data and route boundary

| Path | Access rule | Purpose |
| --- | --- | --- |
| `/` | Public after staged Access verification | Read-only dashboard UI |
| `/owner` and `/owner/*` | Private Cloudflare Access and server-side signed JWT check | Owner read-write dashboard |
| `/api/public/summary` | Public only as a narrow exception | Explicit read-only dashboard projection |
| `/api/*` in general | Private Cloudflare Access and server-side owner authentication | Owner data and all write operations |
| `/_next/static/*`, manifest, service worker, and required icons | Public static assets required by the public root and PWA | JavaScript, CSS, and install metadata only |
| photos, exports, AI routes, settings, and other owner APIs | Private | Sensitive data and mutations |

The public summary endpoint resolves the stable configured owner key. It fails
closed when that key is absent and returns `Cache-Control: no-store`. The
projection contains only the fields required by the dashboard:

- date and calorie/protein targets;
- today totals;
- seven-day totals, averages, and trend points;
- recent completed meal totals and item nutrition; and
- recent weights.

It does not contain owner keys, captions, notes, assumptions, confidence,
photos or storage keys, AI/provider data, Telegram data, private settings,
exports, or API credentials. The projection is implemented in
`app/api/_lib/public-summary-projection.ts`. Keep the field list explicit when
changing the public response.

The public dashboard must not call owner APIs. Every write API route must call
`requireApiIdentity(request)` before it reads or changes owner data. A public
request must never be able to add, edit, delete, correct, weigh, configure,
export, or upload data.

## PWA owner start

The PWA manifest starts at `/owner`. Its `id` and `scope` remain `/`, so the
installed app keeps the Calocount site identity while opening the private owner
dashboard. The owner Access application must cover the exact `/owner` path and
its descendants. The manifest, service worker, icons, and generated static
assets must be available to the browser so installation can complete.

## Production rollout

Use a staged Access rollout. Keep the current whole-site protection enabled
while deploying and testing the route split.

1. Review the public projection, route conditions, and owner JWT checks.
2. Apply only the existing additive D1 migrations. Do not remove or modify the
   compatibility `share_links` migration or schema declaration.
3. Configure the owner Access variables and allowlist. Keep
   `CALOCOUNT_ALLOW_LOCAL=false` in production.
4. Build and deploy the dashboard Worker.
5. In an authenticated browser, verify `/owner`, the dashboard summary, photos,
   and representative owner writes.
6. In Cloudflare Access, create or verify private applications for the exact
   `/owner` path and descendants and for `/api/*`.
7. Only after those private paths pass live tests, add the narrow public
   exceptions for `/`, `/api/public/summary`, and the exact non-data static/PWA
   assets used by the deployed public page. Do not add a broad `/*`, `/_next/*`,
   or `/api/*` bypass.
8. In a separate anonymous browser, verify the public root and summary, then
   retry private paths and write methods. Record the final Access path list and
   deployed commit.

Cloudflare Access path precedence and policy behavior must be checked against
the live dashboard. A source document does not prove that the live Access
configuration matches the intended boundary.

## Future route review rule

Treat routes as public by default unless a private Cloudflare Access destination
covers them. Before every deployment, explicitly review:

- every new page outside `/owner`;
- every new public API exception; and
- every new server route outside `/api`.

For each change, test both anonymous and owner behavior from the deployed
application. This rule is mandatory for future agents and does not confirm the
current live Access configuration.

## Rollback

If the public page, projection, or authentication boundary is wrong, remove or
disable the public root and public summary exceptions first. Restore private
coverage for `/owner` and `/api/*`, then verify both anonymous and authenticated
requests. If the Worker is wrong, redeploy the last known-good version. Keep
the existing D1 migration history intact.
