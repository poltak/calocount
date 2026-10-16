---
name: start-project
description: Start a new project from the template repository, keeping its Git history so that the project can take later template changes. Use when asked to create a new project, app, or repository from this boilerplate, or to set up a fresh clone of the template as a project.
---

# Start a project from the template

A project is a clone of the template with a second remote. It keeps the
template's history, and with that history it can take later template changes.
Read `docs/agents/template.md` first.

`scripts/start-project.mjs` makes every change, so each project starts in the
same way. Do not make its changes by hand, and do not change a file before it
runs.

## Ask the person first

- The project's name, for the package and for the database. It has lowercase
  letters, digits, and hyphens.
- The product name that users read.
- The URL of the project's new, empty repository. Do not create it yourself.
- The account mode. `single-owner` is for one owner. With `open-sign-up`, each
  visitor can make an account.
- Whether the project runs Renovate itself. Usually it does not, and it takes
  its dependency updates from the template.

## Workflow

1. Clone the template, and go into the clone:
   ```sh
   git clone <template URL> <project name>
   cd <project name>
   ```
2. Run the workflow with Swamp. Add `--input renovate=keep` only when the
   project runs Renovate itself.
   ```sh
   swamp workflow run start-project \
     --input projectName=<project name> \
     --input productName="<product name>" \
     --input originUrl=<project URL> \
     --input accountMode=<account mode>
   ```
   When Swamp is not installed, run the steps of the workflow yourself, in
   this order:
   ```sh
   pnpm install --frozen-lockfile
   pnpm exec node scripts/start-project.mjs prepare \
     --project-name <project name> --product-name "<product name>" \
     --origin-url <project URL> --account-mode <account mode>
   pnpm run check
   pnpm run test:browser:install
   pnpm run test:browser
   pnpm run test:live-start
   pnpm exec node scripts/start-project.mjs finish
   ```
3. Tell the person the three steps that are left. The first is to create
   `.env`, as `docs/agents/setup.md` describes. The second is to push, with
   the command that the last step prints. Push only when the person asks for
   it. The third is to set the maintainers and the label of the
   "Template-owned files" check, with the commands in `docs/agents/setup.md`.

## What the script does

- It renames the remote `origin` to `template`, and adds the project's
  repository as `origin`.
- It sets the package name, the product name in `APP_NAME`, and the database
  name in `.env.example`.
- For open sign-up, it sets the mode in `.env.example` and in the setup of the
  browser tests.
- It writes a new `README.md`, and `template-version.json` with the template
  commit that the project started from.
- It gives the project its own ID for Swamp, in `.swamp.yaml`.
- It removes the files that only the template needs. `templateOnly` in
  `scripts/template-paths.json` lists them, and this skill is one of them.
- The last step makes one commit, and removes the script and its workflow.

## Gotchas

- Do not use GitHub's "Use this template" button or a fork.
  `docs/agents/template.md` gives the reasons.
- The project keeps the notes example, because it is the model for a feature.
  Use the `remove-example` skill later, when the project has a feature of its
  own.
- `prepare` checks everything before its first change. When it reports a
  problem, the clone is as it was. Correct the input, and run it again.
- When `prepare` reports that a file does not have the text for an edit, the
  template changed that file. This is a defect of the template. Correct the
  edit in `scripts/start-project.mjs`, in the template repository.
- When a check fails after `prepare`, correct the cause. Then retry the failed
  step with the command that Swamp prints, or run the remaining commands
  yourself.
