# Code architecture

Use this guide when you are changing existing code, writing new code, moving files, or deciding where business logic belongs.

## Class roles

Use class names to signal responsibility clearly:

- Service class (e.g., `FooService`): thin wrapper around a stateful or I/O-based external service, API, SDK, or platform capability. Pure utility packages do not need Service wrappers. Each Service has an interface named after the capability, `FooServiceInterface`, and one or more implementations named after what backs them, such as `BetterAuthService`, `SupabaseAuthService`, or `FakeAuthService`. Other code depends only on the interface. Keep vendor types and details inside the implementation, so another one can replace it behind the same interface.
- Storage class (e.g., `FooStorage`): thin persistence abstraction with query and data-mapping logic only. A feature has one Storage class for all its tables, not one class for each table. Persistence includes databases, database RPCs, object storage, browser storage, IndexedDB, AsyncStorage, secure storage, caches, cookies, and local files used as application data.
- UI Logic class (e.g., `FooLogic`): frontend state, UI behavior, and business logic. A Logic class may be stateless; state features are available but not required. Exists to hold **all** non-presentational logic for a part of the UI.
- Backend Logic class (e.g., `FooLogic`): backend business logic.

LogicPlugin classes encapsulate a reusable slice of state and the methods that
act on it. They are not limited to UI Logic classes. Many Logic classes may use
the same LogicPlugin class, but each Logic instance must receive its own
LogicPlugin instance and its own plugin state. A LogicPlugin must not depend on
another LogicPlugin or on a Logic class. Create each plugin instance through its
consuming Logic's `plugins` factory.
LogicPlugin extends Logic, so both share one state and lifecycle API; a LogicPlugin cannot own plugins.

Service and Storage classes may hold injected clients and technical handles needed
for their boundary. They must not own application or product state, and must
not collect business rules. Logic and LogicPlugin classes own both.

Name each role class's file after the class: `FooLogic` in `foo-logic.ts`,
`FooPlugin` (a LogicPlugin) in `foo-plugin.ts`, `FooStorage` in
`foo-storage.ts`, and each Service implementation in `<name>-service.ts`.

Implement Logic, LogicPlugin, Service, and Storage boundaries as classes. UI
components and shared utility functions do not need to be classes. Expose
interfaces where implementations must be replaceable.

### Core Services

A Core Service is a Service that classes in every layer need. The logger is
the only one at this time. It has the shape of any Service: one interface, and
implementations named after what backs them. Two rules differ:

- Any Service, Storage, Logic, or LogicPlugin class, and any handler or
  middleware, may depend on a Core Service's interface. No other rule lets a
  Service or a Storage class depend on a Service.
- A Core Service depends on no other class. That includes other Core Services.
  If two must work together, a composition root combines them.

Keep the set small. Make a Service a Core Service only when both conditions
hold:

- Classes in more than one layer need it.
- It carries no product behavior. A caller reports to it or reads a plain value
  from it, and no business decision depends on which implementation runs.

A Core Service's interface and implementations live in the `core` feature, in
`common` when both workspaces use them. Each workspace lists its Core Services
in the `CoreServices` interface in its `core/types.ts`. A composition root
constructs them first and passes each one to the classes that need it: to a
Logic class in `deps.services`, and to a Service or Storage class as a field of
that class's own `deps`.

## File organization

All workspaces in the monorepo should follow feature-first organization of files. A feature could be both a concrete (user-facing) feature of the app, or a more abstract (developer-facing) feature.

### Main subdirectories inside a feature directory

This list is not exhaustive. Put other feature-local files in the directory that
best matches their responsibility.

- `src/features/<feature>/services/`: Service classes related to feature X
- `src/features/<feature>/logic/`: Backend Logic classes and their LogicPlugins related to feature X. In the frontend, only `features/core/logic/` uses this directory, for hooks and helpers that UI Logic classes in every feature share; a feature's own UI Logic lives in `ui/`
- `src/features/<feature>/storage/`: Storage classes related to feature X
- `src/features/<feature>/ui/`: UI components, UI Logic classes, and their LogicPlugins related to feature X
- `src/features/<feature>/utils/`: re-usable utility functions that might be used by multiple other parts of the feature X
- `src/features/<feature>/handlers/`: backend transport handlers related to feature X, when needed
- `src/features/<feature>/scripts/`: command-line entry points related to feature X

