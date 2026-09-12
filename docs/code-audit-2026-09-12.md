# Code audit: 12 September 2026

All confirmed findings below are fixed and committed. The audit started at `4565564` on `main`. It covered dashboard state and rendering, API contracts, Access JWT verification, D1 queries and migrations, photo delivery and cleanup, exports, and test and CI checks. No subagents were used.

| Priority | Finding and implemented fix | Commit |
| --- | --- | --- |
| P1 | Dashboard history stopped at 500 meals. Today and trend totals could disagree. Read the complete date range with two meal/item queries and calculate all totals from the same records. | `d8bb58c` |
| P1 | Exports silently stopped at 10,000 meals and 500 AI runs, omitted weights, and used many item queries. Export all owned records in five queries. JSON includes weights; CSV includes nutrient values. Serialize the output as a stream. | `2024950` |
| P2 | Every public photo request rebuilt the dashboard, including requests that returned 304. Fetch only the six fields needed to check one meal's public photo access. Keep owner, status, date, MIME type, and conditional-request checks. | `fc71351` |
| P2 | The summary converted each meal's date repeatedly while calculating 30 trend days and seven nutrition days. Group meals by date once and reuse those totals. | `d8bb58c` |
| P2 | Photo-reference lookups and cleanup scanned the meal table. Add an index on photo key and owner. Real SQLite query-plan tests verify index use for both queries. | `dcd17fe` |
| P2 | Access verification fetched signing keys and imported a key for every request. Reuse key sets and imported keys with a five-minute expiry, bounded refresh and cache size, and a fetch timeout. Token signatures and claims are still checked on every request. | `e015bda` |
| P2 | Meal edits updated daily totals but left loaded charts stale. Merge current days into older trend history and reload the server summary after writes. | `55178b8` |
| P2 | Refreshes reset the selected day and removed drafts. Focus and midnight did not reload saved data. Keep selection and drafts, refresh on those events, and cancel or defer reads that overlap a write. | `55178b8` |
| P2 | Malformed API records became plausible zero totals or were silently dropped. Move parsing into its own module and reject invalid dates, numeric fields, meals, weights, and trend records. | `55178b8` |
| P2 | Source-text assertions passed while five UI defects remained. Replace the action-state assertions with browser tests. Add real SQLite tests for summaries, exports, photo queries, and API response contracts. Include browser checks in CI. | `55178b8` and backend commits above |
| P3 | The dashboard stored several flags for the same pending action. Use one action record for request guards and button state. Separate API parsing, trend merging, settings data, and settings UI from the page. The page fell from 2,109 to 1,686 lines, from 32 to 26 state hooks, and from 13 to eight refs. | `55178b8`, `d0e4978` |
| P3 | Public views downloaded the owner's settings form. Load that form only when the owner opens settings. A browser test checks when its module is requested. | `d0e4978` |
| P3 | Unused starter authentication and swipe code added misleading paths. Remove both modules, the obsolete swipe test, and an unused repository import. | `c06e3c6` |

## Measurements

These are local CPU and SQLite results, not production response times. The summary benchmark uses Node 22.22.3, an in-memory database built from the real migrations, one food item per meal, meals spread over 30 days, and the `Asia/Ho_Chi_Minh` timezone. Each measurement has three warm-up runs and 15 timed runs. There is no network latency.

| Summary input | Median before | Median after | Date conversions before → after | Queries before → after |
| --- | ---: | ---: | ---: | ---: |
| 90 meals | 12.12 ms | 2.42 ms | 3,015 → 185 | 6 → 5 |
| 500 meals | 59.75 ms | 7.57 ms | 16,197 → 595 | 11 → 5 |

The 500-meal case is about eight times faster. A final run of the saved benchmark returned 2.51 ms and 7.45 ms, with the same date-conversion and query counts. Re-run it from the repository root:

```sh
pnpm exec tsx scripts/benchmark-dashboard.ts
```

Public photo authorization now uses one metadata query instead of six summary queries for a 90-meal fixture, or 11 for a 500-meal fixture. A 10,001-row photo-reference fixture took 44.19 ms for 100 lookups before an index and 0.49 ms with the index. These timings also exclude network and R2 latency.

Three sequential JWT validations now share one certificate fetch. The export test verifies 10,001 meals and items, 501 AI runs, and 400 weights with five queries and no records from another owner.

The settings form is a separate 5,458-byte client chunk, or 1,714 bytes with gzip. It is absent from initial public and owner requests. Shared nutrition code remains in the initial module graph, so the change in the page chunk alone is not a measure of total transfer savings.

## Validation and delivery

- `npm run check` passed: TypeScript, ESLint, production build, 216 unit and integration tests, and 16 Chromium browser tests.
- Browser checks cover totals and charts after edits, double clicks, pending controls, failed saves and rollback, preserved drafts and day selection, slow reads, midnight, protein modes and weight fallback, retry, copying, duplicates, public controls, and deferred settings loading.
- Parser contract tests use actual private and public summaries from the repository and public projection. Unknown nutrients remain unknown.
- `npm exec drizzle-kit check` passed. The migration also ran against fresh in-memory databases during tests.
- Both dashboard and photo-maintenance deployment dry runs passed and printed `--dry-run: exiting now.`
- The saved benchmark, its TypeScript check, and its lint check passed.

The new index is in `drizzle/0007_index_meal_photos.sql`. It has not been applied to a saved local or production database. The normal deployment workflow applies migrations before deploying the Workers. No push or deployment was performed during this audit.

The export still materializes query results in Worker memory before streaming their serialization. It no longer has a silent row cap, but very large accounts remain subject to Worker and D1 resource limits. The browser suite uses a local API fixture; the SQLite suite verifies the repository queries. Neither is a live production check.

The only added dependency is Playwright for development and CI. Local checks need Node 22.16 or later and a one-time `pnpm exec playwright install chromium`; CI installs the browser and its system libraries.
