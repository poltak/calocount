---
name: sync-template
description: Bring later changes from the template repository into a project that started from it, and report a gap of the template. Use when asked to update a project from the template or boilerplate, to take the template's dependency updates, to pull one template fix into the project, or to report a change that the template needs.
---

# Take changes from the template

A project shares its history with the template. `template-version.json` names
the template and the last template commit that the project has.

`scripts/sync-template.mjs` takes the new template commits, so each sync has
the same steps and the same result. One step needs your judgment. That step
is a conflict that no rule of the script resolves.

## Workflow

1. Check that the working tree has no changes.
2. Run the workflow with Swamp:
   ```sh
   swamp workflow run sync-template
   ```
   When Swamp is not installed, run the steps of the workflow yourself, in
   this order:
   ```sh
   pnpm run template:sync plan
   pnpm run template:sync apply
   pnpm run template:sync verify install
   pnpm run template:sync verify check
   pnpm run template:sync verify browser
   pnpm run template:sync verify live-start
   pnpm run template:sync finish
   ```
3. Read the plan that the first step prints. It lists each new template
   commit, and what happens to it:
   - `take`: the script cherry-picks it. A line under the commit names each
     file that the project does not get from it.
   - `have`: the project has the change already.
   - `leave out`: it changes only files that the project is without.
   - `skipped`: a person left it out, and the version file has the reason.
4. When `apply` stops at a conflict, resolve it as the next section
   describes. Then retry the failed step with the command that Swamp prints,
   or run `pnpm run template:sync apply` again.
5. When a check fails, correct the code and commit the correction. Then retry
   the failed step.
6. Show the person the new commits. Push only when the person asks for it.

## Resolve a conflict

`apply` names the template commit and the files. `git show <commit>` shows
what the template changed, and its message gives the reason.

- Resolve each file in favor of the project's own code, and then apply what
  the template commit intended.
- When a file has changed too much for that, do not force the patch. Read the
  template's diff and make the same change by hand.
- Stage each file with `git add`. `apply` refuses a file that still has
  conflict markers, and a change that you did not stage.
- When the project must not get the commit, ask the person. Then leave the
  commit out, with the reason:
  ```sh
  pnpm run template:sync skip <commit> "<reason>"
  ```
- When the project replaced or deleted the file, and must not get any later
  change to it, ask the person to take the path over. Only a person at a
  terminal can run this command. Then run `apply` again:
  ```sh
  pnpm run template:sync own <path> "<reason>"
  ```

## Report a gap of the template

A gap is a change that the template needs and that a project cannot make, such
as an edit of a file in `templateOwned`, or a sync that stops at the same place
each time. A local workaround hides a gap from each other project, so report
it. First describe it to the person. When the person agrees, open an issue in
the template repository. `template-version.json` has its URL and the template
commit of the project:

```sh
gh issue create --repo <template URL> --title "<the gap>" --body-file <file>
```

In the body, give:

- The template commit, and the path of each file.
- What the project needed, and what stopped it.
- What the project did in place of the change.
- The change that you propose.

The template can have other readers than the project. Do not put the name of
the project, its data, or a secret in the issue.

## The rules of the script

- It takes the commits oldest first, with the author and the date of each
  one. The message of the new commit names its source, as `git cherry-pick -x`
  does.
- It leaves out each change to a file that the project is without. Such a
  file is one that only the template needs, or a file of the notes example
  after the project removed the example. `scripts/template-paths.json` has
  the lists.
- It leaves out each change to a path in `ownPaths` of
  `template-version.json`. The project took that path over from the template.
- It never takes the template's `README.md`.
- It merges a `package.json` by its keys. A template update of one dependency
  and a dependency that the project added then do not conflict. A conflict
  remains only when both sides changed one key to different values.
- It keeps the project's `pnpm-lock.yaml` when the template's change does not
  apply to it, and `verify install` brings it up to date. The project then does not
  get the template's updates of indirect dependencies.
- It writes the list of migrations again when a commit adds a migration.
- `finish` names each file that stopped `apply` in the message of its commit.
  `git log --grep="^- Conflict at"` lists the stops of past syncs. A file that
  appears often is a reason to report a gap to the template.

## Gotchas

- A commit that applies without a conflict can still be wrong for the
  project, such as one that removes a file that the project uses. Run
  `pnpm run template:sync plan` first when you do not know the new commits,
  and leave a commit out with `skip` before `apply`.
- A project can have a template commit before an older one. The change of
  the older commit can then go to only one of several equal lines, with no
  conflict. After a sync that changed a configuration file, compare the file
  with the template's file: `git diff <template remote>/main -- <file>`.
- A template migration has a timestamp. The project's migrator accepts one
  that is older than a migration that already ran, so take it as it is. Do not
  rename it.
- A Better Auth update can change its tables. Compare `AuthTables` in
  `backend/src/features/auth/storage/types.ts` with the new schema. The
  `verify live-start` step starts the server on a real database.
- To undo a sync before you push it, use the `git reset` command that `apply`
  prints.
- Do not push a branch of the project to the template's remote. A change for
  the template is a commit of its own, on a branch that starts from the
  template's `main`.
