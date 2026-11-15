# Calocount architecture

Calocount is a single-user meal tracker. The public root is read-only, and the owner dashboard is private and read-write. It uses Cloudflare free-tier services for the complete application backend.

## Runtime services

- One Worker serves the dashboard and JSON API and runs the hourly photo cleanup.
- Cloudflare D1 stores settings, goal changes, meals, meal items, revisions, and historical job and AI records.
- A private R2 bucket stores meal photos.
- The Worker's hourly cron trigger runs a bounded, resumable scan that removes only unlinked R2 photos older than the 24-hour grace period.
- A passkey and a session cookie protect the private owner route and private APIs. OAuth 2.1 protects the MCP endpoint. [sign-in.md](sign-in.md) describes the sign-in.
- Historical D1 tables for analysis jobs and AI runs remain. Current code does not write to them.

## Code layout

The backend is a Hono app in `backend/`. `backend/src/features/core/server/worker.ts`
is the Worker entry point. It builds the app once, gives each request to it,
and runs the hourly photo cleanup. `http-app.ts` in the same folder lists the
routes. Each feature folder in `backend/src/features/` has its own handlers,
logic and storage. D1 is reached through Kysely, and the migrations are in
`backend/migrations/`.

The frontend is a React and Vite app in `frontend/`. `frontend/src/main.tsx`
starts it, and `frontend/src/features/core/ui/routes.tsx` lists the pages.
`pnpm run build` writes it to `frontend/dist`, which the Worker serves as
static assets. Code that the backend and the frontend share is in `common/`.

[docs/agents/code-architecture.md](agents/code-architecture.md) has the rules
for this code.

## HTTP route boundary

The application has two dashboard entry points:

- `/` is the public read-only dashboard. It loads the explicit projection from
  `GET /api/public/summary` and projected images from `GET /meal-photos/<mealId>`.
- `/owner` is the private read-write dashboard. It uses the private owner APIs, which need a passkey session.
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
redirects to `/owner`. The Worker checks the setting on each request. `/llms.txt` is in
`run_worker_first` for this check.

The PWA manifest starts at `/owner` while keeping `id` and `scope` at `/`. This
keeps installed launches in the private owner dashboard without changing the
site identity or service-worker scope.

### Sign-in routes

`/owner` shows the sign-in page to a browser without a live session.
`/api/auth/*` signs in and manages passkeys and connected apps.
`/.well-known/oauth-*` and `/oauth/*` are the OAuth endpoints of the MCP
endpoint. Every other `/api/*` route requires the passkey session, except
`/api/public/*`. [sign-in.md](sign-in.md) lists the routes and their rules.

### Future route review rule

Treat routes as public by default unless the session gate covers them. Before
any deployment, give explicit privacy review to every new page outside
`/owner`, every new public API exception, and every new server route outside
`/api`. Verify the anonymous and owner behavior from deployed requests.

## Profiles

One instance can keep two logs under one sign-in: the `owner` profile and the
`partner` profile. The owner turns the partner profile on with the
`partnerProfileEnabled` setting in `PATCH /api/settings`. It is off for an owner
with no saved settings.

- Sign-in data, such as passkeys, sessions and OAuth grants, uses the account
  key. That is `CALOCOUNT_OWNER_KEY`.
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
- The public view, `/meal-photos/<mealId>`, `/llms.txt` serve only the owner
  profile.

## Meal flow

1. The owner enters a meal in the private dashboard, or ChatGPT prepares structured data and calls `add_meals` through the private `/mcp` app.
2. The shared meal-processing code validates the request and stores the meal, nutrient values, and optional photo in D1 and private R2. A UUID `request_id` makes retries idempotent.
3. The public read-only projection updates from the stored meal data. The owner dashboard continues to provide edits, exports, and private photo access.
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
passkey session. ChatGPT corrects a meal with the `update_meal` tool. For external
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

D1 is the durable source of meal state. The request ID of a meal makes
retries idempotent. The hourly photo cleanup is a bounded, resumable scan for
unlinked photos older than the 24-hour grace period. Historical job tables
remain, but current code does not use them.

## Product boundary

Calocount tracks calories, protein, carbohydrates, fat, meal photos, and optional manual weight entries. It does not contain WHOOP, Apple Health, body-fat, sleep, recovery, or step integrations.
