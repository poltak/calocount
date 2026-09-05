# Calocount architecture

Calocount is a single-user meal tracker. The public root is read-only, and the owner dashboard is private and read-write. It uses Cloudflare free-tier services for the complete application backend.

## Runtime services

- The app Worker serves the dashboard and JSON API.
- Cloudflare D1 stores settings, meals, meal items, revisions, and historical job and AI records.
- A private R2 bucket stores meal photos.
- The photo-maintenance Worker in `workers/ingest` serves `GET /healthz` and runs a bounded, resumable scan that removes only unlinked R2 photos older than the 24-hour grace period.
- Cloudflare Access protects the private owner route and private APIs. The photo-maintenance Worker runs as a separate public Worker.
- Historical D1 schema, migrations, data, and Queue resources remain for compatibility. Current code does not produce or consume analysis jobs.

## HTTP route boundary

The application has two dashboard entry points:

- `/` is the public read-only dashboard. It loads the explicit projection from
  `GET /api/public/summary` and projected images from `GET /meal-photos/<mealId>`.
- `/owner` is the private read-write dashboard. It uses the existing signed-JWT owner APIs.

`/api/public/summary` resolves the configured stable owner key, fails closed when
that key is absent, returns `Cache-Control: no-store`, and removes owner keys,
captions, notes, photo storage metadata, AI fields, and other private data. It
exposes only a `hasPhoto` flag for a safe projected image. The public
`/meal-photos/<mealId>` route rechecks the configured owner's current seven-day
projection, streams only completed JPEG, PNG, or WebP meals from private R2, and
requires cache revalidation. All `/api/*` routes other than the reviewed summary
exception are private owner routes. The public root does not expose owner write
controls or call private APIs.

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
`/_next/*` bypass, or an `/api/*` bypass.

Anonymous and authenticated live checks must confirm that the public root,
summary, and projected photos load without login; owner pages, `/api/photos/*`,
and private APIs require the owner Access session; static/PWA assets are
reachable anonymously; and removed share routes return `404` when reached.
Recheck the live Access path list after every Access change; this document
describes the intended state, not automatic enforcement.

On the separate `calocount-ingest` compatibility Worker origin, legacy
`/telegram/webhook` and `/ai-media/*` routes return `404`. No Telegram webhook
or in-Worker AI processing remains.

### Future route and Access review rule

For the intended public-root/private-owner layout, treat routes as public by
default unless a private Cloudflare Access destination covers them. Before any
deployment, give explicit privacy and Access review to every new page outside
`/owner`, every new public API exception, and every new server route outside
`/api`. Verify the anonymous and owner behavior from deployed requests. This is
a repository rule for future changes; the current layout was verified on
2026-08-26.

## Meal flow

1. The owner enters a meal in the private dashboard, or an external GPT action prepares structured data and calls `POST /api/add-meal` with the dashboard's bearer token.
2. The dashboard API validates the request and stores the meal, nutrient values, and optional photo in D1 and private R2. For the external request path, its UUID `request_id` makes retries idempotent.
3. The public read-only projection updates from the stored meal data. The owner dashboard continues to provide edits, corrections, exports, and private photo access.
4. The photo-maintenance Worker runs its scheduled bounded scan and removes only unlinked R2 photos older than the 24-hour grace period.

## External GPT boundary

Calocount does not call an AI provider or run an AI analysis worker. The external
GPT action prepares the meal estimate and sends validated structured values to
`POST /api/add-meal`. The dashboard Worker keeps the bearer token in a Worker
secret. For the external photo flow, it accepts approved temporary OpenAI image
references, downloads a photo immediately, and does not store the temporary
link.

## Privacy boundary

- R2 is private.
- Dashboard photo requests require the same server-side allowlist as other private API routes.
- External GPT photo references are downloaded immediately; temporary links are not stored.
- Secrets are Worker secrets. They are not D1 records or configuration values.
- Normal logs do not contain captions, photo URLs, or full request payloads.
- The scheduled cleanup removes only unlinked photos older than the 24-hour grace period; linked meal photos stay with their structured nutrition data.

## Reliability boundary

D1 is the durable source of meal state. External add-meal request IDs make
retries idempotent. The scheduled photo-maintenance pass is a bounded,
resumable scan for unlinked photos older than the 24-hour grace period.
Historical job tables and Queue data remain available for compatibility, but
current code does not use them.

## Product boundary

Calocount tracks calories, protein, carbohydrates, fat, meal photos, corrections, and optional manual weight entries. It does not contain WHOOP, Apple Health, body-fat, sleep, recovery, or step integrations.
