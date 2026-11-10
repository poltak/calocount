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

## One Worker on one origin

- **The new app is one Cloudflare Worker.** It serves the API and the built
  frontend (Workers static assets) on one origin, as the old app does. The page
  calls the API on its own origin, so a deployment sends no CORS headers and
  the cookie is first-party. `frontend/dist` is the assets directory. A path
  that is not a file gets `index.html`, and the Worker answers `/api/*`,
  `/health`, `/health/*` and the paths that later phases add (`/mcp`,
  `/oauth/*`, `/.well-known/*`, `/llms.txt`, `/meal-photos/*`).
- **`wrangler.jsonc` is at the repository root.** The Deploy to Cloudflare
  button reads the root. A button from a subfolder needs a folder that has all
  its inputs, and `backend/` imports the workspace package `common/`. The
  `cloudflare.bindings` descriptions are in the root `package.json`, and
  `.dev.vars.example` lists the secret. The config has the same Worker name and
  D1 database as `legacy/wrangler.jsonc`, so the new app can replace the old one
  on the same data. The R2, Images and cron settings are copied and unused until
  a later phase. `vars` hold only values that every instance shares.
- **The frontend is built with an empty `VITE_API_BASE_URL`.** `pnpm run build`
  sets it, so the page uses its own origin whatever a local `.env` says.
- **The reset route is `POST /api/__black-box/reset`.** It empties each app
  table between black-box tests, as the old app does. It exists only when
  `CALOCOUNT_BLACK_BOX` is `true`, which only `scripts/black-box-next.mjs` sets.
  `BlackBoxStorage` deletes, `BlackBoxLogic` plans the batch and refuses without
  the setting, and the HTTP app mounts the handler only when `config.blackBox`
  is on. An integration test shows that it is absent without the setting. The
  stored photos are not deleted yet, because no route stores one.
- **The `next` target signs in with passkeys.** There is one Worker, and a test
  with `authenticated: false` gets an empty instance. For `authenticated: true`
  the fixture uses a virtual authenticator, opens the sign-in page, and saves
  the first passkey with the setup code, as a real owner does, and gives the
  test that page. The template's separate frontend and backend origins and the
  email form no longer fit.
- **The `next` Worker runs with `wrangler dev` 4.158.0.** The "Network
  connection lost" stop of the dev proxy, which made the old app's serve script
  use `vite preview`, did not appear on the passkey sign-in. If it comes back,
  run the Worker through Miniflare directly.
- **The build checks of the template run on `next` only.** They use the passkey
  sign-in on the Worker (`core/tests/browser/`). The check of the header
  fallback is gone, because the app has no user name in its header.

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

## Entry photos

- **A photo is an R2 object, and the entry points at its key.** `PhotosStorage`
  wraps the `PHOTOS` bucket. The live root gives it the binding, and the test
  root gives `MemoryPhotoBucket`, so a test reads the bucket and can make one
  operation fail. Its storage key is `entriesPhotos`, because a Logic class may
  use only Storage whose key starts with its feature.
- **`POST /api/meals` and `PATCH /api/meals/:id` take JSON or multipart.** A
  multipart form has the entry as JSON in `payload` (or as single fields) and
  the file in `photo`. The reader counts the bytes as it reads, so a body that
  lies about its length stops at 11 MiB (the photo limit of 10 MiB, and a margin).
  A JSON body keeps the limit of 100 kB. The form cannot set `photoKey`: a
  caller sends a new file or leaves the photo as it is. The types JPEG, PNG and
  WebP are checked against the first bytes of the file. The dashboard does not
  take HEIC. Only `add_meals` converts it (see "MCP photos" below).
- **The file goes to the bucket before the entry is saved,** because the entry
  needs the key. A failed save deletes the new object. A replaced or deleted
  photo is deleted after the save, and only when no other entry uses the key:
  a copy shares the key of its source, so the object lives until the last
  reference goes.
- **`GET /api/photos/<key>` sends the photo to the owner whose entry uses the
  key.** A key that no entry of the owner uses is a 404, so a key of another
  owner gives nothing. The key has one encoded segment at a time; a control
  character or `..` is a 400.
- **The hourly `scheduled` handler runs `PhotoCleanupLogic`.** It lists the
  `meals/` prefix in bounded runs (100 objects a page, 10 pages), deletes objects
  that are older than 24 hours and that no entry uses, and keeps its place in
  `__calocount/photo-cleanup-cursor.json` in the same bucket. A damaged or stale
  place sends the next run back to the start, which is safe.
