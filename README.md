# Calocount

Calocount is a single-user calorie tracker with a public read-only dashboard and a private owner dashboard. Add meals manually in the owner dashboard or through the private ChatGPT MCP app. The app validates and stores structured nutrition data and shows a compact Caltrack-inspired dashboard.

The application backend uses Cloudflare Workers, D1, R2, Cron Triggers, Static Assets, and Access. One Worker serves the dashboard and API and runs the hourly photo cleanup.

## Included

- Caltrack-inspired dark dashboard with today and seven-day views
- calories, protein, carbohydrates, and fat
- meal detail, additions, edits, and correction history
- live API data, and an unavailable state when the API is not ready
- private R2 storage with scoped owner and public photo delivery
- manual meal entry and a private ChatGPT MCP integration
- idempotent structured meal and nutrient validation
- scheduled cleanup of shared meal photos
- JSON and CSV export
- Cloudflare Access JWT authorization with an owner allowlist

Calocount does not include WHOOP, Apple Health, body-fat, sleep, recovery, or step integrations.

## Repository layout

```text
app/                 dashboard and private JSON API
db/                  Drizzle schema and D1 repository
drizzle/             generated D1 migration
worker/              Worker entry point and scheduled photo cleanup
tests/               unit, Worker runtime, and browser tests
docs/architecture.md detailed runtime flow and boundaries
docs/read-only-sharing.md public/owner route boundary and rollout runbook
```

## Local dashboard

Requirements:

- Node.js 22.16 or later
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

## ChatGPT meal logging

Use the private MCP app at `/mcp` for ChatGPT meal logging and updates. It provides `add_meals`, `update_meal`, `get_nutrition_summary`, `get_nutrition_history`, and `get_weight_history`. Use `update_meal` to edit a completed meal with the same `request_id` returned by `get_nutrition_history`. See the [MCP setup guide](./docs/plugin/README.md).

### Deprecated Custom GPT Action

The old Custom GPT Action and its [instruction and schema templates](./docs/custom-gpt/README.md) are deprecated. Keep them only for existing setups. The bearer-token `POST /api/add-meal` route remains available for compatibility; the MCP app uses the shared meal-processing code, not this token-based route.

Existing external Action clients use `CALOCOUNT_CHATGPT_MEAL_TOKEN` from `.dev.vars`. Set a long random value in the local file (the example file contains a placeholder). For production, store it as a Worker secret:

```bash
pnpm exec wrangler secret put CALOCOUNT_CHATGPT_MEAL_TOKEN
```

Do not put this token in `wrangler.jsonc` or in application links. The endpoint is `POST /api/add-meal`. Send the token only in an `Authorization: Bearer <token>` header and send a JSON body with `request_id`, `name`, `kcal`, `protein`, `carbs`, `fat`, and ISO-8601 `eaten_at` values. An optional `nutrients` object accepts the 24 item nutrient fields used by the dashboard; each value is a non-negative number or `null` when unknown. For this external request, `request_id` is a UUID idempotency key: repeating it returns the original meal without creating another entry.

Existing GPT image actions may also send `openaiFileIdRefs` as an array of file reference objects. Shared external photo handling accepts the first valid HTTPS JPEG, PNG, WebP, or HEIC reference from an approved OpenAI file host or a public Azure Blob account host (`<account>.blob.core.windows.net` or `<account>-secondary.blob.core.windows.net`, where the account has 3–24 lowercase letters or digits). Azure storage accounts can belong to other tenants; this rule is not an OpenAI ownership check. Cloudflare Images converts HEIC photos to JPEG before storage. The Worker downloads each photo immediately, rejects redirects, and never stores the temporary link. A photo can be at most 10 MiB.

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

## Photo cleanup

The Worker's cron trigger runs every hour. Each run scans up to 1,000 objects
in the photo bucket and deletes the ones that no meal links to and that are
older than 24 hours. A run that does not reach the end of the bucket saves its
position in the bucket and the next run continues from there.

## Validate

```bash
pnpm run check
pnpm run deploy:dry
```

Install the browser once with `pnpm exec playwright install chromium` before running checks. On Linux, use `pnpm exec playwright install --with-deps chromium` to install system libraries too.

The full check runs strict TypeScript, ESLint, a production build, the unit and data tests, tests that send requests to the built Worker, and browser tests. The browser tests use the real dashboard with a local API fixture. They do not access production data. Run only these tests with `pnpm run test:browser`.

## Cloudflare deployment

`wrangler.jsonc` configures the one Worker: the dashboard, the API, and the hourly cron trigger.

Production deployment runs through GitHub Actions. A push to `main` or `master` runs the checks, a deployment dry run, remote D1 migrations, and the Worker deployment in order. You can also start the workflow manually with `workflow_dispatch`. The current default branch is `main`.

