# Architecture lint rules: status and open work

Most rules in [code architecture](../code-architecture.md) are now checked by
`pnpm run lint`. This document lists what is enforced, what is deliberately left
to judgment, and what remains to decide.

## How it is built

- The rules are a local plugin in `lint/`, written to the standard ESLint rule
  API. oxlint loads it through `jsPlugins`; ESLint could load the same files.
- `lint/architecture-plugin.mjs` holds rules about the architecture's shape.
  `lint/stack-plugin.mjs` holds rules tied to this project's technology
  choices. Keep that separation: a project with the same architecture and a
  different stack would change only the stack rules.
- `lint/testing-plugin.mjs` holds the rules for UI Logic tests. They are listed
  in [testing](../testing.md).
- Rule options, such as the list of role directories, live in `.oxlintrc.json`.
- `lint/plugins.test.mjs` runs each rule against small fixtures using the
  options from `.oxlintrc.json`.
- oxlint marks `jsPlugins` as alpha. Recheck these rules when upgrading oxlint.

## Enforced

| Rule                                   | What it checks                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture/feature-boundaries`      | A feature imports another feature only through its `types.ts`. `core` and the frontend `api` feature are shared. Tests are exempt.                                                            |
| `architecture/layer-imports`           | Storage and Service files import no other layer, none of the App collections, and no other feature's Service interface unless it is a Core Service. A Logic file imports no other Logic file. |
| `architecture/service-implementations` | Only composition files and tests import a Service implementation.                                                                                                                             |
| `architecture/no-construction`         | Only composition files and tests construct a Service, Storage, or Logic class.                                                                                                                |
| `architecture/own-storage`             | A Logic class may select any Service, but only Storage whose key starts with its own feature's name.                                                                                          |
| `architecture/role-naming`             | File and class names in `services/`, `storage/`, and `logic/`, and for `*-logic.ts` and `*-plugin.ts` files anywhere.                                                                         |
| `architecture/constructor-deps`        | Service, Storage, and Logic constructors take one `deps` parameter.                                                                                                                           |
| `architecture/file-layout`             | Every source file sits in a known role directory of a feature.                                                                                                                                |
| `stack/vendor-imports`                 | Each vendor package is imported only in the layer that wraps it.                                                                                                                              |
| `import/no-cycle`                      | No import cycles.                                                                                                                                                                             |
| `oxc/no-barrel-file`                   | No barrel files.                                                                                                                                                                              |
| `node/no-process-env`                  | Only the live config module reads the environment.                                                                                                                                            |
| `no-console`                           | Only the console logger and command-line scripts call `console`. Other code uses the logger Core Service.                                                                                     |
| `no-restricted-globals`                | Frontend browser globals appear only in Services, the API client, and `main.tsx`.                                                                                                             |
| `no-restricted-imports`                | Workspace boundaries: the frontend imports only the type from `backend/api`, and tests may load `backend/testing`.                                                                            |

## Left to judgment

These stay as written rules, checked in review:

- Business logic lives in Logic classes, not in Services, Storage, handlers, or
  components.
- Service and Storage classes stay thin and hold no application state.
- Backend Logic holds no per-request or per-user state.
- Use events, not direct calls, when one Logic reacts to another.
- Components pass Services into a Logic's `deps` but never call them.
- Keep call stacks shallow.
- A Service depends on no other Service in its own feature. Lint checks only
  imports from other features, because it cannot tell a second interface in the
  same `types.ts` from the one the class implements.
- A Core Service carries no product behavior, and the set stays small.

## Open work

- [x] **Confirm the composition files.** Decided: the live and test roots, plus
      four `core` files that assemble every feature, may import across features.
      They are `compose-app.ts`, `types.ts`, `server/http-app.ts`, and the
      frontend's `ui/routes.tsx`, listed in `.oxlintrc.json`.
- [ ] **Handlers reach Services directly.** `requireSession` and
      `requireTrustedOrigin` call the auth Service, while the dependency rules
      say handlers call Logic. No rule checks this yet. Decide how auth should
      work in handlers, then add a rule that handler files use only the Logic
      collection and Core Services. The request log and the error handler use
      the logger, which the Core Service rule permits.
- [ ] **Simplify the architecture document.** Mark each rule as enforced or
      left to judgment, and cut prose that only restates an enforced rule.
- [ ] **ESLint configuration.** Not needed while oxlint is the linter. To run
      the same rules in ESLint, add a flat config that loads the two plugins
      with the options from `.oxlintrc.json`.
