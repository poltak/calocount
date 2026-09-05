# Code audit — 5 September 2026

This audit covered the dashboard, nutrition calculations, API routes, database repository and migrations, ingest Worker, photo lifecycle, service worker, tests, build settings, and deployment workflow. Three reviewers used GPT-6 Astra with Medium reasoning. The main agent reviewed their changes and ran the final checks.

The changes address confirmed defects. They do not add dependencies or change the database schema. The existing untracked `gpt-action.md` and `gpt-instruction.md` files were preserved. The audit and fixes did not push, deploy, or change production data. Commits were created later at the user’s request.

## Fixed defects

| Area | Defect and change | Test evidence |
| --- | --- | --- |
| Meal queries | Loading items for up to 500 meals could exceed the D1 binding limit. Queries now use groups of 99 meal IDs plus the owner filter. | The test enforces the binding limit, returns all 500 meal/item pairs, and excludes another owner's item. |
| Meal updates | A single insert for many replacement items could exceed the binding limit. Each item now has its own statement in the same batch as the meal update and revision. | A 100-item update stays within the statement limit and keeps one batch. |
| AI and Telegram errors | A plain-text HTTP error could lose its status and retry policy. HTTP 429 and server errors now retain that policy. | Tests cover plain-text success/error boundaries, including permanent and retryable errors. |
| AI body reads | A response-body abort or connection failure could become a permanent parsing failure. These failures now remain retryable. | Streams that throw an abort or connection error exercise the actual adapter. |
| Queue recovery | Failed queue delivery after stale-job reset could leave a retry job outside later recovery scans. Cron now selects old, due pending/retry jobs too. A fresh processing claim cannot be reset. Stored retry delay matches queue backoff. | SQLite tests execute the real SQL and cover lost delivery, later recovery, backoff, and duplicate claims. |
| Meal editor | Reducing a total below the other items' sum only clamped item 1. The saved total could exceed the entered value. A typed helper now keeps submitted item totals consistent and removes the broad type cast. | Tests cover large reductions, zero totals, ordinary edits, unchanged input, and empty/single-item meals. |
| Browser storage | Accessing `window.localStorage` could throw before the storage helper's fallback ran. Storage acquisition now occurs inside the protected call. | Tests use a throwing property getter and a working lazy storage supplier. |
| Settings | A timezone-shaped string could pass validation despite not being a supported timezone. The route now uses the existing runtime timezone validator. | A Worker-runtime test checks rejected names and accepted timezone names. |
| Meal timestamps | Finite numbers outside the JavaScript Date range could enter meal create, edit, and copy paths. The routes now check the date range. | A Worker-runtime test checks invalid values and a valid value on all three routes. |

## Follow-up changes

The user requested fixes for the remaining findings, excluding Telegram-specific work. Three luna workers made these follow-up changes. The main agent reviewed the changes and ran the final checks.

- Multipart parsing now reads through a bounded buffer before `formData()`. Actual byte counts enforce the cap even without Content-Length or with a false low value. Overflow cancels the source. Tests cover those cases, malformed input, the exact cap, and valid uploads.
- Meal edits now use a separate draft. Dashboard totals and stored meal values change only after a successful save. Cancel, closing the editor, opening another editor, and selecting another date discard the draft and staged photo. Failed saves retain the draft for retry.
- The dashboard clock updates at minute boundaries and on focus or visibility changes. The average can update at 21:00 without a meal-data reload. It also retains the last completed day after local midnight when the displayed chart still ends on yesterday. Timers and event listeners are removed on unmount.
- Shared photo cleanup now stores its continuation cursor in the private R2 bucket, outside the `meals/` prefix. Later bounded runs can reach later objects. The age and database-link checks remain in place. This cleanup serves dashboard and external-API photos as well as Telegram photos, so it is included in the follow-up.
- `.github/workflows/check.yml` runs checks for pull requests targeting `main` or `master`. It uses read-only repository permissions, has no production secrets, and does not deploy or migrate data.

## Excluded Telegram finding

**AI save is not atomic.** In `workers/ingest/jobs.ts`, `saveMealAndTrace` marks the meal complete, deletes items, and inserts replacements through separate writes. A later failure can leave incomplete data. This Telegram ingest finding was excluded at the user's request. Telegram support has not been removed in this patch. If this path is retained, use a guarded atomic batch and test actual database state after each injected failure. Preserve the photo-conflict rule: a zero-row UPDATE must not permit later writes.

## Test and code improvements

- Keep the new behavior tests. Source-text assertions in files such as `tests/dashboard-async-actions-rendered.test.mjs` prove that code patterns exist; they do not prove request ordering, focus, cancellation, or rollback. Replace those checks in steps with browser interaction tests before changing the dashboard state model.
- Expand SQLite/Worker tests for persistence failures. Recording database doubles are useful for SQL shape and binding counts, but do not establish transaction rollback or all database constraints.
- Split the large dashboard component by state ownership after interaction tests exist. Extract the meal editor and async action state first. A broad file split without those tests would add risk without proving better behavior.
- Keep pull-request checks separate from the production deployment workflow. Configure branch protection in GitHub if these checks must block a merge.
- Keep dependency upgrades separate from this patch. No registry vulnerability scan, dependency upgrade, live Cloudflare review, or live provider request was part of this audit.

## Validation

The main agent ran `pnpm run check` on the combined changes: TypeScript, ESLint, build, and all 235 tests passed. No tests were skipped. The new SQLite tests emit Node's experimental SQLite warning on the local Node 22 runtime.

Both `pnpm run deploy:dry` and `pnpm run ingest:deploy:dry` passed and printed `--dry-run: exiting now.`. No Worker was deployed.

The six migrations applied successfully to a fresh in-memory SQLite database. Integrity and foreign-key checks passed. Drizzle migration snapshot validation passed.

Browser interaction checks used the actual Dashboard component in an isolated local fixture with mock API responses. The main agent first reproduced the old draft defect, then confirmed these corrected flows:

- Editing a meal from 600 to 100 calories leaves the saved row, daily totals, and average unchanged before save.
- Cancel, closing the editor, and changing days discard the draft; reopening shows 600 calories.
- A failed save keeps the 100-calorie draft while the saved meal and totals remain at 600.
- A successful retry commits the server result, updates the totals to 100, and closes the editor.
- Advancing the clock past 21:00 changes the displayed average from 1,200 to 1,043 without reloading meal data.

No browser runtime errors were recorded. Automated tests cover draft item isolation, editor switching, clock cleanup and midnight, streamed upload limits, and cleanup across runs, including deletion and cursor-write failures. Device and production end-to-end tests were not run. Passing checks reduce regression risk; they do not prove that every production flow is free of defects.
