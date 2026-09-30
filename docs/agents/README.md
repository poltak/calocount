# Agent documentation

This directory holds project reference documents for coding agents. Keep the
root `AGENTS.md` short so both Codex and Claude Code receive the same core
instructions. Link to new reference documents here and state when an agent
should read each one.

## Current reference

- [Code architecture](code-architecture.md): read before changing code in any workspace. It defines class roles, feature layout, and dependency direction.
- [Technology choices](../technology-choices.md): read when selecting or changing frontend or backend frameworks and tools.
- [Frontend setup](frontend-setup.md): read when changing frontend App composition, React hooks, or Vite configuration.
- [Backend API](backend-api.md): read when changing server startup, routes, or backend App setup.
- [Authentication](authentication.md): read when changing auth configuration, sessions, or account setup.
- [TODOs from initial set up](initial-setup-todos.md): read and update while initial setup continues. Record temporary behavior and unresolved decisions with code links; close items when resolved.
- [Full application test plan](full-application-test-plan.md): read when changing integration tests. It records the shared UI/backend/database fixture and its remaining limits.
- The root `AGENTS.md` has the workspace map and basic checks.
- The workspace packages are `backend`, `frontend`, and `common`. The `common` package is a local dependency of both apps through `workspace:*`.
- The root `pnpm run typecheck` command checks all three packages. The root `pnpm run build` command builds all three packages, including the frontend through Vite.

## Where to add information

- Add architecture, data flow, API contracts, and build or release notes as separate documents in this directory when they exist. Add a link here that says when to read each document.
- Keep always-needed instructions in the root `AGENTS.md`. Do not create another `AGENTS.md` or a `CLAUDE.md` for this repository.
- Put repeatable task workflows in skills when needed. Codex discovers repository skills in `.agents/skills/`; Claude Code discovers them in `.claude/skills/`. These are tool-specific discovery paths, so keep shared reference documents here.
