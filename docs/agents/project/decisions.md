# Calocount decisions

The project's own choices, with their reasons. Read this file when you read
[decisions](../decisions.md).

## The port onto the template

- The old app moved to `legacy/` and keeps running until the new app has each
  workflow. The black-box tests run against it first, so that the rebuild has
  a fixed target. The same tests then run against the new app with no change,
  because they know only what a user sees.
- `BLACK_BOX_TARGET` selects `legacy` or `next` in
  `frontend/playwright.config.ts`. The default is `legacy` until the new app
  passes each black-box test. The change that makes `next` the default deletes
  `legacy/` and the `legacy` paths of the config and the fixture.
- `legacy/**` is marked `linguist-generated` in `.gitattributes`, so that the
  file size check skips the old app's large files. The old app changes only
  to get accessible names for the tests.

## The black-box tests on the old app

- `legacy/scripts/black-box-serve.mjs` starts two local Workers on one build:
  one with sign-in off, so that each browser is the owner, and one with
  passkey sign-in and a known setup code. A test with `authenticated: false`
  uses the passkey Worker. The template's fixture signs in with an email and
  a password, and the old app has passkeys only.
- The Workers run with `vite preview`, not `wrangler dev`. The dev proxy of
  `wrangler dev` stopped the Worker on the passkey sign-in request, with
  "Network connection lost".
- Each Worker has one database for a whole run, so the fixture empties it
  before each test through a reset route. The route exists only when
  `CALOCOUNT_BLACK_BOX` is `true`, which only the serve script sets.
- The tests use the real clock. The old Worker reads "today" from its own
  clock, so a browser clock alone would give the two sides different days.
  Each browser is in UTC, so that the owner's day and the browser's day
  match. A run across midnight UTC can fail.
- Passkeys come from a Chromium virtual authenticator that says yes to each
  request (the `passkeyDevice` option and `otherDevicePage`).

## What the new app keeps

- **No Access mode, and no `/api/add-meal`.** Each instance signs in with
  passkeys, and ChatGPT uses the MCP endpoint. No instance used Access mode or
  the old Custom GPT route when the port started, so the new app has neither,
  and their old tests have no new place.
- **Calocount's own stylesheet.** The new React frontend keeps the old app's
  look from `legacy/app/globals.css`, with its palette and dark mode. It does
  not use the template's shared UI components.
- **API black-box tests for the routes that no page calls.** The MCP endpoint,
  OAuth, the public summary JSON, `/llms.txt` and the export routes have no
  page, so the black-box tests cannot reach them, and an integration test
  starts from a UI Logic method. These tests call the running app over HTTP as
  an outside client does, and run against both targets, as the black-box
  tests do. See [rules](rules.md).

## D1 and passkeys

- **The backend runs on Cloudflare Workers with D1.** `core/database/` has a
  Kysely dialect for a D1 binding (`d1-dialect.ts`), and `atomic` replaces
  `transaction()`: a Logic class plans statements with the `plan*` methods of
  Storage, and one D1 `batch()` runs them. The design comes from my-own-maps.
  The Worker entry is `core/server/worker.ts`, and `core/live/index.ts` builds
  the App from the Worker bindings.
- **The tests run on `node:sqlite`.** `core/tests/node-sqlite-d1.ts` has the
  shape of a D1 binding, with the limits of D1. It runs the files of
  `backend/migrations` in the order of their names.
- **`backend/migrations/0000` to `0016` are the SQL files of the old app, under
  their old names.** The production D1 database recorded those names as
  applied. Its tables keep their old columns (`ADOPTED_TABLES` in
  `core/database/table-kinds.ts`). A new table or change is a new file from
  `0017_<name>.sql` up, and a new table has the columns of `BaseTable`.
- **Sign-in is passkeys only, with the old app's rules.** The sign-in routes
  keep the paths and the JSON of the old app under `/api/auth`. The tables
  `passkeys`, `auth_sessions`, `auth_challenges` and `auth_attempts` are the old
  ones, so the passkeys and the sessions of the owner keep working. A session
  lasts 180 days of non-use and renews after a day of use. The secret
  `CALOCOUNT_SETUP_CODE` saves a passkey without a session, also when passkeys
  exist, and 10 wrong codes of one network (50 of all networks) in 15 minutes
  stop it. `CALOCOUNT_OWNER_KEY` (default `default`) keys the owner's rows.
- **The PostgreSQL migration system stays on disk, unused.** The migration
  check reads it, and the project takes it over in beads issue
  `calocount-bcx.7.1`. `backend/tsconfig.json` leaves out the two files that no
  longer compile, and `knip.jsonc` lists the unused ones.
