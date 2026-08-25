# Calocount

Calocount is a private, single-user calorie tracker with optional read-only sharing. Send a meal photo and caption to Telegram. The app estimates nutrition, stores the structured result, and shows a compact Caltrack-inspired dashboard.

The application backend uses Cloudflare Workers, D1, R2, Queues, Cron Triggers, Static Assets, and Access. OpenRouter is the default AI gateway. A direct xAI adapter is included.

## Included

- Caltrack-inspired dark dashboard with today and seven-day views
- calories, protein, carbohydrates, and fat
- meal detail, additions, edits, and correction history
- live API data with a clear local demo fallback
- private R2 photo delivery
- Telegram webhook allowlist and duplicate-update protection
- durable D1 analysis jobs and Queue processing
- short-lived signed AI image URLs
- strict, versioned meal-analysis JSON Schema
- OpenRouter and direct xAI adapters behind `MealAnalyzer`
- provider, model, latency, token, and cost records
- JSON and CSV export
- Cloudflare Access JWT authorization with an owner allowlist
- Expiring, revocable read-only share links

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
docs/read-only-sharing.md share-link data boundary and rollout runbook
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

The dashboard uses demo data when local D1 is not ready. Set `CALOCOUNT_ALLOW_LOCAL=true` only in `.dev.vars`. Production must set `CALOCOUNT_ALLOW_LOCAL=false` and use a valid, signed Cloudflare Access JWT. Identity headers by themselves are not trusted.

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

Set secrets with `wrangler secret put`. Do not put secret values in either JSONC file. For a production owner email, use the new encrypted secret name:

```bash
npx wrangler secret put CALOCOUNT_OWNER_EMAIL
```

`CALOCOUNT_ALLOWED_EMAIL` is retained only as a fallback for older or local configurations. Keep `CALOCOUNT_ALLOWED_USER_ID` if you use the Access user ID allowlist instead of an email.

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

1. Put Cloudflare Access in front of `calocount-app` and allow only the owner. Keep the whole app behind this policy while you deploy and verify the sharing code.
2. Leave `calocount-ingest` public.
3. Set `PUBLIC_ORIGIN` to the ingest Worker's HTTPS origin.
4. Register `https://<ingest-origin>/telegram/webhook` with Telegram and send `TELEGRAM_WEBHOOK_SECRET` as Telegram's secret token.
5. Send one test meal photo and confirm that the job, photo, meal items, and AI run appear.

For read-only sharing, follow [docs/read-only-sharing.md](docs/read-only-sharing.md). The safe order is to apply the additive D1 migration, set the encrypted `CALOCOUNT_OWNER_EMAIL` secret (or the user ID secret), deploy, and test while the existing whole-app Access protection remains. Only then add narrow Access bypasses for `/share/*`, `/api/share/*`, and the exact non-data static assets required by the deployed share page. Do not bypass the root app, general API routes, or owner share-link routes.

Cloudflare deployment and Telegram registration are not done automatically by this repository because they require your account, resource IDs, and secrets.

## Privacy

- Meal photos stay in a private R2 bucket.
- The dashboard streams photos through an authorized API route.
- The AI service receives a signed image URL that expires in five minutes.
- Share URLs are bearer credentials. The raw random token is returned once; each link can expire or be revoked.
- A public share page exposes only the selected dashboard projection: targets, meal and macro totals, seven-day trend, recent weights, and recent meal-item nutrition.
- Public sharing does not expose photos, captions, notes, assumptions, confidence, AI/provider data, Telegram data, or private settings.
- Normal logs do not include captions, images, signed URLs, or full provider payloads.
- Nutrition values are estimates, not medical measurements.

See [docs/architecture.md](docs/architecture.md) for the full data flow.
