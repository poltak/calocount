# Calocount

Calocount is a single-user calorie tracker with a public read-only dashboard and a private owner dashboard. Send a meal photo and caption to Telegram. The app estimates nutrition, stores the structured result, and shows a compact Caltrack-inspired dashboard.

The application backend uses Cloudflare Workers, D1, R2, Queues, Cron Triggers, Static Assets, and Access. OpenRouter is the default AI gateway. A direct xAI adapter is included.

## Included

- Caltrack-inspired dark dashboard with today and seven-day views
- calories, protein, carbohydrates, and fat
- meal detail, additions, edits, and correction history
- live API data with a clear fail-closed unavailable state
- private R2 storage with scoped owner and public photo delivery
- Telegram webhook allowlist and duplicate-update protection
- durable D1 analysis jobs and Queue processing
- short-lived signed AI image URLs
- strict, versioned meal-analysis JSON Schema
- OpenRouter and direct xAI adapters behind `MealAnalyzer`
- provider, model, latency, token, and cost records
- JSON and CSV export
- Cloudflare Access JWT authorization with an owner allowlist

WHOOP, Apple Health, body-fat, sleep, recovery, and step integrations are intentionally not included.

## Repository layout

```text
app/                 dashboard and private JSON API
db/                  Drizzle schema and D1 repository
drizzle/             generated D1 migration
worker/              dashboard Worker entry point
workers/ingest/      Telegram, Queue, Cron, R2, and AI Worker
tests/               rendered UI, data, security, schema, and adapter tests
docs/architecture.md detailed runtime flow and boundaries
docs/read-only-sharing.md public/owner route boundary and rollout runbook
```

## Local dashboard

Requirements:

- Node.js 22.13 or later
- npm

Setup:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Open `http://localhost:3000`.

The owner dashboard waits for live API data and fails closed when local D1 or owner authentication is not ready. Set `CALOCOUNT_ALLOW_LOCAL=true` only in `.dev.vars` while running a configured local stack. Production must set `CALOCOUNT_ALLOW_LOCAL=false` and use a valid, signed Cloudflare Access JWT. Identity headers by themselves are not trusted. The public root uses only `/api/public/summary` and `/meal-photos/*`; it does not fall back to owner or demo data.

The optional ChatGPT meal action uses `CALOCOUNT_CHATGPT_MEAL_TOKEN` from `.dev.vars`. Set a long random value in the local file (the example file contains a placeholder). For production, store it as a Worker secret:

```bash
npx wrangler secret put CALOCOUNT_CHATGPT_MEAL_TOKEN
```

Do not put this token in `wrangler.jsonc` or in application links. The endpoint is `POST /api/add-meal`. Send the token only in an `Authorization: Bearer <token>` header and send a JSON body with `request_id`, `name`, `kcal`, `protein`, `carbs`, `fat`, and ISO-8601 `eaten_at` values. `request_id` is a UUID idempotency key: repeating it returns the original meal without creating another entry.

