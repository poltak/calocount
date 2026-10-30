# Calocount architecture

Calocount is a single-user meal tracker. The public root is read-only, and the owner dashboard is private and read-write. It uses Cloudflare free-tier services for the complete application backend.

## Runtime services

- One Worker serves the dashboard and JSON API and runs the hourly photo cleanup.
- Cloudflare D1 stores settings, goal changes, meals, meal items, revisions, and historical job and AI records.
- A private R2 bucket stores meal photos.
- The Worker's hourly cron trigger runs a bounded, resumable scan that removes only unlinked R2 photos older than the 24-hour grace period.
- A passkey and a session cookie protect the private owner route and private APIs. OAuth 2.1 protects the MCP endpoint. An instance can use Cloudflare Access instead. [sign-in.md](sign-in.md) describes both modes.
- Historical D1 tables for analysis jobs and AI runs remain. Current code does not write to them.

## Pages and browser code

The Worker has no web framework. `worker/index.ts` gives each request to the
route table in `worker/routes.ts`, and then to the page templates in
`worker/pages.ts`. A page is an HTML string. A dashboard page contains the
loading state, so the first paint needs no script.

The browser code in `app/ui/` uses the DOM directly and has no rendering
library. `app/ui/dom.ts` has the helpers. `h` builds an element. A slot is a
part of the page that is built again when its inputs change. The slot does not
replace the nodes in the page. It changes them to match the built nodes, and
it adds or removes only the nodes that differ. A node that stays keeps its
focus and its open state, and does not play its entry animation again.

Three rules decide which node in the page matches a built node:

- Children match by position. An optional child that is absent leaves an
  empty comment node in its place, so the children after it do not move.
- An element with a `key` matches only the element with the same key. Use a
  key for the items of a list that can get or lose items.
- A node marked with `keep` goes into the page as it is. Mark each node that
  code holds and changes by itself, such as an open form.

`app/ui/dashboard.ts` keeps the state in one object and asks for one render
after each change. It builds a form once and keeps the same node while the
form is open, so the form keeps the text that the owner typed.

The build gives the script and the stylesheet content-hashed names in
`/assets/`. `public/_headers` tells browsers to cache them for one year.

`tsconfig.client.json` checks `app/ui/` with the DOM types only. The Worker
types change some DOM types, so the two sets cannot be in one program.

## HTTP route boundary

The application has two dashboard entry points:

- `/` is the public read-only dashboard. It loads the explicit projection from
  `GET /api/public/summary` and projected images from `GET /meal-photos/<mealId>`.
