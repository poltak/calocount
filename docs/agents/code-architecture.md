# Code architecture

Use this guide when you are changing existing code, writing new code, moving files, or deciding where business logic belongs.

## Class roles

Use class names to signal responsibility clearly:

- Service class (e.g., `FooService`): thin wrapper around a stateful or I/O-based external service, API, SDK, or platform capability. Pure utility packages do not need Service wrappers. Name a Service after the capability it provides, not the vendor behind it (`AuthService`, not `BetterAuthService`). Keep vendor types and details inside the implementation, so another vendor can replace it behind the same interface.
- Storage class (e.g., `FooStorage`): thin persistence abstraction with query and data-mapping logic only. Persistence includes databases, database RPCs, object storage, browser storage, IndexedDB, AsyncStorage, secure storage, caches, cookies, and local files used as application data.
- UI Logic class (e.g., `FooLogic`): frontend state, UI behavior, and business logic. A Logic class may be stateless; state features are available but not required.
- Backend Logic class (e.g., `FooLogic`): backend business logic.

LogicPlugin classes encapsulate a reusable slice of state and the methods that
act on it. They are not limited to UI Logic classes. Many Logic classes may use
the same LogicPlugin class, but each Logic instance must receive its own
LogicPlugin instance and its own plugin state. A LogicPlugin must not depend on
another LogicPlugin or on a Logic class. Create each plugin instance through its
consuming Logic's `plugins` factory.

Service and Storage classes may hold injected clients and technical handles needed
for their boundary. They must not own application or product state. Logic and
LogicPlugin classes own that state.

Implement Logic, LogicPlugin, Service, and Storage boundaries as classes. UI
components and shared utility functions do not need to be classes. Expose
interfaces where implementations must be replaceable.

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

A LogicPlugin lives in the same layer directory as the Logic classes that consume
it. If Logic classes in different runtime layers need the same stateless behavior,
extract shared utility functions instead of sharing a stateful LogicPlugin across
those layers.

Utility functions shared by features in one workspace belong in that workspace's `src/utils/`. Code shared by workspaces belongs in `common`.

### Layout of `src/`

Put code in a feature directory when it belongs to one. Add a new top-level
directory in `src/` only for code that belongs to no feature.

- `features/core/`: infrastructure that every feature builds on.
  - `live/` and `tests/`: the live and test composition roots. They are the only
    modules that construct Storage, Service, and Logic instances across
    features. `src/features/core/tests/` holds test setup code; test files live
    in the workspace's top-level `tests/` directory.
  - Backend `errors/` and `handlers/`: the shared error type and handler helpers.
  - Frontend `logic/`: hooks and helpers shared by UI Logic classes.
- `features/api/` (frontend): the typed first-party API client and its events.

These top-level entries remain while their placement is under review:

- Backend: `index.ts` (App and collection types), `compose-app.ts` (wiring shared
  by both roots), `api.ts` (the type-only API contract), `server/` (HTTP app and
  startup), `database/`, and `logic/` and `storage/` (shared props types and
  lifecycle helpers).
- Frontend: `index.ts` (App types), `main.tsx`, `app/` (routes, provider, and
  styles), and `logic/` (the shared props type).

`common` exposes modules that other workspaces may import. Its features live in
`common/src/features/<feature>/` and follow the same feature directory layout.
Do not add barrel files that re-export many modules. Import modules from their
defining files. Expose a shared module through an explicit package subpath export
in `common/package.json` when another workspace needs to import it. Code that the
frontend imports from `common` must work in a browser and must not depend on
backend-only APIs or secrets. Apart from imports from `common`, the only
cross-workspace imports are the frontend's type-only `backend/api` contract and
Node test files' `backend/testing` fixture. Backend runtime modules must not
enter the browser bundle.

## Logic and event infrastructure

Import these modules through their public package subpaths:

- `@shadow/common/features/core/logic/logic`
- `@shadow/common/features/core/logic/logic-plugin`
- `@shadow/common/features/core/events/event-emitter`

Initialize the base Logic with explicit `deps` and `initialState`. Pass plugin
factories in `plugins`; each factory receives the Logic's dependencies and must
return a new plugin instance for that Logic. Each LogicPlugin instance owns its
own state and takes explicit `deps` and `initialState`. LogicPlugin extends
Logic, so both share one state and lifecycle API; a LogicPlugin cannot own
plugins.

