# Reusable boilerplate: plan and open work

The goal is a template repository that new projects start from, and that stays
current after the projects start. No item on this list is done. Close items as
work completes.

## Plan

- Make a separate template repository from this one, so that the two share Git
  history. Remove the product features (`encounter-lifecycle`,
  `patient-records`, `transcription`, `ai`) and replace the name `shadow`.
- Keep the template a runnable application with auth, an example feature, and
  their tests. A passing `pnpm run check` is then the evidence that a
  dependency update is safe.
- Renovate opens one pull request for each dependency update, and CI runs the
  check on it. Small weekly updates replace one large update each year.
- Move changes between this repository and the template with cherry-picks. Put
  each template-level change in its own commit, so that the cherry-pick
  applies. When files have diverged too far, give an agent the template diff
  and the architecture documents and let it port the change.
- Do not publish shared packages yet. Files such as `compose-app.ts` exist to
  be edited in each project. The `lint/` plugins are the first candidate when a
  second project shows which parts stay the same.

## Renovate

Use the hosted Mend Renovate Community Cloud. It is free for public and private
repositories. Its limits are one job at a time for each organization, one run
every 4 hours, and 30 minutes for each job. These limits are sufficient for one
template repository.

Setup:

1. Install the Renovate GitHub App on the template repository only.
2. Merge the onboarding pull request, then replace its `renovate.json` with the
   configuration below.
3. Turn on "Allow auto-merge" in the repository settings, and make the CI check
   a required status check on the default branch. Without a required check,
   GitHub can merge a Renovate pull request before CI finishes.

Facts that the configuration depends on:

- The npm manager updates `engines`, `packageManager`, `devEngines.runtime`,
  and `devEngines.packageManager`. The nvm manager updates `.nvmrc`. The GitHub
  Actions manager updates the `version` input of `pnpm/action-setup`.
- `scripts/check-node-version.mjs` fails the check when one Node location
  differs from `.nvmrc`. On the first Node update, confirm that one pull
  request changes all three locations.
- `hono` is in two workspaces. Both must stay at the same version.
- Do not merge `oxlint`, `better-auth`, or `typescript` automatically. The
  `lint/` rules use oxlint's JS plugin support, which oxlint marks as alpha. A
  Better Auth update can change its schema, so compare `AuthTables` in
  `backend/src/features/auth/storage/types.ts` with the new schema.
- `kysely`, `@hono/zod-validator`, and `@electric-sql/pglite` are 0.x
  versions, so a minor version can break their API.

