# Calocount

Calocount is a single-user calorie tracker with a private owner dashboard and an optional public read-only dashboard. Add meals manually in the owner dashboard or through the private ChatGPT MCP app. The app validates and stores structured nutrition data and shows a compact Caltrack-inspired dashboard.

The application backend uses Cloudflare Workers, D1, R2, Cron Triggers, and Static Assets. One Worker serves the dashboard and API and runs the hourly photo cleanup. The owner signs in with a passkey, and ChatGPT connects with OAuth.

## Deploy your own

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/poltak/calocount)

Each instance has one owner and its own Worker, D1 database and R2 bucket. The button copies this repository to your GitHub or GitLab account, creates the database and the bucket, and deploys the Worker. It asks for a setup code. Then you open the Worker address, type the setup code, and save a passkey. Follow [docs/deploy-your-own.md](docs/deploy-your-own.md).

## Included

- Caltrack-inspired dark dashboard with today and seven-day views
- a public read-only dashboard that the owner turns on or off in settings
- calendar of all past days in both dashboards, with the calories and protein of each day
- calories, protein, carbohydrates, and fat
- meal detail, additions, edits, and correction history
- live API data, and an unavailable state when the API is not ready
- private R2 storage with scoped owner and public photo delivery
- manual meal entry and a private ChatGPT MCP integration
- idempotent structured meal and nutrient validation
- scheduled cleanup of shared meal photos
- JSON and CSV export
- passkey sign-in with sessions that last while the owner uses the app
- an OAuth 2.1 server for the ChatGPT MCP app, with a consent page

Calocount does not include WHOOP, Apple Health, body-fat, sleep, recovery, or step integrations.

## Repository layout

```text
backend/             Hono Worker on D1 through Kysely, with the migrations and the scheduled photo cleanup
frontend/            React and Vite dashboard, and the browser tests
common/              code that the backend and the frontend share
scripts/             dev server, migration, check and template scripts
plugins/             the ChatGPT plugin package with the meal-tracking skill
docs/                user and design documents
docs/agents/         documents for coding agents
wrangler.jsonc       Worker configuration, at the repository root
```

The documents in `docs/`:

```text
docs/architecture.md        detailed runtime flow and boundaries
docs/deploy-your-own.md     setup of a new instance with the Deploy to Cloudflare button
docs/sign-in.md             passkeys, sessions, and OAuth
docs/read-only-sharing.md   public and owner route boundary
```

## Local dashboard

Requirements:

- Node.js 26.13.0, the version in `.nvmrc`. pnpm runs scripts on the Node version that `package.json` pins.
- pnpm

Setup:

```bash
SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install
cp .dev.vars.example .dev.vars
```

Set `CALOCOUNT_SETUP_CODE` in `.dev.vars` to a phrase of at least 12 characters. Then start the dev server:

```bash
pnpm run dev
```

