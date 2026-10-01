# Plan: enforce architecture rules with lint

Status: planned, not started.

## Goal

Check as many rules from [code architecture](../code-architecture.md) as
possible with deterministic tooling in `pnpm run check`. An agent then learns of
a violation from a failing check, with a message that names the rule, instead of
relying on having read and applied the document correctly.

Mark each rule in the architecture document as enforced by lint or left to
judgment, so readers know which rules are verified automatically.

## Before starting

- [ ] **Finish the `src/` layout review.** Path-based rules can only classify
      files that sit in a role directory. These top-level entries are not yet
      classified. Backend: `index.ts`, `compose-app.ts`, `api.ts`, `server/`,
      `database/`, `logic/`, `storage/`. Frontend: `index.ts`, `main.tsx`,
      `app/`, `logic/`.
- [x] **Define a feature's public surface.** Done: `types.ts` files are public,
      `core` (and the frontend `api` feature) may be imported by any feature,
      and composition roots may import anything.
- [ ] **Decide the handler-to-Service case.** `requireSession` calls
      `services.auth.getSession` directly, while the dependency rules say
      handlers call Logic. Either route it through auth Logic or record
      transport-level authentication as an allowed exception.
- [ ] **Choose the tools.** See the options below.

## Tools

- **Import boundaries:** [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
  is the proposed tool. Its rules match importer and imported paths by pattern,
  it can tell type-only imports apart, it detects circular dependencies, and
  each rule carries a custom message. The alternative is more `overrides` with
  `no-restricted-imports` in `.oxlintrc.json`, which already enforces the
  workspace boundaries but becomes verbose for many path pairs.
- **Naming and shape:** small custom rules loaded through oxlint's `jsPlugins`.
  That support is alpha; it already loads the stylistic plugin in this
  repository. A standalone script is the fallback for checks on the file tree.

## Rules

Each rule's failure message should name the rule and link to its section of the
architecture document.

### 1. Import boundaries

These depend only on file paths and import types.

| Rule                                                                                                                                            | Source in the architecture document |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A feature imports another feature only through its `types.ts` files. Exceptions: `core`, the frontend `api` feature, and the composition roots. | Dependency flow                     |
| Files in `storage/` import nothing from `services/`, `logic/`, `ui/`, or `handlers/`.                                                           | Dependency flow                     |
| Files in `services/` import nothing from `storage/`, `logic/`, `ui/`, or `handlers/`, and no other Service implementation.                      | Dependency flow                     |
| A Logic file imports no other Logic class. LogicPlugins and types are allowed.                                                                  | Dependency flow                     |
| UI components import nothing from `storage/` or `services/`.                                                                                    | Dependency flow                     |
| Handlers import no Storage or Service implementation.                                                                                           | Backend handlers                    |
| `fake-*` files are imported only by the test root and test files. `live-*` files are imported only by composition roots.                        | Application setup                   |
| Only the live config module reads `process.env`.                                                                                                | Application setup                   |
| The frontend imports no vendor auth SDK.                                                                                                        | Where code belongs                  |
| No circular dependencies.                                                                                                                       | Dependency flow                     |
| No barrel files that re-export other modules.                                                                                                   | File organization                   |
| Workspace boundaries: the frontend imports only types from `backend/api`; `common` imports no Node built-ins. Already enforced by oxlint; keep. | File organization                   |

### 2. Naming and shape

These need custom rules or a script.

- A class in `services/` is named `*Service`. `live-x-service.ts` exports
  `LiveXService`, `fake-x-service.ts` exports `FakeXService`, and both implement
  the interface in the sibling `types.ts`.
- A class in `storage/` is named `*Storage`.
- A `*-logic.ts` file exports one class named `*Logic` that extends `Logic` or
  `LogicPlugin`. The Logic import rule above relies on this naming.
- Logic, Service, and Storage constructors take one `deps` parameter. Service
  and Storage classes declare it `private readonly`.
- A feature directory contains only known role directories.
- Every file under `src/` is inside a feature directory or on a short allow-list
  of top-level entries.

### 3. Left to judgment

These stay as written rules, checked in review:

- Business logic lives in Logic classes, not in Services, Storage, handlers, or
  components.
- Service and Storage classes stay thin and hold no application state.
- Backend Logic holds no per-request or per-user state.
- Use events, not direct calls, when one Logic reacts to another.

## Steps

1. Complete the items under "Before starting".
2. Add the import-boundary rules as warnings. List the existing violations.
3. Fix each violation or record it as a named exception in the rule.
4. Turn the rules into errors and add them to `pnpm run check`.
5. Mark the enforced rules in the architecture document.
6. Add the naming and shape rules the same way.