Draft configuration. It is not validated yet. Check it with
`pnpm dlx --package=renovate renovate-config-validator` before use.

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    "schedule:weekly",
    ":maintainLockFilesWeekly"
  ],
  "minimumReleaseAge": "3 days",
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "automerge": true
    },
    {
      "matchCurrentVersion": "<1.0.0",
      "automerge": false
    },
    {
      "matchPackageNames": ["oxlint", "better-auth", "typescript"],
      "automerge": false,
      "labels": ["review-upgrade"]
    },
    {
      "groupName": "React",
      "matchPackageNames": [
        "react",
        "react-dom",
        "@types/react",
        "@types/react-dom"
      ]
    },
    {
      "groupName": "Vitest",
      "matchPackageNames": ["vitest", "@vitest/*"]
    },
    {
      "groupName": "pg",
      "matchPackageNames": ["pg", "@types/pg"]
    },
    {
      "groupName": "Node",
      "matchPackageNames": ["node", "@types/node"]
    }
  ]
}
```

Renovate, not Dependabot, because of what Dependabot did not support in
October 2026:

- An open issue (dependabot-core #13722) reports that Dependabot cannot update
  dependencies when `devEngines` is an object, which is the form in this
  repository's `package.json`.
- Dependabot does not update `.nvmrc`. It updates only the action version in
  workflows, not the pnpm `version` input.
- pnpm 12 support was merged on 15 September 2026, and GitHub's documentation
  still lists only pnpm 7 to 10.
- Dependabot has no lockfile maintenance, so transitive dependencies change
  only through security updates. Automerge needs a separate workflow.

Keep Dependabot alerts on. They are free and do not conflict with Renovate.

If the hosted service stops being free, run Renovate from a scheduled workflow
with `renovatebot/github-action`. It needs a GitHub App token or a personal
access token, because pull requests that the default `GITHUB_TOKEN` opens do not
start CI. On a private repository, each run uses the plan's Actions minutes.

## What the template still needs

Checked items are done. Item 18 is the next one to do. Items 12 to 17 wait until the
template repository is made.

### Gaps that stop the first real feature

- [x] 1. **Migrations for application tables.** `pnpm run db:migration:create`
      creates a migration and `pnpm run db:migrate` applies them. The rules are
      in [code architecture](../code-architecture.md#database-schema).
- [x] 2. **A complete example feature.** The `notes` feature lists, creates,
      changes, and deletes the signed-in user's notes. Its two forms share a
      LogicPlugin that keeps unsaved text in a frontend Storage class. One
      part is still open. The API example in `examples`
      ([api-example-logic.ts](../../../frontend/src/features/examples/ui/api-example-logic.ts),
      [api-client.test.ts](../../../frontend/src/features/api/client/api-client.test.ts))
      calls the `encounters` routes, so the template must drop it or point it
      at `notes`.
- [x] 3. **A transaction rule.** Backend Logic runs several writes in
      `this.deps.transaction()`, also across features; see
      [code architecture](../code-architecture.md#transactions).
- [x] 4. **Field errors in the client.** A task with `<name>FieldErrors` in
      its state gets a message for each field that the backend refuses; see
      [code architecture](../code-architecture.md#backend-handlers).

### Run and deploy

- [x] 5. **A development loop.** `pnpm run dev` starts the backend and the
      frontend in watch mode; see [setup](../setup.md).
- [x] 6. **A local database.** `pnpm run dev` starts an embedded PostgreSQL
      when no database answers at `DATABASE_URL`; see [setup](../setup.md).
- [ ] 7. **A deployment path.** Host-specific files stay out of the template.
      Done: the health routes, JSON logs, and the production notes in
      [setup](../setup.md). Open: an option for the backend to serve the
      frontend build from one origin.
- [x] 8. **Health routes.** `GET /health` and `GET /health/ready`.
- [x] 9. **Logging.** The logger Core Service, a request log with request IDs,
      and a lint rule against `console`. Error tracking is still open in
      [initial setup](initial-setup.md).
- [x] 10. **Security defaults.** Security headers, a request size limit, rate
      limits in every environment with counts in the database, and a caller
      address that the caller cannot forge. A content security policy for the
      page is open, and belongs with item 7.
- [x] 11. **A React error boundary.** One around the route outlet and one
      around the app. No automated test covers them; item 18 can.

### Template mechanics

- [ ] 12. **A `README.md` and a `LICENSE`.** All current documents are for
      agents.
- [ ] 13. **One location for the name.** `shadow` is in 36 files. Use a neutral
      package scope such as `@app/common`, and keep the display name and the
      environment variable prefix in one location each.
- [ ] 14. **Skills for template work.** Add a skill that adds a feature (about
      seven composition files change), a skill that renames a new project, and
      a skill that syncs changes from the template.
- [ ] 15. **A decision on the default auth policy.** `ownerEmail` goes through
      `composeApp` and the test fixture. Decide if the template default is one
      owner or open sign-up, and document how to change it.
- [ ] 16. **A record of the template version.** Each project needs a file that
      names the template commit it started from, so that a later sync has a
      start point.
- [ ] 17. **Remove stale references.** `.oxlintrc.json`, `knip.jsonc`, and
      `.prettierignore` name `all-in-one-app-boilerplate/`, which Git does not
      track.

### Protection for automatic updates

- [ ] 18. **A browser test of the built app.** No test renders `routes.tsx` or
      `main.tsx`, so a React Router or Vite major update can pass the check and
      still break the app. One Playwright test that signs in and opens a page
      catches this. It also covers the manual checks in
      [testing](../testing.md).
- [ ] 19. **Stricter TypeScript options.** Only `strict` is on. Add
      `noUncheckedIndexedAccess`, `noImplicitOverride`, and
      `exactOptionalPropertyTypes` while the codebase is small.

### Out of scope

Do not add email, background jobs, file upload, or a component library to the
template. Each project needs different ones, and each adds dependencies that
Renovate must keep current.