Logic and LogicPlugin expose stable state snapshots through `getState()` and
notify `subscribe()` listeners after a state change. Replace changed state with
the protected `setState()`; do not mutate a snapshot in place. Other code
changes state by calling the Logic's methods. Each plugin's state is observed
separately from its consuming Logic's state.

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

These are the main permitted application dependency paths. The typed event
rules below define additional paths. UI Logic and its LogicPlugins may use
Storage for persistence. UI components must not call Storage directly.

Avoid circular dependencies.

Avoid direct cross-feature imports. A feature's public surface is its `types.ts`
files; every other file is private to the feature. A feature may import another
feature's public types and interfaces, including event interfaces. If two
features need the same utility function, hoist it to a shared location instead
of importing it from one feature into the other.

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

## Where code belongs

- Put business logic and stateful logic in UI or Backend Logic classes, or in LogicPlugin classes when the logic is shared by multiple Logic classes in the same layer.
- Encapsulate external service+API usage in Service classes.
- Encapsulate all persistence operations in Storage classes.
- Keep Service and Storage classes thin. They hold no application state, and must not slowly accumulate application rules.

When in doubt, ask which layer owns the decision:

- External boundary details belong in Service or Storage classes.
- State transitions and product behavior belong in UI or Backend Logic classes, or LogicPlugin classes (if shared between multiple Logic classes).
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
the environment themselves. If configuration later comes from an asynchronous
source, such as a secrets manager, put that source behind a Service.

Backend Logic constructors accept a shared props type that selects the required
Storage and Service instances by their keys. Feature
props types can extend it with additional dependencies. Pass the props to the
base Logic as `deps` and read them through `this.deps`; do not store them in a
second field. Operation method parameters contain operation data; they do not
supply Storage or Service instances.

Backend Logic instances are shared by every request for the life of the server.
They must not hold per-request or per-user state, such as the current user,
request data, or the progress of one caller's operation. Pass that data as
method parameters. Backend Logic state is only for process-wide state, such as a
cache.

Use separate live and test roots with the same application interface. Tests must
not load live integration modules, apart from the embedded-framework exception
above. Keep each live Service and its fake in separate files at the same
feature-local `services/` depth, with their shared interface in `types.ts`. The
interface keeps the plain name (`FooService`); implementations are
`LiveFooService` in `live-foo-service.ts` and `FakeFooService` in
`fake-foo-service.ts`. Storage classes can share an implementation when the
database client is injected. Give each test application isolated dependencies.

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

## Backend handlers

Backend handlers are transport entrypoints. New handlers should validate and
normalize their input, apply transport-level authentication when required,
delegate to a backend Logic entrypoint, and map the result to the transport
response. Business logic belongs in backend Logic classes, while external calls
and persistence remain in Service and Storage classes.

Keep handlers in the feature that owns the operation. The main HTTP application
registers feature handlers. Handler dependencies should select the required
features from the shared backend Logic interface with `Pick`, rather than repeat
the application shape or define a separate collection of Logic classes.

Use the same typed API client in live and test setup. Live transport sends HTTP
requests. Test transport may call the handler application directly with in-memory
Request and Response objects, without starting a server. Keep validation, error
mapping, and handler delegation in that path. Direct backend Logic calls belong
in Logic unit tests, rather than replacing the API path in application tests.

## Errors

Logic classes and handlers report expected failures by throwing `AppError` with
a code from one central `AppErrorCode` list. The HTTP layer alone maps each code
to a status and returns one JSON error body, so Logic never deals with HTTP and
clients handle one known set of codes.

The single list is a deliberate choice for simplicity. Codes are broad
categories such as `NOT_FOUND` or `CONFLICT`, not one code per feature failure,
so the list should grow slowly. It may still become unwieldy in a large app.
When a client needs to tell specific feature failures apart, consider a
feature-specific reason alongside the category code before adding many codes.

## Practical check before shipping

Before you hand off a structural change, check:

- Is the dependency direction still obvious?
- Did any business logic slip into a Service or Storage class?
- Does every direct persistence operation pass through the appropriate UI or Backend Logic and Storage?
- Did one Logic class start depending directly on another Logic class?
- Does each Logic instance own a separate instance and state for each LogicPlugin it uses?
- Did the change create a cross-feature dependency that should instead be modeled through a shared abstraction or event?
