---
name: sync-template
description: Bring later changes from the template repository into a project that started from it, by merge or by cherry-pick. Use when asked to update a project from the template or boilerplate, to take the template's dependency updates, or to pull one template fix into the project.
---

# Take changes from the template

A project has the template as a second remote, named `template`, and shares
its history. `docs/agents/template-version.md` names the last template commit
that the project has.

## Workflow

1. Check that the working tree is clean, then fetch:
   ```sh
   git fetch template
   ```
2. Read the last template commit from `docs/agents/template-version.md`. List
   what is new:
   ```sh
   git log --oneline <last commit>..template/main
   ```
3. Read each commit with `git show <commit>`. Sort the commits into three
   groups, and show the person the list before you change anything:
   - **Take.** Dependency updates, fixes, and changes to shared code.
   - **Skip.** Changes to files that only the template has: its `README.md`,
     `renovate.json`, `docs/agents/template.md`, and the `start-project`
     skill. Also changes to an example feature that the project removed.
   - **Ask.** A change that replaces something the project has changed.
4. Select the method:
   - **Merge** when the project has changed few of the template's files:
     `git merge template/main`.
   - **Cherry-pick** when it has changed many, or when the person wants only
     some commits: `git cherry-pick -x <commit>` for each one, oldest first.
5. Resolve each conflict in favor of the project's own code, and then apply
   what the template commit intended. When a file has changed too much for
   that, do not force the patch. Read the template's diff and make the same
   change by hand.
6. Run `pnpm install`, then all the checks:
   ```sh
   pnpm run check
   pnpm run test:browser
   pnpm run test:live-start
   ```
7. Write the new last template commit in `docs/agents/template-version.md`.
   After a cherry-pick of only some commits, write the newest commit up to
   which every commit was taken or deliberately skipped, and list the skipped
   commits below it.
8. Commit when the person asks for it.

## Gotchas

- A template migration has a timestamp. The project's migrator accepts one
  that is older than a migration that already ran, so take it as it is. Do not
  rename it.
- When the lockfile conflicts, take the project's `pnpm-lock.yaml`, then run
  `pnpm install` to bring it up to date.
- A Better Auth update can change its tables. Compare `AuthTables` in
  `backend/src/features/auth/storage/types.ts` with the new schema, and run
  `pnpm run test:live-start`.
- Do not push to the `template` remote from a project. A change for the
  template goes to the template repository as its own commit.
