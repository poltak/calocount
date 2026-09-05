# Calocount

Calocount is a single-user calorie tracker with a public read-only dashboard and a private owner dashboard. Add meals manually in the owner dashboard or use the external GPT add-meal workflow. The app validates and stores structured nutrition data and shows a compact Caltrack-inspired dashboard.

The application backend uses Cloudflare Workers, D1, R2, Cron Triggers, Static Assets, and Access. The scheduled photo-maintenance Worker remains under `workers/ingest` for deployment compatibility.

## Included

- Caltrack-inspired dark dashboard with today and seven-day views
- calories, protein, carbohydrates, and fat
- meal detail, additions, edits, and correction history
- live API data with a clear fail-closed unavailable state
- private R2 storage with scoped owner and public photo delivery
- manual meal entry and an external GPT add-meal workflow
- idempotent structured meal and nutrient validation
- scheduled cleanup of shared meal photos
- JSON and CSV export
- Cloudflare Access JWT authorization with an owner allowlist

WHOOP, Apple Health, body-fat, sleep, recovery, and step integrations are intentionally not included.

## Repository layout

```text
app/                 dashboard and private JSON API
db/                  Drizzle schema and D1 repository
drizzle/             generated D1 migration
worker/              dashboard Worker entry point
workers/ingest/      scheduled photo-maintenance Worker (compatibility path)
tests/               rendered UI, data, security, and schema tests
docs/architecture.md detailed runtime flow and boundaries
docs/read-only-sharing.md public/owner route boundary and rollout runbook
```

## Local dashboard

Requirements:

- Node.js 22.13 or later
- pnpm

Setup:

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm run dev
```

Open `http://localhost:3000`.

To add a complete seven-day example dataset to the running local dashboard, use:

```bash
pnpm run db:seed:local
```

The command creates three meals per day through today in `Asia/Ho_Chi_Minh` and skips fixture IDs that already exist. It only accepts a localhost HTTP URL. Optional overrides are `--anchor-date=YYYY-MM-DD`, `--timezone=IANA_TIMEZONE`, and `--base-url=http://localhost:PORT`.

The owner dashboard waits for live API data and fails closed when local D1 or owner authentication is not ready. Set `CALOCOUNT_ALLOW_LOCAL=true` only in `.dev.vars` while running a configured local stack. Production must set `CALOCOUNT_ALLOW_LOCAL=false` and use a valid, signed Cloudflare Access JWT. Identity headers by themselves are not trusted. The public root uses only `/api/public/summary` and `/meal-photos/*`; it does not fall back to owner or demo data.

The dashboard supports manual meal entry. An external GPT meal action uses `CALOCOUNT_CHATGPT_MEAL_TOKEN` from `.dev.vars`. Set a long random value in the local file (the example file contains a placeholder). For production, store it as a Worker secret:

```bash
pnpm exec wrangler secret put CALOCOUNT_CHATGPT_MEAL_TOKEN
```

Do not put this token in `wrangler.jsonc` or in application links. The endpoint is `POST /api/add-meal`. Send the token only in an `Authorization: Bearer <token>` header and send a JSON body with `request_id`, `name`, `kcal`, `protein`, `carbs`, `fat`, and ISO-8601 `eaten_at` values. An optional `nutrients` object accepts the 24 item nutrient fields used by the dashboard; each value is a non-negative number or `null` when unknown. For this external request, `request_id` is a UUID idempotency key: repeating it returns the original meal without creating another entry.

External GPT image actions may also send `openaiFileIdRefs` as an array of file reference objects. The endpoint accepts the first valid HTTPS JPEG, PNG, or WebP reference from an approved OpenAI file host, downloads it immediately, and stores it with the meal. Temporary links are never stored. A photo is limited to 10 MiB.

For a local smoke test, use a new UUID and the token from `.dev.vars`:

```bash
curl -i http://localhost:3000/api/add-meal \
  -H 'Authorization: Bearer replace-with-a-long-random-secret' \
  -H 'Content-Type: application/json' \
  --data '{"request_id":"c5a84680-d0c7-4af6-a4f5-89495c3923ec","name":"Chicken rice and morning glory","kcal":610,"protein":58,"carbs":41,"fat":20,"eaten_at":"2026-08-30T18:25:00+07:00"}'
```

## Local D1

Apply the migration to the local D1 database:

```bash
pnpm exec wrangler d1 migrations apply calocount --local
```

The app and photo-maintenance Worker use the same logical database name, `calocount`.

## Photo-maintenance Worker

The `workers/ingest` path, `ingest:*` npm scripts, and remote Worker name
`calocount-ingest` remain for deployment compatibility. The Worker serves
`GET /healthz` and runs a scheduled bounded, resumable scan that removes only
unlinked R2 photos older than the 24-hour grace period, using the existing D1
and R2 bindings. It does not accept Telegram webhook or AI-media requests,
create analysis jobs, or consume Queue messages. `/telegram/webhook` and
`/ai-media/*` return `404`.

No bot, AI-provider, or Queue setup is required for this Worker. Run the
focused local commands:

```bash
pnpm run ingest:types
pnpm run ingest:dev
```

## Validate

```bash
pnpm run check
pnpm run ingest:deploy:dry
```

The full check runs strict TypeScript, ESLint, a production build, rendered HTML tests, data tests, and AI/ingestion tests.

## Cloudflare deployment

This repository has two Worker configurations:

- `wrangler.jsonc` for the private dashboard and API
- `workers/ingest/wrangler.jsonc` for the public photo-maintenance Worker

