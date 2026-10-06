---
name: start-project
description: Start a new project from the template repository, keeping its Git history so that later template changes can be merged. Use when asked to create a new project, app, or repository from this boilerplate, or to set up a fresh clone of the template as a project.
---

# Start a project from the template

A project is a clone of the template with a second remote. It keeps the
template's history, and with that history it can take later template changes.
Read `docs/agents/template.md` first.

## Ask the person first

- The project's name, for the package and for the database.
- The product name that users read.
- The URL of the project's new, empty repository. Do not create it yourself.
- The account mode: one owner, or open sign-up.
- If the project keeps the notes example for now. Keep it until the first real
  feature exists, because it is the model for a feature.

## Workflow

1. Clone the template and set the remotes:
   ```sh
   git clone <template URL> <project name>
   cd <project name>
   git remote rename origin template
   git remote add origin <project URL>
   ```
2. Replace the three names:
   - `name` in the root `package.json`.
   - `APP_NAME` in `common/src/features/core/utils/app-name.ts`.
   - The database name at the end of `DATABASE_URL` in `.env.example`.
3. Set the account mode. For open sign-up, set
   `APP_ACCOUNT_MODE=open-sign-up` in `.env.example`, and pass
   `accountMode: "openSignUp"` to `startTestBackendServer` in
   `frontend/src/features/core/tests/browser/global-setup.ts`.
4. Replace the template's own documents:
   - Write a new root `README.md` for the project.
   - Delete `docs/agents/template.md`, and remove its line from
     `docs/agents/README.md`.
   - Create `template-version.json`, as described below.
   - Delete `renovate.json`, unless the project will run Renovate itself.
   - Delete this skill: `.agents/skills/start-project/` and the symlink
     `.claude/skills/start-project`.
5. Remove the notes example, if the person does not want it. The
   `remove-example` skill has the steps.
6. Run the first-run steps in `docs/agents/setup.md`, then the checks:
   ```sh
   pnpm run check
   pnpm run test:browser
   pnpm run test:live-start
   ```
7. Commit, and push to `origin` when the person asks for it.

## The template version file

`template-version.json`, in the root of the project, records where the
project is in the template's history. `scripts/sync-template.mjs` reads and
updates it.

```json
{
  "template": "<template URL>",
  "commit": "<output of git rev-parse template/main>",
  "skipped": []
}
```

Add its line to the document list in `docs/agents/README.md`.

## Gotchas

- Do not use GitHub's "Use this template" button or a fork. Both lose what a
  later merge needs.
