# Agent instructions

These instructions apply to the whole repository. Use this file for rules that
Codex and Claude Code must follow on every task. Use `docs/agents/` for longer
project information. Read the documents that apply to the task.

## Repository

- This is a pnpm workspace with `backend`, `frontend`, and `common` packages.
- Use the Node version in `.nvmrc` and the pnpm version in `package.json`.
- Put code used by both apps in `common`. Code imported by `frontend` must work in a browser. Keep server-only code in `backend`.

## Checks

- Run `pnpm run typecheck` after TypeScript changes.
- Run `pnpm run build` after changes to compiled code or package exports.
- Check `git status` before and after edits. Preserve changes unrelated to the task.

## Project documentation

- Before changing, adding, moving, or deleting code in any workspace, read [docs/agents/code-architecture.md](docs/agents/code-architecture.md) and follow its rules.
- Use [docs/agents/README.md](docs/agents/README.md) to find project reference documents.
- Add stable project facts and decisions under `docs/agents/`. Update the relevant document when those facts change.
- Use a `SKILL.md` only for a repeatable task workflow. Keep general project rules and reference documents out of skills.
- Put new repository skills in `.agents/skills/<name>/`. For each skill, add a Git-tracked symlink at `.claude/skills/<name>` that points to `../../.agents/skills/<name>`, so Codex and Claude Code use the same files.