A LogicPlugin lives in the same layer directory as the Logic classes that consume
it. If Logic classes in different runtime layers need the same stateless behavior,
extract shared utility functions instead of sharing a stateful LogicPlugin across
those layers.

Utility functions shared by features in one workspace belong in that workspace's `src/features/core/utils/`. Code shared by workspaces belongs in `common`.

### Layout of `src/`

Every source file lives in a feature directory under `src/features/`. The only
exception is the frontend's `src/main.tsx`, the browser entry point. Do not add
other files or directories at the top of `src/`.

`features/core/` holds the infrastructure that every feature builds on:

- `types.ts`: the App type and its Storage, Service, and Logic collections.
- `live/` and `tests/`: the live and test composition roots. With the backend's
  `compose-app.ts`, they are the only modules that construct Storage, Service,
  and Logic instances across features.
- `logic/`: shared Logic props types and helpers. In the frontend this includes
  the hooks that own and observe UI Logic.
- `services/`: the Core Services.
- Backend `server/` (the HTTP app, startup, and the API contract type),
  `database/`, `storage/`, `errors/`, and `handlers/`.
- Frontend `ui/`: the route table, the App provider, the error boundary, and
  global styles.

The frontend's `features/api/` holds the typed first-party API client and its
events.

Put each test file beside the file it tests, named `<file>.test.ts`. Tests that
span features, and the fixtures they share, live in `features/core/tests/`.
[Testing](testing.md) has the rules for what a test contains.

### `common` workspace

`common` exposes modules that other workspaces may import. Its features live in
`common/src/features/<feature>/` and follow the same feature directory layout.
Expose a shared module through an explicit package subpath export in
`common/package.json` when another workspace needs to import it.
[AGENTS.md](../../AGENTS.md) has the rules for imports between workspaces and
for barrel files.

## Logic and event infrastructure

Import these modules through their public package subpaths:

- `@shadow/common/features/core/logic/logic`
- `@shadow/common/features/core/logic/logic-plugin`
- `@shadow/common/features/core/events/event-emitter`
- `@shadow/common/features/core/services/types`, for the logger interface

Logic and LogicPlugin expose stable state snapshots through `getState()` and
notify `subscribe()` listeners after a state change. Replace changed state with
the protected `setState()`; do not mutate a snapshot in place. Other code
changes state by calling the Logic's methods. Each plugin's state is observed
separately from its consuming Logic's state.

Keep Logic state flat: one top-level field per value, such as `userName`, not a
nested `user` object. `setState()` merges and compares only top-level fields, so
changing one value inside a nested object needs a copy of the object, and the
object always counts as changed. Nest only collections, such as a list of
records, and values that are always replaced as a whole.

Run every async operation in a Logic method through the protected
`executeTask()`:

- The state declares two fields for each task: `<name>State`, of type
  `TaskState`, and `<name>Error`, of type `string | null`. Calling
  `executeTask("<name>", …)` without both fields does not compile.
- `executeTask` sets `running` before its first `await`, then `success`, or
  `error` with the error's message. It never throws. Callers and components read
  the outcome from state.
- A call made while the same task is running does nothing. Components should
  also disable the control while the task runs.
- Do not add separate `busy`, `loading`, or `error` fields for an operation.
- A task function that stops early because another action cancelled its request
  returns normally, and the task ends as `success`. The action that cancelled it
  owns the resulting state.
- A task that sends a form can declare a third field, `<name>FieldErrors`, of
  type `TaskFieldErrors | null`. When the backend refuses single fields,
  `executeTask` puts each field's message there, by the field's path. The
  component shows each message at its field, and shows `<name>Error` only when
  there are no field messages.

`emit` returns a promise. It calls every listener, waits for all listeners, and
rejects with an `AggregateError` if any listener throws or rejects. Await `emit`
when the caller needs the outcome. Use `emitDetached` when the caller does not
need to wait or observe listener failures. It returns without waiting and
deliberately discards those failures.