- `/owner` is the private read-write dashboard. It uses the existing signed-JWT owner APIs.
- `/owner/partner` is the same dashboard for the partner profile. See [Profiles](#profiles).

`/api/public/summary` resolves the configured stable owner key, fails closed when
that key is absent, returns `Cache-Control: no-store`, and removes owner keys,
captions, notes, photo storage metadata, AI fields, and other private data. It
exposes only a `hasPhoto` flag for a safe projected image. With `?view=daily`
the same path returns a small daily view for agents: one row for each day since
tracking began, with totals and weight and no food items. `?view=month` and
`?view=day` serve the public calendar: the totals of each day of one month, and
the completed entries, weight and protein goal of one day of any age. The public
`/meal-photos/<mealId>` route rechecks the configured owner's current seven-day
projection, streams only completed JPEG, PNG, or WebP meals from private R2, and
requires cache revalidation. All `/api/*` routes other than the reviewed summary
exception are private owner routes. The public root does not expose owner write
controls or call private APIs.

The owner turns the public view on or off with the `publicViewEnabled` setting
in `PATCH /api/settings`. It is off for an owner with no saved settings. While
it is off, `/api/public/summary` returns `404` with the code `public_view_off`,
`/meal-photos/<mealId>` returns `404`, `/llms.txt` returns `404`, and `/`
redirects to `/owner`. The Worker checks the setting on each request, so Access
can keep the same layout for a public and a private instance. `/llms.txt` is in
`run_worker_first` for this check.

The PWA manifest starts at `/owner` while keeping `id` and `scope` at `/`. This
keeps installed launches in the private owner dashboard without changing the
site identity or service-worker scope.

The production Cloudflare Access layout was live-verified on 2026-08-26. The
existing private Access application protects exact `/owner`, `/owner/*`, and
`/api/*` destinations with the existing owner Allow policy and the same owner
JWT audience. A separate Access application protects the exact
`/api/public/summary` destination with Bypass Everyone. `/`,
`/meal-photos/*`, and static/PWA assets are public because no Access destination
matches them. Do not add root or static bypass exceptions, a broad `/*` or
`/assets/*` bypass, or an `/api/*` bypass.

Anonymous and authenticated live checks must confirm that the public root,
summary, and projected photos load without login; owner pages, `/api/photos/*`,
and private APIs require the owner Access session; static/PWA assets are
reachable anonymously; and removed share routes return `404` when reached.
Recheck the live Access path list after every Access change; this document
describes the intended state, not automatic enforcement.

### Sign-in routes

In passkey mode, no Access application exists. `/owner` shows the sign-in page
to a browser without a live session. `/api/auth/*` signs in and manages
passkeys and connected apps. `/.well-known/oauth-*` and `/oauth/*` are the
OAuth endpoints of the MCP endpoint. Every other `/api/*` route requires the
passkey session. [sign-in.md](sign-in.md) lists the routes and their rules.

### Future route and Access review rule

For the intended public-root/private-owner layout, treat routes as public by
default unless a private Cloudflare Access destination covers them. Before any
deployment, give explicit privacy and Access review to every new page outside
`/owner`, every new public API exception, and every new server route outside
`/api`. Verify the anonymous and owner behavior from deployed requests. This is
a repository rule for future changes; the current layout was verified on
2026-08-26.

## Profiles

One instance can keep two logs under one sign-in: the `owner` profile and the
`partner` profile. The owner turns the partner profile on with the
`partnerProfileEnabled` setting in `PATCH /api/settings`. It is off for an owner
with no saved settings.

- Sign-in data, such as passkeys, sessions and OAuth grants, uses the account
  key. In passkey mode that is `CALOCOUNT_OWNER_KEY`.
- The owner's data uses the account key too, so data from before profiles stays
  where it is. The partner's data uses `<account key>:partner`.
- A private API route reads the profile from the `profile` query value. With no
  value, it uses the owner. With `partner`, it returns `404` with the code
  `profile_off` while the setting is off. Any other value returns `400` with
  the code `invalid_profile`. `publicViewEnabled` and `partnerProfileEnabled`
  change only on the owner profile.
- The dashboard at `/owner/partner` adds `profile=partner` to each private API
  request and photo URL. The `/api/auth/*` routes do not use a profile.
- Each MCP tool takes an optional `profile` argument (`owner` or `partner`), and
  each result names the profile that it used.
- The public view, `/meal-photos/<mealId>`, `/llms.txt` and the deprecated
  `POST /api/add-meal` serve only the owner profile.

## Meal flow

1. The owner enters a meal in the private dashboard, or ChatGPT prepares structured data and calls `add_meals` through the private `/mcp` app. The deprecated Custom GPT Action can still call `POST /api/add-meal` with its bearer token for existing clients.
2. The shared meal-processing code validates the request and stores the meal, nutrient values, and optional photo in D1 and private R2. A UUID `request_id` makes external retries idempotent.
3. The public read-only projection updates from the stored meal data. The owner dashboard continues to provide edits, corrections, exports, and private photo access.
4. The hourly cron trigger runs a bounded scan and removes only unlinked R2 photos older than the 24-hour grace period.

## Goal history

Each settings save that changes the calorie goal or the protein goal that
applies adds a row to `goal_changes` in the same batch as the settings write.
A row holds the goals in effect from its `changed_at` time. The migration that
created the table gave each owner one starting row from the saved settings,
dated at the last settings save. Goals before an owner's first row are not
known. The public daily view, the MCP nutrition summary, and the JSON export
return these rows.

## ChatGPT integration boundary

Calocount does not call an AI provider or run an AI analysis worker. The external
ChatGPT MCP app prepares the meal estimate and sends structured values to
`/mcp`; the Worker checks an OAuth access token that the owner allowed with a
passkey session, or the owner's Cloudflare Access identity in Access mode. The deprecated
Custom GPT Action uses `POST /api/add-meal` and a Worker bearer-token secret for
existing clients. Both paths use the shared meal-processing code. For external
photos, the Worker accepts approved temporary OpenAI image references, downloads
a photo immediately, and does not store the temporary link.

## Privacy boundary

- R2 is private.
- Dashboard photo requests require the same server-side allowlist as other private API routes.
- The Worker downloads temporary ChatGPT photo references immediately and does not store the temporary links.
- Secrets are Worker secrets. They are not D1 records or configuration values.
- D1 keeps the public key of each passkey and the SHA-256 of each session cookie, OAuth code and OAuth token. A copy of the database gives no way to sign in.
- Normal logs do not contain captions, photo URLs, or full request payloads.
- The scheduled cleanup removes only unlinked photos older than the 24-hour grace period; linked meal photos stay with their structured nutrition data.

## Reliability boundary

D1 is the durable source of meal state. External add-meal request IDs make
retries idempotent. The hourly photo cleanup is a bounded, resumable scan for
unlinked photos older than the 24-hour grace period. Historical job tables
remain, but current code does not use them.

## Product boundary

Calocount tracks calories, protein, carbohydrates, fat, meal photos, corrections, and optional manual weight entries. It does not contain WHOOP, Apple Health, body-fat, sleep, recovery, or step integrations.