Open `http://localhost:5173`. Use `localhost`, not `127.0.0.1`, because browsers allow passkeys only on `localhost`. On the first visit, type the setup code and save a passkey. [docs/sign-in.md](docs/sign-in.md#try-passkeys-locally) has the details.

`pnpm run dev` builds the backend, applies the migrations to the local D1 database, and starts the Worker and the Vite dev server. The local D1 state stays in `.wrangler/state/`.

The public root reads only the routes under `/api/public/` and `/meal-photos/*`. It does not fall back to owner or demo data.

## ChatGPT meal logging

Use the private MCP app at `/mcp` for ChatGPT meal logging and updates. ChatGPT connects with OAuth, and the owner allows it on a Calocount consent page. It provides `add_meals`, `update_meal`, `get_nutrition_summary`, `get_nutrition_history`, and `get_weight_history`. Use `update_meal` to edit a completed meal with the same `request_id` returned by `get_nutrition_history`. See the [MCP setup guide](./docs/plugin/README.md).

## Local D1

`pnpm run dev` applies the migrations to the local D1 database. To add a migration, run `pnpm run db:migration:create <name>`.

## Photo cleanup

The Worker's cron trigger runs every hour. Each run scans up to 1,000 objects
in the photo bucket and deletes the ones that no meal links to and that are
older than 24 hours. A run that does not reach the end of the bucket saves its
position in the bucket and the next run continues from there.

## Validate

```bash
pnpm run check
```

Install the browser once with `pnpm run test:browser:install` before the browser tests.

The check runs the Node version check, the build of the backend, the format, lint, type, build, hook, lint-rule, migration, pnpm version, script, secret and unused-code checks, and the app tests. It does not run the browser tests. Run them with `pnpm run test:browser`. They start the real Worker on a fresh local D1 database. They do not access production data.

## Cloudflare deployment

`wrangler.jsonc` configures the one Worker: the dashboard, the API, and the hourly cron trigger. It holds only the values that are the same for every instance. The setup code is a secret on each Worker. `keep_vars` is `true`, so a deploy does not delete the variables that the dashboard sets. `.dev.vars.example` lists the secret that the Deploy to Cloudflare button asks for.

Production deployment of this repository runs through GitHub Actions. The workflow runs only in `poltak/calocount`. A copy made with the Deploy to Cloudflare button deploys with Workers Builds. A push to `main` or `master` runs `pnpm run check` and `pnpm run deploy`. That script builds the app, applies the remote D1 migrations, and deploys the Worker. You can also start the workflow manually with `workflow_dispatch`. The current default branch is `main`.

Before the first automatic deployment, complete this one-time GitHub and Cloudflare setup:

1. In the repository settings, create a GitHub environment named `production`.
2. In Cloudflare, create an API token from the `Edit Cloudflare Workers` template. This template includes the supporting read permissions Wrangler expects and R2 access. Add the account permission `D1 Edit`, then restrict account and zone resources to the Calocount account and only the zones required by this deployment.
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets on the `production` environment. `CLOUDFLARE_ACCOUNT_ID` is the target Cloudflare account ID.
4. Keep the existing Cloudflare Worker secrets and resources configured. The workflow deploys Worker code and applies D1 migrations; it does not create resources or copy Worker secrets.
5. If every push should deploy without approval, do not add required reviewers to the `production` environment. Add reviewers only when you want an approval gate.

Create or confirm one D1 database and one R2 Standard bucket, and bind both in `wrangler.jsonc`.

Set the setup code as a Worker secret:

```bash
pnpm exec wrangler secret put CALOCOUNT_SETUP_CODE
```

Build the app, apply the remote migrations, and deploy the Worker:

```bash
pnpm run deploy
```

An earlier version ran the photo cleanup in a separate Worker named
`calocount-ingest`. If that Worker still exists in your account, delete it once
after this deployment, so the cleanup does not run twice:

```bash
pnpm exec wrangler delete --name calocount-ingest
```

Then:

1. Review the public projection and the route conditions. The PWA manifest starts at `/owner`; its `id` and `scope` remain `/`.
2. Confirm in the Worker's logs that the hourly cron run reports a `meal_photo_cleanup` event.
3. Test one manual dashboard meal and the MCP meal and nutrition tools.
4. Verify the anonymous public projection and photo flow, and the private owner flow.

For the public/owner route split, follow [docs/read-only-sharing.md](docs/read-only-sharing.md). The Worker checks the passkey session on the private `/api` routes, and the `/owner` page shows the sign-in page without a session. `/`, `/privacy`, `/api/public/*`, `/meal-photos/*`, `/llms.txt` and the static files are public.

This repository does not set up Cloudflare resources or secrets. That setup needs your account, resource IDs, and secrets.

## Privacy

- The database keeps the public key of each passkey and the SHA-256 of each session cookie, OAuth code and OAuth token. It keeps no usable secret. See [docs/sign-in.md](docs/sign-in.md).
- The public dashboard is off for a new owner. The owner turns it on with the "Public dashboard" setting. While it is off, `/` redirects to `/owner`, and `/api/public/summary`, `/meal-photos/*` and `/llms.txt` return `404`.
- Migration `0014_public_view.sql` turns the setting on for each owner that has saved settings, so an existing public dashboard stays public after the upgrade.
- Meal photos stay in a private R2 bucket.
- The owner dashboard streams photos through an authenticated API route.
- The public root may stream photos for completed meals in its current seven-day projection through `/meal-photos/*`; raw R2 keys are not exposed.
- The Worker downloads photos from temporary ChatGPT image links immediately and never stores the links.
- The public root exposes only the selected dashboard projection: targets, meal and macro totals, seven-day trend, recent weights, recent meal-item nutrition, and photo availability.
- The public calendar also exposes the totals of each past day, and the completed entries, item nutrition and weight of any day a viewer opens. Photos stay limited to the last seven days.
- The public insight panels also expose the nutrition of each food item of the last 30 days. The items do not show where each amount came from.
- The public projection does not expose photo storage keys, captions, notes, assumptions, confidence, AI/provider data, or private settings.
- Normal logs do not include captions, images, signed URLs, or full provider payloads.
- Nutrition values are estimates, not medical measurements.

See [docs/architecture.md](docs/architecture.md) for the full data flow.

## The template

This project started from a template, and can take the template's later
changes. [`template-version.json`](template-version.json) names the template and the last
template commit that the project has. The `sync-template` workflow takes the
new commits, and [setup](docs/agents/setup.md#changes-from-the-template) has
its commands.