Do not await `cleanup()` from the same Logic or LogicPlugin's `onInitialize()`.
Initialization waits for `onInitialize()`, and cleanup waits for initialization.
Awaiting cleanup from that hook would create a wait cycle. An external caller may
still call cleanup during initialization; cleanup waits for initialization to
settle before it runs. Initialization then stops early and `initialize()`
rejects with `InitializationCancelledError`.

When cleanup starts, the Logic's protected `signal` aborts and its state stops
changing; later `setState()` calls are ignored. Pass `this.signal` to requests
and other async work so teardown cancels them. Do not add separate "closed"
flags to Logic classes.

## Dependency flow

Keep dependencies moving in one direction:

### Main application dependency paths:

- Backend Logic classes -> Service class -> external services or APIs
- Backend Logic classes -> Storage class -> persistent data
- Backend handlers -> Backend Logic classes
- UI components -> UI Logic classes -> Services -> external services or APIs
- UI components -> UI Logic classes -> first-party API client -> backend handlers
- UI components -> UI Logic classes -> Storage classes -> persistent data
- Logic classes -> LogicPlugin classes
- LogicPlugin classes -> the same dependencies permitted for their consuming Logic layer
- Logic, LogicPlugin, Service, and Storage classes -> pure same-feature or global utility functions

The typed event rules below define additional paths. UI components must not
call Storage directly.

Avoid direct cross-feature imports. A feature's public surface (types and interfaces, including event interfaces) is its `types.ts`
files; every other file is private to the feature.

Two exceptions apply:

- `core` holds centralized code for other features to use. Any feature may
  import from `core`, including runtime code. In the frontend, the same applies
  to the first-party client in `api`.
- Composition roots may import from any feature, because they construct every
  feature's classes.

Logic classes should not call or depend on other Logic classes directly. The
exceptions are Logic dependencies on LogicPlugins and dependencies on typed
event interfaces.

Use events when one Logic class must react to state or behavior owned by another
part of the application. Events may be notifications or request/response. A Logic
class may subscribe to another feature's public typed event interface. Supply event
interfaces through Logic setup functions or a composition root. If coordination
spans several features, create a coordinating feature that composes their public
event interfaces.

UI Logic is created by the component that owns it, not by a composition root, so
that component supplies event interfaces through `deps`:

- App-wide events come from a channel the composition root creates and exposes
  on the frontend App as a listen-only interface, such as `apiAccessEvents`.
- Events from another component-owned Logic come from that Logic's `events`. The
  component reads the Logic from the provider that owns it and passes its
  `events` typed as a listen-only interface.

Subscribe in `onInitialize()` through `listen()` or `registerCleanup()`, so
cleanup removes the listener.

Service classes should not depend on other Service, Storage, or Logic classes. If
several external capabilities form one integration boundary, one Service class may
encapsulate them. Otherwise, coordinate them in Logic.

Storage classes should not depend on other Storage, Service, or Logic classes.