Before the first automatic deployment, complete this one-time GitHub and Cloudflare setup:

1. In the repository settings, create a GitHub environment named `production`.
2. In Cloudflare, create an API token from the `Edit Cloudflare Workers` template. This template includes the supporting read permissions Wrangler expects and R2 access. Add the account permission `D1 Edit`, then restrict account and zone resources to the Calocount account and only the zones required by this deployment.
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets on the `production` environment. `CLOUDFLARE_ACCOUNT_ID` is the target Cloudflare account ID.
4. Keep the existing Cloudflare Worker secrets and resources configured. The workflow deploys Worker code and applies D1 migrations; it does not create resources or copy Worker secrets.
5. If every push should deploy without approval, do not add required reviewers to the `production` environment. Add reviewers only when you want an approval gate.

Create or confirm one D1 database and one R2 Standard bucket, and bind both in `wrangler.jsonc`.

Apply migrations before the first production request:

```bash
pnpm exec wrangler d1 migrations apply calocount --remote
```

Do not put plaintext email values in `wrangler.jsonc`. For a new production owner allowlist, use the `CALOCOUNT_ALLOWED_EMAIL_SHA256` variable in `wrangler.jsonc`. Its value is the SHA-256 digest of the trimmed, lower-case Access email.

Encrypted plaintext email bindings remain for compatibility with older or local deployments:

```bash
pnpm exec wrangler secret put CALOCOUNT_OWNER_EMAIL
```

`CALOCOUNT_ALLOWED_EMAIL` remains only as a fallback for older or local configurations. Keep `CALOCOUNT_ALLOWED_USER_ID` if you use the Access user ID allowlist instead of an email. If several allowlists are configured, all of them must match; a malformed email hash fails closed.

Build and deploy the app:

```bash
pnpm run build
pnpm exec wrangler deploy
```

An earlier version ran the photo cleanup in a separate Worker named
`calocount-ingest`. If that Worker still exists in your account, delete it once
after this deployment, so the cleanup does not run twice:

```bash
pnpm exec wrangler delete --name calocount-ingest
```

Then:

1. Review the public projection, route conditions, and owner JWT checks. The PWA manifest starts at `/owner`; its `id` and `scope` remain `/`.
2. Confirm in the Worker's logs that the hourly cron run reports a `meal_photo_cleanup` event.
3. Test one manual dashboard meal and the MCP meal and nutrition tools. If the legacy Action is still configured, test one `POST /api/add-meal` request for compatibility.
4. Verify the anonymous public projection and photo flow, and the private owner flow.

For the public/owner route split, follow [docs/read-only-sharing.md](docs/read-only-sharing.md). The production Access layout was live-verified on 2026-08-26:

- The existing private Access application protects the exact `/owner`, `/owner/*`, and `/api/*` destinations with the existing owner Allow policy and the same owner JWT audience.
- A separate Access application for the exact `/api/public/summary` destination uses Bypass Everyone.
- `/`, `/meal-photos/*`, and the static/PWA assets are public because no Access destination matches them. The photo handler restricts delivery to completed meals in the current public projection. Do not add root or static bypass exceptions.
- Anonymous and authenticated checks must confirm that the public root, summary, and projected photos load without login; owner pages, `/api/photos/*`, and private APIs require the owner Access session; static/PWA assets are reachable anonymously; and the removed share routes return `404` when reached.

Do not add a broad `/*`, `/_next/*`, or `/api/*` bypass. Do not make owner APIs public.

For future changes to the public-root/private-owner layout, treat routes as public by default unless a private Cloudflare Access destination covers them. Any new page outside `/owner`, any new public API exception, or any new server route outside `/api` requires explicit privacy and Access review before deployment. Verify the anonymous and owner behavior from deployed requests, including the Access path list.

This repository does not set up Cloudflare resources or secrets. That setup needs your account, resource IDs, and secrets.

## Privacy

- Meal photos stay in a private R2 bucket.
- The owner dashboard streams photos through an authenticated API route.
- The public root may stream photos for completed meals in its current seven-day projection through `/meal-photos/*`; raw R2 keys are not exposed.
- The Worker downloads photos from temporary ChatGPT image links immediately and never stores the links.
- The public root exposes only the selected dashboard projection: targets, meal and macro totals, seven-day trend, recent weights, recent meal-item nutrition, and photo availability.
- The public projection does not expose photo storage keys, captions, notes, assumptions, confidence, AI/provider data, or private settings.
- Normal logs do not include captions, images, signed URLs, or full provider payloads.
- Nutrition values are estimates, not medical measurements.

See [docs/architecture.md](docs/architecture.md) for the full data flow.