Production deployment runs through GitHub Actions. A push to `main` or `master` runs the checks, both deployment dry runs, remote D1 migrations, and both Worker deployments in order. You can also start the workflow manually with `workflow_dispatch`. The current default branch is `main`.

Before the first automatic deployment, complete this one-time GitHub and Cloudflare setup:

1. In the repository settings, create a GitHub environment named `production`.
2. In Cloudflare, create an API token from the `Edit Cloudflare Workers` template. This template includes the supporting read permissions Wrangler expects and R2 access. Add the account permission `D1 Edit`, then restrict account and zone resources to the Calocount account and only the zones required by this deployment.
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets on the `production` environment. `CLOUDFLARE_ACCOUNT_ID` is the target Cloudflare account ID.
4. Keep the existing Cloudflare Worker secrets and resources configured. The workflow deploys Worker code and applies D1 migrations; it does not create resources or copy Worker secrets.
5. If every push should deploy without approval, do not add required reviewers to the `production` environment. Add reviewers only when you want an approval gate.

Create or confirm one D1 database and one R2 Standard bucket. Both Workers must bind to the same D1 database and R2 bucket. If Wrangler adds resource IDs to one configuration, copy the same IDs to the other configuration. Keep existing Queue resources and historical D1 schema, migrations, and data; the reduced Worker does not create or consume queue messages.

Apply migrations before the first production request:

```bash
pnpm exec wrangler d1 migrations apply calocount --remote
```

Do not put plaintext email values in either JSONC file. For a new production owner allowlist, use the `CALOCOUNT_ALLOWED_EMAIL_SHA256` variable in `wrangler.jsonc`. Its value is the SHA-256 digest of the trimmed, lower-case Access email.

Encrypted plaintext email bindings remain for compatibility with older or local deployments:

```bash
pnpm exec wrangler secret put CALOCOUNT_OWNER_EMAIL
```

`CALOCOUNT_ALLOWED_EMAIL` is retained only as a fallback for older or local configurations. Keep `CALOCOUNT_ALLOWED_USER_ID` if you use the Access user ID allowlist instead of an email. If several allowlists are configured, all of them must match; a malformed email hash fails closed.

Build and deploy the private app:

```bash
pnpm run build
pnpm exec wrangler deploy
```

Before the first deployment of the reduced photo-maintenance Worker, detach
the old Queue consumer once:

```bash
pnpm exec wrangler queues consumer remove calocount-analysis calocount-ingest
```

Wrangler does not automatically detach consumers removed from configuration.
Do not delete the Queue resources or their data.

Deploy the public photo-maintenance Worker:

```bash
pnpm exec wrangler deploy --config workers/ingest/wrangler.jsonc
```

Then:

1. Review the public projection, route conditions, and owner JWT checks. The PWA manifest starts at `/owner`; its `id` and `scope` remain `/`.
2. Leave `calocount-ingest` public so `/healthz` can be monitored. Cron does not require public access.
3. Confirm that the scheduled bounded cleanup uses the shared D1 and R2 bindings and removes only unlinked photos older than 24 hours.
4. Test one manual dashboard meal and one external GPT `POST /api/add-meal` request.
5. On the separate `calocount-ingest` origin, verify that `/telegram/webhook` and `/ai-media/*` return `404`; also verify the anonymous public projection/photo flow plus the private owner flow.

For the public/owner route split, follow [docs/read-only-sharing.md](docs/read-only-sharing.md). The production Access layout was live-verified on 2026-08-26:

- The existing private Access application protects the exact `/owner`, `/owner/*`, and `/api/*` destinations with the existing owner Allow policy and the same owner JWT audience.
- A separate Access application for the exact `/api/public/summary` destination uses Bypass Everyone.
- `/`, `/meal-photos/*`, and the static/PWA assets are public because no Access destination matches them. The photo handler restricts delivery to completed meals in the current public projection. Do not add root or static bypass exceptions.
- Anonymous and authenticated checks must confirm that the public root, summary, and projected photos load without login; owner pages, `/api/photos/*`, and private APIs require the owner Access session; static/PWA assets are reachable anonymously; and the removed share routes return `404` when reached.

Do not add a broad `/*`, `/_next/*`, or `/api/*` bypass. Do not make owner APIs public.

Future route rule: for the public-root/private-owner layout, treat routes as public by default unless a private Cloudflare Access destination covers them. Any new page outside `/owner`, any new public API exception, or any new server route outside `/api` requires explicit privacy and Access review before deployment. Verify the anonymous and owner behavior from deployed requests, including the Access path list.

Cloudflare resource and secret setup are not done automatically by this repository because they require your account, resource IDs, and secrets.

## Privacy

- Meal photos stay in a private R2 bucket.
- The owner dashboard streams photos through an authenticated API route.
- The public root may stream photos for completed meals in its current seven-day projection through `/meal-photos/*`; raw R2 keys are not exposed.
- External GPT temporary image links are downloaded immediately and are never stored as temporary links.
- The public root exposes only the selected dashboard projection: targets, meal and macro totals, seven-day trend, recent weights, recent meal-item nutrition, and photo availability.
- The public projection does not expose photo storage keys, captions, notes, assumptions, confidence, AI/provider data, Telegram data, or private settings.
- Normal logs do not include captions, images, signed URLs, or full provider payloads.
- Nutrition values are estimates, not medical measurements.

See [docs/architecture.md](docs/architecture.md) for the full data flow.
