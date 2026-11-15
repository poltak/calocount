# Public read-only dashboard

Calocount has two dashboard entry points:

- `/` is public and read-only. It loads the configured owner's limited
  dashboard projection.
- `/owner` is private and read-write. It loads the normal owner dashboard and
  may call the private data APIs.

Meals are entered in the owner dashboard or through the private ChatGPT `/mcp`
app. This document covers the public and owner route boundary.

This document keeps its existing filename for repository continuity. The
application no longer creates or serves token-based links. The existing D1
`share_links` migration and schema declaration remain unused for non-destructive
compatibility; do not remove or alter them without a separate database decision.

## Data and route boundary

The Worker checks the passkey session on every private `/api/*` route. The
`/owner` page shows the sign-in page to a browser without a session.
[sign-in.md](sign-in.md) describes the sign-in.

| Path | Who can use it | Purpose |
| --- | --- | --- |
| `/` | public | Read-only dashboard UI |
| `/llms.txt` | public | Markdown discovery document for agents; links to the canonical public JSON projection |
| `/owner` and `/owner/*` | passkey session | Owner read-write dashboard |
| `/api/public/summary` | public | Explicit read-only dashboard projection, the daily view for agents at `?view=daily`, and the calendar views at `?view=month` and `?view=day` |
| `/meal-photos/*` | public, with server-side projection checks | Images for completed meals in the current public seven-day projection |
| `/api/*` in general | passkey session | Owner data and API write operations |
| `/mcp` | OAuth access token | ChatGPT meal logging, nutrition reads and weight reads |
| `/assets/*`, manifest, and required icons | public | JavaScript, CSS, and install metadata only |
| `/api/photos/*`, exports, settings, and other owner APIs | passkey session | Sensitive data and mutations |
| `/api/public/dashboard/summary`, `/api/public/days`, `/api/public/days/:date` and `/api/public/insights` | public | Read-only mirrors of the owner reads, which the public dashboard uses |

## Public view setting

The owner turns the public view on or off in the settings panel of the owner
dashboard, under "Public dashboard". The API field is `publicViewEnabled` on
`PATCH /api/settings`. The setting is off for an owner with no saved settings,
so a new instance starts private. Migration `0014_public_view.sql` turns it on
for each owner that already had saved settings.

While the setting is off:

- `/` redirects to `/owner`, so a visitor goes to the sign-in;
- `/api/public/summary` returns `404` with the code `public_view_off` for every view;
- `/meal-photos/*` returns `404`; and
- `/llms.txt` returns `404`.

The Worker reads the setting on each request. If the Worker cannot read the setting because the owner key or the
database is missing, `/` shows the public page and the data routes fail closed.

## Public summary

The public summary endpoint resolves the stable configured owner key. It fails
closed when that key is absent and returns `Cache-Control: no-store`. The
projection contains only the fields required by the dashboard:

- date, the owner's saved timezone, and calorie/protein targets, including the
  selected protein-goal mode and weight-derived protein target when configured;
- today totals;
- seven-day totals, averages, and trend points;
- recent completed meal totals, item nutrition, and whether a public photo is available; and
- recent weights.

The public summary counts days in the owner's saved timezone, and the public
dashboard shows days and meal times in that timezone for every viewer. The
timezone is UTC until the owner sets one in settings.

It does not contain owner keys, captions, notes, assumptions, confidence,
photo storage keys or MIME metadata, AI/provider data, private settings,
exports, or API credentials.
`backend/src/features/public-view/utils/public-projection.ts` implements the projection. Keep the
field list explicit when changing the public response.

### Daily view for agents

`/api/public/summary?view=daily` returns a second, much smaller projection on
the same path. The dashboard projection carries 30 days of food items and is
several hundred kilobytes. The daily view carries one row for each day and no
food items:

- the date, the owner's saved timezone, and the units of each amount;
- `firstEntryDate` and `firstWeightDate`, the days tracking began;
- `fromDate` and `toDate`, the days the rows cover;
- the current calorie and protein targets;
- `goalChanges`, the recorded changes of the calorie and protein goals, oldest
  first, so a reader can tell whether a goal was constant over a period; and
- for each day: calories, protein, carbohydrate, fat, the entry count, and the
  weight recorded that day or `null`.

The rows start on the first day with an entry or a weight and keep at most the
latest 366 days. This makes daily totals and weights older than the dashboard's
30 days public. The owner chose this on 2026-10-02. An unknown `view` value
returns `400`.

