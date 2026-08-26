# Calocount architecture

Calocount is a single-user meal tracker. The public root is read-only, and the owner dashboard is private and read-write. It uses Cloudflare free-tier services for the complete application backend.

## Runtime services

- The app Worker serves the dashboard and JSON API.
- Cloudflare D1 stores settings, meals, meal items, revisions, durable job state, and AI usage.
- A private R2 bucket stores meal photos.
- The ingest Worker receives Telegram updates and consumes analysis jobs from Cloudflare Queues.
- A Cron Trigger recovers stale jobs and deletes photos after the retention period.
- Cloudflare Access protects the private owner route and private APIs. The Telegram webhook stays on a separate public Worker.

## HTTP route boundary

The application has two dashboard entry points:

- `/` is the public read-only dashboard. It loads only the explicit projection from `GET /api/public/summary`.
- `/owner` is the private read-write dashboard. It uses the existing signed-JWT owner APIs.

`/api/public/summary` resolves the configured stable owner key, fails closed when
that key is absent, returns `Cache-Control: no-store`, and removes owner keys,
captions, notes, photos, AI fields, and other private data. All other `/api/*`
routes are private owner routes unless a separately reviewed public exception is
verified. The public root does not expose owner write controls or call private
APIs.

The PWA manifest starts at `/owner` while keeping `id` and `scope` at `/`. This
keeps installed launches in the private owner dashboard without changing the
site identity or service-worker scope.

Cloudflare Access configuration is not implied by this source tree. Keep the
existing broad protection while deploying and testing. Before a broad hostname
is made public, live-verify private applications covering the exact `/owner`
path and its descendants and `/api/*`. Then verify each public exception and
static/PWA asset path from deployed requests. Record the final Access path list;
do not infer it from this document.

### Future route and Access review rule

For the intended public-root/private-owner layout, treat routes as public by
default unless a private Cloudflare Access destination covers them. Before any
deployment, give explicit privacy and Access review to every new page outside
`/owner`, every new public API exception, and every new server route outside
`/api`. Verify the anonymous and owner behavior from deployed requests. This is
a repository rule for future changes; it does not confirm that the live Access
configuration already matches this layout.

## Meal flow

1. Telegram sends a photo update to the ingest Worker.
2. The Worker checks the webhook secret and the exact allowed Telegram user and chat IDs.
3. The Worker records the Telegram update, meal, and analysis job in D1.
4. The Worker sends only the job ID to the Queue and returns HTTP 200.
5. The Queue consumer downloads the selected Telegram image and streams it to private R2.
6. The consumer creates a five-minute signed image URL.
7. The configured `MealAnalyzer` adapter sends the caption and image URL to the AI service.
8. The consumer validates the structured result and recalculates totals from the returned items.
9. The consumer stores the meal items and AI usage in D1.
10. The bot sends the estimate and correction help to Telegram.

## AI boundary

Application code depends on the `MealAnalyzer` interface. It does not depend on OpenRouter request or response types.

The first adapters are:

- `OpenRouterMealAnalyzer`, the default;
- `XaiMealAnalyzer`, the direct-provider escape path; and
- a factory that selects an adapter from configuration.

Both adapters return the same canonical meal result. The result includes item nutrition, assumptions, confidence, follow-up questions, model identity, token use, latency, and normalized cost.

OpenRouter requests use an explicit model list, JSON Schema output, `require_parameters`, zero-data-retention routing, and provider data-collection denial. The upstream model that handled the request is recorded in D1.

## Privacy boundary

- R2 is private.
- Dashboard photo requests require the same server-side allowlist as other private API routes.
- AI image URLs are signed, limited to one object, and expire after five minutes.
- Secrets are Worker secrets. They are not D1 records or configuration values.
- Normal logs do not contain captions, photo URLs, AI payloads, or provider responses.
- The app can delete photos after a configured number of days while it keeps structured nutrition data.

## Reliability boundary

D1 is the durable source of job state. Queue messages are only delivery signals. Telegram update IDs and job state transitions make retries idempotent. A scheduled recovery pass finds jobs that are stuck in `pending` or `running` states.

## Product boundary

Calocount tracks calories, protein, carbohydrates, fat, meal photos, corrections, and optional manual weight entries. It does not contain WHOOP, Apple Health, body-fat, sleep, recovery, or step integrations.