[Core Services](#core-services) are the one exception to both rules.

## Where code belongs

[Class roles](#class-roles) says what each class holds. When in doubt, ask
which layer owns the decision:

- External boundary details belong in Service or Storage classes.
- State transitions and product behavior belong in Logic or LogicPlugin classes.
- Rendering and presentational logic belongs in UI components.

Classify a boundary by what it does:

- Third-party HTTP and WebSocket clients, authentication SDKs, and browser or platform capabilities belong in Services.
- Access to this application's backend belongs in a typed first-party API client, exposed as the frontend App's `api`. Derive its request and response types from the backend route contract. It is separate from the Service collection and does not need a feature Service wrapper.
- A vendor SDK's own client is not a first-party client, even when the SDK's endpoints run inside this backend. Wrap what the frontend needs, such as signing in, in our own backend routes behind a backend Service, so the frontend reaches the vendor only through `api`. A browser-side capability that cannot move to the backend belongs behind a frontend Service. UI Logic owns session and form state. Transport events may notify it when a request loses access.
- A Service may transport data or change notifications, but direct database reads and writes belong in Storage.
- An embedded framework may manage its own internal persistence through its native adapter. Configure that adapter in app setup and keep it behind the framework's Service boundary. This is a narrow exception for framework-owned tables; application data still belongs in Storage. Local integration tests may use the real embedded framework with an isolated database.
- Filesystem access belongs in a Service when it exposes a platform capability. It belongs in Storage when it persists or loads application data.

## Application setup

Use composition roots to construct Storage and Service instances, then inject
the required dependencies and explicit initial state into Logic instances.
Expose typed `storage` and `services` collections on the application. Backend
applications also expose their long-lived `logic` collection.
Frontend applications expose their typed first-party `api` client.
Keep dependency setup in these roots and business rules in Logic classes.

Read environment configuration once, in the live composition root, with one
parser that returns a typed config object. Pass plain config values into
Service, Storage, and Logic constructors. This parser is a deliberate exception
to wrapping platform capabilities in Services: the root needs the config before
it can construct Services, and the environment is read once with no I/O worth
faking. Tests pass config values directly and never read the environment.
Feature modules may export schemas for their own settings, but must not read
the environment themselves.

Backend Logic constructors accept a shared props type that selects the required
Storage and Service instances by their keys. Feature
props types can extend it with additional dependencies. Pass the props to the
base Logic as `deps` and read them through `this.deps`; do not store them in a
second field. Operation method parameters contain operation data; they do not
supply Storage or Service instances.

Backend Logic instances are shared by every request for the life of the server.
They must not hold per-request or per-user state, such as the current user,
request data, or the progress of one caller's operation. Pass that data as
method parameters; handlers pass the verified caller identity the same way. Backend Logic state is only for process-wide state, such as a simple cache.

Use separate live and test roots with the same application interface. Tests must
not load live integration modules, apart from the embedded-framework exception
above. A Service needs a fake only when tests cannot use the real
implementation.

A Storage class needs only one implementation, because a root injects the
client or handle that it reads and writes through. A backend Storage class
receives the database client. A frontend Storage class receives the browser's
storage as a handle, and does not name a browser global such as `localStorage`.
`main.tsx` passes the handle to the live root, and the test root passes one
that keeps its values in memory.

For a long-running server, construct one application at startup and initialize
its Logic before accepting requests. Handlers reuse those instances. Cleanup
must release Logic before its dependencies, and must still release the remaining
resources if a cleanup step fails. Keep runtime startup separate from route
definitions so tests can call handlers without starting a network server.

For a frontend, create the API client, Storage, and Services once per application instance. UI
Logic belongs to the component or provider that owns the UI state. Create it
through a React hook when that owner renders, initialize it after commit, and
clean it up when the owner unmounts. Do not create all UI Logic at app startup.
Keep constructors and plugin factories free of external effects because React
may discard a render. Use a state subscription to connect Logic to rendering;
React must not replace the Logic instance's state methods.

Keep the `deps` object passed to the owning hook stable, with a memo or an
existing stable object; a new object creates a new Logic instance. Other
components observe an owned Logic through the observer hook and never initialize
or clean it up. Keep the owner above any boundary that disconnects effects for
long periods, because a Logic cannot restart after cleanup.

A page behind the session gate reads the signed-in user with
`useSignedInUser()`, and passes what a Logic needs, such as the user's ID, in
`deps`.

The owning hook needs the App provider above it. A failed initialization or
cleanup goes to the hook's `onError`, or to the logger when the owner passes
none.

A rendering error is a defect in a component. Two error boundaries keep it from
blanking the page. One is around the route outlet: it leaves the header usable
and clears on navigation. The other is around the whole app. Add a boundary
around another part of a page only when that part can fail by itself. The
root's error callbacks in `main.tsx` log every rendering error, so a boundary
only shows its fallback.

When repeated requests write the same state, such as refetching on focus,
polling, refresh buttons, or search-as-you-type, keep one `LatestRequest` per
kind of request. Pass `start()` as each request's signal; it cancels the
previous request. Return early if that signal is aborted when the response
arrives, and call `cancel()` when another action makes the pending response
obsolete.

Call the backend through the typed API client. Encode path parameters with
`encodeApiParam`, because the client substitutes them without encoding, and
check responses with `requireApiSuccess`.

## Backend handlers

Backend handlers are transport entrypoints. New handlers should validate and
normalize their input, apply transport-level authentication when required,
delegate to a backend Logic entrypoint, and map the result to the transport
response.

Validate request input with the shared `validator()` helper, so failures use
the shared error body. Register routes by chaining calls on the router, so the
typed client keeps each endpoint's types.

A user reads the message of each failed validation rule, at the field that
broke it. `userMessage` in `core/handlers/validation-messages.ts` writes that
message for every rule, by the kind of rule, so no rule is without one.

- Give a rule its own message in the schema only when the general one is not
  clear enough for that field: `z.string().min(1, "Enter a title")`.
- When you use a kind of rule that `userMessage` has no sentence for, add the
  sentence there. Until then, the user sees "This value is not valid".

Keep handlers in the feature that owns the operation. The main HTTP application
registers feature handlers. Handler dependencies should select the required
features from the shared backend Logic interface with `Pick`, rather than repeat
the application shape or define a separate collection of Logic classes.

Use the same typed API client in live and test setup. Live transport sends HTTP
requests. Test transport may call the handler application directly with in-memory
Request and Response objects, without starting a server. Keep validation, error
mapping, and handler delegation in that path.

## Errors

Logic classes and handlers report expected failures by throwing `AppError` with
a code from one central `AppErrorCode` list. The HTTP layer alone maps each code
to a status and returns one JSON error body, so Logic never deals with HTTP and
clients handle one known set of codes.

An error that is not an `AppError` is a defect. The HTTP layer logs it with the
request ID and answers with `INTERNAL` and no detail. Every response carries
its request ID in the `X-Request-Id` header, so a report from a user leads to
the log entry.

## Transactions

When an operation needs several writes to succeed or fail together, the backend
Logic method runs them in `this.deps.transaction()`. A Logic class gets
`transaction` when its props type includes `BackendTransactionProps`.

```ts
return this.deps.transaction(async (storage) => {
  const note = await storage.notes.create({ userId, title, body });
  await storage.activity.record({
    userId,
    action: "note.created",
    subjectId: note.id,
  });
  return note;
});
```

- The callback receives every Storage class, bound to the transaction. The
  transaction commits when the callback returns, and rolls back when it
  throws. Throw an `AppError` to roll back and report an expected failure.
- A transaction is the only place where a Logic class may use the Storage of
  another feature. Outside one, a Logic class uses only its own feature's
  Storage, from `this.deps.storage`.
- Inside the callback, use only the Storage that the callback receives.
  `this.deps.storage` is not part of the transaction, and lint rejects it
  there.
- Do not call a Service inside the callback, except a Core Service. An
  external effect cannot roll back, and the transaction stays open while the
  Service runs. Call the Service before or after the transaction.
- Keep the callback short. It holds reads, decisions, and writes, and nothing
  that waits for another system.
- A Storage method does not start a transaction. Atomic writes always start in
  Logic, so one operation has one transaction.

## Database schema

A change to the schema is a migration: one file in
`backend/src/features/core/database/migrations/`. Create it with
`pnpm run db:migration:create <name>`. The script names the file with the
current time, and rewrites the list in `migrations.ts`. Do not edit that list
by hand.

- Write plain SQL in the migration's `up` function, with one statement for
  each `sql` call. The test database rejects a call that holds several.
- Name tables and columns in camelCase, as the auth tables are, and quote each
  name in SQL: `"note" ("userId")`.
- Do not change or rename a migration after it is merged. A database that
  already ran it does not get the change. Write a new migration.
- Declare the table's row type in the owning feature's `storage/types.ts` and
  add it to `DatabaseSchema`, in the same change as the migration.
- Migrations only go forward. To undo a change, write a new migration.

## Logging

Write diagnostic output through the logger Core Service. Do not call `console`.
Lint permits `console` only in the console logger and in command-line scripts,
whose output is for the person who runs them.

- Keep the message constant and put the details in fields:
  `logger.warn("Readiness check failed", { error })`. Entries with one message
  can then be found and counted.
- Pass an `Error` as a field value. Each implementation keeps its stack.
- Do not log passwords, session tokens, secrets, or request bodies. The request
  log leaves out the query string for this reason.
- Do not log a failure that the caller receives as an `AppError`. The request
  log already records its status.

Use `error` for a defect or a failure that needs a person, `warn` for a problem
the application handled, `info` for normal events such as one handled request,
and `debug` for detail that helps only during development.