ChatGPT image actions may also send `openaiFileIdRefs` as an array of file reference objects. The endpoint accepts the first valid HTTPS JPEG, PNG, or WebP reference from an approved OpenAI file host, downloads it immediately, and stores it with the meal. Temporary links are never stored. A photo is limited to 10 MiB.

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
npx wrangler d1 migrations apply calocount --local
```

The app and ingest Worker use the same logical database name, `calocount`.

## Ingest Worker configuration

Copy the example secret file:

```bash
cp workers/ingest/.dev.vars.example workers/ingest/.dev.vars
```

Required Worker secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `MEDIA_SIGNING_SECRET`
- `OPENROUTER_API_KEY` or `XAI_API_KEY`

Required non-secret values:

- `TELEGRAM_ALLOWED_USER_IDS`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `PUBLIC_ORIGIN`
- `OWNER_KEY`
- `AI_BACKEND`
- primary and fallback model names

Run the ingest Worker:

```bash
npm run ingest:types
npm run ingest:dev
```

Do not commit `.dev.vars` files.

## AI backend selection

The domain and job code depend only on `MealAnalyzer`.

Choose OpenRouter with:

```text
AI_BACKEND=openrouter
OPENROUTER_MODEL=<vision-model-with-structured-output>
OPENROUTER_FALLBACK_MODELS=<model-two>,<model-three>
```

Choose direct xAI with:

```text
AI_BACKEND=xai
XAI_MODEL=<xai-vision-model>
```

You can also create an owner-scoped AI profile through `/api/ai-profiles` and select it with `settings.activeAiProfileId`. A profile stores only routing data. API keys always stay in Worker secrets.

OpenRouter requests require structured-output support and use zero-data-retention plus provider data-collection denial. The app records the actual model and upstream provider used for each run.

## Validate

```bash
npm run check
npm run ingest:deploy:dry
```

The full check runs strict TypeScript, ESLint, a production build, rendered HTML tests, data tests, and AI/ingestion tests.

## Cloudflare deployment

This repository has two Worker configurations:

- `wrangler.jsonc` for the private dashboard and API
- `workers/ingest/wrangler.jsonc` for the public Telegram ingress and Queue consumer

Create or confirm one D1 database, one R2 Standard bucket, and one Queue. Both Workers must bind to the same D1 database and R2 bucket. If Wrangler adds resource IDs to one configuration, copy the same IDs to the other configuration.

Apply migrations before the first production request:

```bash
npx wrangler d1 migrations apply calocount --remote
```

Do not put plaintext email values in either JSONC file. For a new production owner allowlist, use the `CALOCOUNT_ALLOWED_EMAIL_SHA256` variable in `wrangler.jsonc`. Its value is the SHA-256 digest of the trimmed, lower-case Access email.

Encrypted plaintext email bindings remain for compatibility with older or local deployments:

```bash
npx wrangler secret put CALOCOUNT_OWNER_EMAIL
```

`CALOCOUNT_ALLOWED_EMAIL` is retained only as a fallback for older or local configurations. Keep `CALOCOUNT_ALLOWED_USER_ID` if you use the Access user ID allowlist instead of an email. If several allowlists are configured, all of them must match; a malformed email hash fails closed.

Build and deploy the private app:

```bash
npm run build
npx wrangler deploy
```

Deploy the public ingest Worker:

```bash
npx wrangler deploy --config workers/ingest/wrangler.jsonc
```

Then:

1. Review the public projection, route conditions, and owner JWT checks. The PWA manifest starts at `/owner`; its `id` and `scope` remain `/`.
2. Leave `calocount-ingest` public.
3. Set `PUBLIC_ORIGIN` to the ingest Worker's HTTPS origin.
4. Register `https://<ingest-origin>/telegram/webhook` with Telegram and send `TELEGRAM_WEBHOOK_SECRET` as Telegram's secret token.
5. Send one test meal photo and confirm that the job, photo, meal items, and AI run appear.

For the public/owner route split, follow [docs/read-only-sharing.md](docs/read-only-sharing.md). The production Access layout was live-verified on 2026-08-26:

- The existing private Access application protects the exact `/owner`, `/owner/*`, and `/api/*` destinations with the existing owner Allow policy and the same owner JWT audience.
- A separate Access application for the exact `/api/public/summary` destination uses Bypass Everyone.
- `/`, `/meal-photos/*`, and the static/PWA assets are public because no Access destination matches them. The photo handler restricts delivery to completed meals in the current public projection. Do not add root or static bypass exceptions.
- Anonymous and authenticated checks must confirm that the public root, summary, and projected photos load without login; owner pages, `/api/photos/*`, and private APIs require the owner Access session; static/PWA assets are reachable anonymously; and the removed share routes return `404` when reached.

Do not add a broad `/*`, `/_next/*`, or `/api/*` bypass. Do not make owner APIs public.

Future route rule: for the public-root/private-owner layout, treat routes as public by default unless a private Cloudflare Access destination covers them. Any new page outside `/owner`, any new public API exception, or any new server route outside `/api` requires explicit privacy and Access review before deployment. Verify the anonymous and owner behavior from deployed requests, including the Access path list.

Cloudflare deployment and Telegram registration are not done automatically by this repository because they require your account, resource IDs, and secrets.

## Privacy

- Meal photos stay in a private R2 bucket.
- The owner dashboard streams photos through an authenticated API route.
- The public root may stream photos for completed meals in its current seven-day projection through `/meal-photos/*`; raw R2 keys are not exposed.
- The AI service receives a signed image URL that expires in five minutes.
- The public root exposes only the selected dashboard projection: targets, meal and macro totals, seven-day trend, recent weights, recent meal-item nutrition, and photo availability.
- The public projection does not expose photo storage keys, captions, notes, assumptions, confidence, AI/provider data, Telegram data, or private settings.
- Normal logs do not include captions, images, signed URLs, or full provider payloads.
- Nutrition values are estimates, not medical measurements.

See [docs/architecture.md](docs/architecture.md) for the full data flow.
