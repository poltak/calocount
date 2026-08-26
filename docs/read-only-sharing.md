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
| `/` | Public because no Access destination matches it | Read-only dashboard UI |
| `/owner` and `/owner/*` | Existing private Cloudflare Access application, existing owner Allow policy and audience, plus server-side signed JWT check | Owner read-write dashboard |
| `/api/public/summary` | Separate exact Cloudflare Access application with Bypass Everyone | Explicit read-only dashboard projection |
| `/api/*` in general | Private Cloudflare Access and server-side owner authentication | Owner data and all write operations |
| `/_next/static/*`, manifest, service worker, and required icons | Public because no Access destination matches them | JavaScript, CSS, and install metadata only |
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

## Production Access configuration

The following layout was live-verified on 2026-08-26:

1. The existing private Access application protects exact `/owner`, `/owner/*`,
   and `/api/*` destinations with the existing owner Allow policy and the same
   owner JWT audience.
2. A separate Access application protects the exact `/api/public/summary`
   destination with Bypass Everyone. It is more specific than `/api/*`.
3. `/` and the static/PWA assets are public because no Access destination
   matches them. Do not add root or static bypass exceptions, a broad `/*`
   bypass, a broad `/_next/*` bypass, or an `/api/*` bypass.
4. Anonymous and authenticated live checks passed: the public root and summary
   load without login; `/owner` and private APIs require the owner Access
   session; static/PWA assets are reachable anonymously; and removed share
   routes return `404` when reached.

Keep `CALOCOUNT_ALLOW_LOCAL=false` in production. Review the public projection,
route conditions, and owner JWT checks before each deployment. Apply only the
existing additive D1 migrations; do not remove or modify the compatibility
`share_links` migration or schema declaration.

## Future route review rule

Treat routes as public by default unless a private Cloudflare Access destination
covers them. Before every deployment, explicitly review:

- every new page outside `/owner`;
- every new public API exception; and
- every new server route outside `/api`.

For each change, test both anonymous and owner behavior from the deployed
application and review the live Access path list. This rule is mandatory for
future agents; the current layout was verified on 2026-08-26.

## Rollback

If the public page, projection, or authentication boundary is wrong, restore the
broad Worker destination on the existing private Access application and remove
or disable the exact `/api/public/summary` Bypass Everyone application. Verify
that anonymous requests receive Access and that the authenticated owner route
still works. If the Worker is wrong, redeploy the last known-good version. Keep
the existing D1 migration history intact.
