# Public read-only dashboard

Calocount has two dashboard entry points:

- `/` is public and read-only. It loads the configured owner's limited
  dashboard projection.
- `/owner` is private and read-write. It loads the normal owner dashboard and
  may call the private data APIs.

Meals are entered in the owner dashboard or through the private ChatGPT `/mcp`
app. The deprecated Custom GPT Action still uses `POST /api/add-meal` for existing
clients. This document covers the public and owner route boundary.

This document keeps its existing filename for repository continuity. The
application no longer creates or serves token-based links. The existing D1
`share_links` migration and schema declaration remain unused for non-destructive
compatibility; do not remove or alter them without a separate database decision.

## Data and route boundary

| Path | Access rule | Purpose |
| --- | --- | --- |
| `/` | Public because no Access destination matches it | Read-only dashboard UI |
| `/llms.txt` | Public because no Access destination matches it | Markdown discovery document for agents; links to the canonical public JSON projection |
| `/owner` and `/owner/*` | Existing private Cloudflare Access application, existing owner Allow policy and audience, plus server-side signed JWT check | Owner read-write dashboard |
| `/api/public/summary` | Separate exact Cloudflare Access application with Bypass Everyone | Explicit read-only dashboard projection, and the daily view for agents at `?view=daily` |
| `/meal-photos/*` | Public because no Access destination matches it, with server-side projection checks | Images for completed meals in the current public seven-day projection |
| `/api/*` in general | Private Cloudflare Access and server-side owner authentication | Owner data and API write operations, including the legacy Action route |
| `/mcp` | Exact private Cloudflare Access application and server-side owner authentication | ChatGPT meal logging and nutrition reads |
| `/_next/static/*`, manifest, service worker, and required icons | Public because no Access destination matches them | JavaScript, CSS, and install metadata only |
| `/api/photos/*`, exports, settings, and other owner APIs | Private | Sensitive data and mutations |

The public summary endpoint resolves the stable configured owner key. It fails
closed when that key is absent and returns `Cache-Control: no-store`. The
projection contains only the fields required by the dashboard:

- date, the owner's saved timezone, and calorie/protein targets, including the
  selected protein-goal mode and weight-derived protein target when configured;
- today totals;
- seven-day totals, averages, and trend points;
- recent completed meal totals, item nutrition, and whether a public photo is available; and
- recent weights.

The public summary counts days in the owner's saved timezone, and the public
dashboard shows days and meal times in that timezone for every viewer. The
timezone is UTC until the owner sets one in settings.

It does not contain owner keys, captions, notes, assumptions, confidence,
photo storage keys or MIME metadata, AI/provider data, private settings,
exports, or API credentials.
`app/api/_lib/public-summary-projection.ts` implements the projection. Keep the
field list explicit when changing the public response.

### Daily view for agents

`/api/public/summary?view=daily` returns a second, much smaller projection on
the same path. The dashboard projection carries 30 days of food items and is
several hundred kilobytes. The daily view carries one row for each day and no
food items:

- the date, the owner's saved timezone, and the units of each amount;
- `firstEntryDate` and `firstWeightDate`, the days tracking began;
- `fromDate` and `toDate`, the days the rows cover;
- the current calorie and protein targets; and
- for each day: calories, protein, carbohydrate, fat, the entry count, and the
  weight recorded that day or `null`.

The rows start on the first day with an entry or a weight and keep at most the
latest 366 days. This makes daily totals and weights older than the dashboard's
30 days public. The owner chose this on 2026-10-02. An unknown `view` value
returns `400`.

The view is a query on the existing path because the Access bypass covers only
the exact `/api/public/summary` path. A new path under `/api/public/` would be
private until it had its own bypass application.

The anonymous `/meal-photos/<mealId>` route intentionally makes the image for a
projected completed meal public to site viewers. It resolves the configured
owner, serves only completed meals from the last seven days in the owner's saved
timezone, accepts only JPEG,
PNG, and WebP objects, and streams the private R2 object without revealing its
storage key. ETags allow efficient browser reuse, but every request must
revalidate the projection so removed or expired access is not cached. Pending,
old, removed, malformed, and unprojected meals return `404`. The authenticated
`/api/photos/*` owner route remains private.

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
3. `/`, `/meal-photos/*`, `/llms.txt`, and the static/PWA assets are public
   because no Access destination matches them. The photo handler enforces the
   public projection. The static `/llms.txt` asset needs no Access bypass.
   Do not add root or static bypass exceptions, a broad `/*` bypass, a broad
   `/_next/*` bypass, or an `/api/*` bypass.
4. Anonymous and authenticated live checks must confirm that the public root,
   summary, and projected meal photos load without login; `/owner`,
   `/api/photos/*`, and other private APIs require the owner Access session;
   and static/PWA assets are reachable anonymously.

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
