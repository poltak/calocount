# Agent documentation

This directory holds project reference documents for coding agents. Keep the
root `AGENTS.md` short so both Codex and Claude Code receive the same core
instructions.

## Documents

- [Code architecture](code-architecture.md): the rules. Read before changing
  code in any workspace.
- [Testing](testing.md): what a test contains and how to write one. Read
  before writing or changing a test.
- [Decisions](decisions.md): choices specific to this project and their reasons.
  Read before changing a framework, authentication, the API transport, or test
  setup.
- [Setup and commands](setup.md): read to run, configure, or check the project.
- [The template](template.md): how a project starts from this repository, how
  it takes later changes, and how dependency updates work. Read before work on
  the template itself.
- [Open work](todos/initial-setup.md): unfinished work and temporary behavior.
  Read and update it as work completes.

## Where to start reading the code

| To understand                                  | Start at                                                      |
| ---------------------------------------------- | ------------------------------------------------------------- |
| How the backend is assembled                   | `backend/src/features/core/compose-app.ts`, `…/core/types.ts` |
| Live and test backend setup                    | `backend/src/features/core/live/`, `…/core/tests/`            |
| Backend routes and startup                     | `backend/src/features/core/server/`                           |
| Errors and request validation                  | `backend/src/features/core/errors/`, `…/core/handlers/`       |
| How the frontend is assembled                  | `frontend/src/main.tsx`, `frontend/src/features/core/`        |
| Pages and routing                              | `frontend/src/features/core/ui/routes.tsx`                    |
| Calling the backend                            | `frontend/src/features/api/client/`                           |
| Logic and events                               | `common/src/features/core/`                                   |
| Logging and Core Services                      | `common/src/features/core/services/`                          |
| Request log and request IDs                    | `backend/src/features/core/handlers/`, `…/core/server/`       |
| A complete backend feature                     | `backend/src/features/health/`                                |
| A feature with its own table and pages         | `backend/src/features/notes/`, `frontend/src/features/notes/` |
| A LogicPlugin that two Logic classes share     | `frontend/src/features/notes/ui/note-draft-plugin.ts`         |
| A Logic that reacts to another Logic's event   | `…/auth/ui/auth-logic.ts`, `…/notes/ui/note-draft-plugin.ts`  |
| A frontend Storage class                       | `frontend/src/features/notes/storage/notes-draft-storage.ts`  |
| A write across two features in one transaction | `backend/src/features/notes/logic/notes-logic.ts`             |
| The architecture lint rules and their options  | `lint/`, `.oxlintrc.json`                                     |
| How a project takes template changes           | `scripts/sync-template.mjs`, `workflows/`                     |
| The test fixture                               | `frontend/src/features/core/tests/full-application.ts`        |
| A model integration test                       | `frontend/src/features/notes/ui/notes-logic.test.ts`          |
| The browser tests                              | `frontend/src/features/core/tests/browser/`                   |

## Where to add information

Do not describe what the code does; the code, its comments, and its tests do
that. Record only what a reader cannot get from the code:

- A rule that applies to any project built this way goes in
  [code architecture](code-architecture.md).
- A rule about what tests contain goes in [testing](testing.md).
- A choice specific to this project, with its reason, goes in
  [decisions](decisions.md). In a project made from the template, most of
  that file comes from the template. Add the project's own decisions there. A
  change to a decision that came from the template goes to the template
  first, and the project gets it with a sync.
- How to run or configure something goes in [setup and commands](setup.md).
- Unfinished work and temporary behavior go in `todos/`.

Add information to an existing document. Make a new document in
`docs/agents/`, or in a directory in it, only when the person asks for one.
Then add it to the list of documents at the top of this file, in the same
change, because an agent finds a document through that list.

Keep always-needed instructions in the root `AGENTS.md`. Do not create another
`AGENTS.md` or a `CLAUDE.md` for this repository. Put repeatable task workflows
in skills. Codex discovers repository skills in `.agents/skills/`; Claude Code
discovers them in `.claude/skills/`.

A workflow whose steps need no judgment is a script in `scripts/`, and a Swamp
workflow in `workflows/` runs it. Its skill names the workflow, and has only
the steps that need judgment. [Setup](setup.md#swamp) describes Swamp.