- **A client types the multipart request as JSON.** The Hono client types the
  `json` argument of the route. A photo upload gives the same entry there, and
  replaces the body with the form in `init` (`photoUpload` in `entry-form.ts`).

## The public view

- **`/` is the public page, and `/owner` is the owner dashboard.** The public
  page needs no session. It reads only `GET /api/public/summary` (the views
  `daily`, `month` and `day`), and it has no control that changes data. While
  the owner keeps the public view off, the routes answer 404 with the code
  `public_view_off`, and the page opens `/owner`, which asks for the sign-in.
  `/llms.txt` follows the same switch. A new owner starts with the view off,
  and an owner who had it on keeps it on.
- **The public routes read through the Logic classes** of `entries`, `settings`
  and `weights`, in `backend/src/features/public-view/handlers/`. They never
  read the Storage of those features. `utils/public-projection.ts` lists each
  public field by name, so a new private column cannot reach a visitor.
- **Days count in the saved timezone of the owner,** and in UTC when it is
  missing or invalid. The daily view keeps the latest 366 days.
- **A request with no `view` is the old `dashboard` view.** It is the 30-day
  projection of food items and nutrients, with the old JSON (no `view` field):
  `readDashboard` in `public-view/handlers/public-dashboard-read.ts`. The
  weights are newest first, as the old app listed them. `view=dashboard` is the
  same view, and `/llms.txt` describes it again.
- **`GET /meal-photos/<entry ID>` serves the photo of an entry to a visitor.**
  The URL holds the entry ID, so the R2 key stays private. It answers only
  while the public view is on, and only for a complete entry of the owner with
  a JPEG, PNG or WebP photo in the seven days that end today in the saved
  timezone (`public-photo-policy.ts`). Any other case is the same 404 body.
  A matching `If-None-Match` gets a 304.
- **The public page has a calendar and photo thumbnails.** The calendar is the
  panel of the history feature with `source: "public"`, which reads
  `GET /api/public/summary?view=month&month=YYYY-MM`. `routes.tsx` passes it to
  the page as a render prop, as it does for the owner dashboard.

## Insights

- **The insight panels read one route, `GET /api/insights`.** It returns the
  complete entries of the last 30 finished days and of today, counted in the
  timezone of the device, with the goals that the panels compare them with
  (the calorie target, the nutrient goals, the protein target of each date and
  the reference confirmations). Each read replaces the entries as a whole, so
  an edit or a delete cannot leave an old entry behind. The Logic reads again
  after an entry, settings or weight event, and when the window gets the focus.
- **The calculations are pure code in `common/features/entries/utils/insights/`.**
  They sit in `entries` because they use its nutrient code, and a feature may
  not import the private files of another. The public view and the MCP tools
  can use them later.
- **The panels have no "Inspect entry" action yet.** The old app opened the
  entry in the dashboard editor or in an editor for older entries. The new
  panels only list the entries.

## MCP photos

- **`add_meals` takes `photos` and `photo_meal_indices`.** The tool checks the
  values with the old messages and codes, downloads each photo, and stores it
  with the entry in one call. `EntriesLogic.createExternal` does the work with
  two Services in `core/services/`: `PhotoDownloadService` (`fetch`) and
  `ImagesService` (the Cloudflare `IMAGES` binding). The photo key uses the
  entry ID `meal_external_<request ID>`, as the old app did.
- **Only the file hosts of ChatGPT are fetched,** over HTTPS with no port and
  no credentials (`files.openai.com`, `*.oaiusercontent.com` and Azure Blob
  account hosts). A Worker started for the black-box tests (`CALOCOUNT_BLACK_BOX`)
  also fetches `http://localhost` and `http://127.0.0.1`, so that an API test
  can serve an image. No deployment has this switch.
- **A redirect is a failed download.** Workers do not implement
  `redirect: "error"` and `fetch` throws on it, so the Service uses `manual` and
  rejects a 3xx answer.
- **A failed download saves the meal without the photo** and adds
  `photo_status: "download_failed"` to its result. Any other photo problem
  (type, size, content, conversion) saves no meal and gives the tool error with
  the old code. A retry of a saved request ID does not download again.
- **HEIC becomes a JPEG through `IMAGES`.** A Worker with no `IMAGES` binding
  (a plain `wrangler dev`) refuses HEIC with `image_conversion_unavailable`, as
  the old app did. The local binding of `wrangler dev` has no HEIC decoder, so
  the API tests accept `image_conversion_failed` or `image_conversion_unavailable`
  there.