### Calendar views

The public dashboard has the same calendar as the owner dashboard. It reads two
more projections on the same path, with days counted in the owner's saved
timezone:

- `/api/public/summary?view=month&month=YYYY-MM` returns the calories, protein
  and entry count of each day of that month that has entries, and `firstDate`,
  the day the log starts.
- `/api/public/summary?view=day&date=YYYY-MM-DD` returns the completed entries
  of that day in the shape of `recentMeals`, the weight of that day, and its
  protein goal.

This makes the food items and weight of every past day public, where the
dashboard projection stops at 30 days. The owner chose this on 2026-10-10. A
missing or invalid `month` or `date` returns `400`. Photos keep the seven-day
limit: the day view reports `hasPhoto: false` for an older entry, and the photo
route still returns `404` for it.

The anonymous `/meal-photos/<mealId>` route intentionally makes the image for a
projected completed meal public to site viewers. It resolves the configured
owner, serves only completed meals from the last seven days in the owner's saved
timezone, accepts only JPEG,
PNG, and WebP objects, and streams the private R2 object without revealing its
storage key. ETags allow efficient browser reuse, but every request must
revalidate the projection so removed or expired access is not cached. Pending,
old, removed, malformed, and unprojected meals return `404`. The authenticated
`/api/photos/*` owner route remains private.

### Mirrors of the owner reads

The public dashboard is the owner dashboard with a public audience. It reads
four routes that mirror the owner reads. Each route answers `404` with the code
`public_view_off` while the public view is off, sends `Cache-Control: no-store`,
and counts days in the owner's saved timezone. It accepts a `timezone` query and
ignores it.

| Route | Owner read | What is different |
| --- | --- | --- |
| `GET /api/public/dashboard/summary` | `GET /api/dashboard/summary` | The profile is `owner` and the partner log switch is `false`. |
| `GET /api/public/days/:date` | `GET /api/days/:date` | Only complete entries. Each entry and weight is projected as below. |
| `GET /api/public/days?month=YYYY-MM` | `GET /api/days?month=YYYY-MM` | None. |
| `GET /api/public/insights` | `GET /api/insights` | The items have no `nutrientProvenance`, and both reference settings are `false`. |

Each public body has the same keys as the owner body, so the owner frontend
code reads both. A private field stays in the body with a fixed empty value:

- An entry keeps `id`, `consumedAt`, `mealType`, `status` and the four totals.
  It has `caption: ""`, `notes: null`, `assumptions: []`, `confidence: null`,
  `photoKey`, `photoMimeType` and `photoSizeBytes` as `null`, `source: ""`,
  `externalRequestId` and `savedEntryId` as `null`, and `createdAt` and
  `updatedAt` as `0`. It also has `hasPhoto`.
- An item keeps `id`, `mealId`, `name`, `quantity`, `unit`, the calories and
  macros, and every tracked nutrient. It has `source: ""`, `confidence: null`,
  and `createdAt` and `updatedAt` as `0`. It has no `nutrientProvenance`.
- A weight keeps `id`, `logicalDate`, `weightKg` and `recordedAt`. Its
  `createdAt` and `updatedAt` are `0`.

The item IDs, the weight IDs and the `source` of each nutrient goal are public.
The insight panels also make the nutrition of each item of the last 30 days
public. The code lists each field by name, so a new private column does not
reach a visitor.

The public dashboard must not call owner APIs. It calls only the routes under
`/api/public/` and `/meal-photos/*`. Every write API route must pass
the session gate before it reads or changes owner data. A public
request must never be able to add, edit, delete, correct, weigh, configure,
export, or upload data.

## PWA owner start

The PWA manifest starts at `/owner`. Its `id` and `scope` remain `/`, so the
installed app keeps the Calocount site identity while opening the private owner
dashboard. The manifest, icons, and generated static assets must be available
to the browser so installation can complete.

## Future route review rule

Treat routes as public by default unless the session gate covers them. Before
every deployment, explicitly review:

- every new page outside `/owner`;
- every new public API exception; and
- every new server route outside `/api`.

For each change, test both anonymous and owner behavior from the deployed
application. This rule is mandatory for future agents.

## Rollback

If the public page, projection, or authentication boundary is wrong, turn off
the public view in the settings, or redeploy the last known-good version of the
Worker. Keep the existing D1 migration history intact.
