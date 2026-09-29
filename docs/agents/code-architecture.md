# Code architecture

Use this guide when you are changing existing code, writing new code, moving files, or deciding where business logic belongs.

## Class roles

Use class names to signal responsibility clearly:

- Service class (e.g., `FooService`): thin wrapper around a stateful or I/O-based external service, API, SDK, or platform capability. Pure utility packages do not need Service wrappers.
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
- `src/features/<feature>/logic/`: Backend Logic classes and their LogicPlugins related to feature X
- `src/features/<feature>/storage/`: Storage classes related to feature X
- `src/features/<feature>/ui/`: UI components, UI Logic classes, and their LogicPlugins related to feature X
- `src/features/<feature>/utils/`: re-usable utility functions that might be used by multiple other parts of the feature X
- `src/features/<feature>/handlers/`: backend transport handlers related to feature X, when needed

A LogicPlugin lives in the same layer directory as the Logic classes that consume
it. If Logic classes in different runtime layers need the same stateless behavior,
extract shared utility functions instead of sharing a stateful LogicPlugin across
those layers.

Utility functions shared by features in one workspace belong in that workspace's `src/utils/`. Code shared by workspaces belongs in `common`.

`common` exposes modules that other workspaces may import. Its features live in
`common/src/features/<feature>/` and follow the same feature directory layout.
Do not add barrel files that re-export many modules. Import modules from their
defining files. Expose a shared module through an explicit package subpath export
in `common/package.json` when another workspace needs to import it. Code that the
frontend imports from `common` must work in a browser and must not depend on
backend-only APIs or secrets. Apart from imports from `common`, workspaces should
not have cross-workspace imports.

## Logic and event infrastructure

Import these modules through their public package subpaths:

- `@shadow/common/features/core/logic/logic`
- `@shadow/common/features/core/logic/logic-plugin`
- `@shadow/common/features/core/events/event-emitter`

Construct each Logic with explicit `deps` and `initialState`. Pass plugin
factories in `plugins`; each factory receives the Logic's dependencies and must
return a new plugin instance for that Logic. Each LogicPlugin instance owns its
own state and takes explicit `deps` and `initialState`.

`emit` returns a promise. It calls every listener, waits for all listeners, and
rejects with an `AggregateError` if any listener throws or rejects. Await `emit`
when the caller needs the outcome. Use `emitDetached` when the caller does not
need to wait or observe listener failures. It returns without waiting and
deliberately discards those failures.

Do not await `cleanup()` from the same Logic or LogicPlugin's `onInitialize()`.
Initialization waits for `onInitialize()`, and cleanup waits for initialization.
Awaiting cleanup from that hook would create a wait cycle. An external caller may
still call cleanup during initialization; cleanup waits for initialization to
settle before it runs.

## Dependency flow

Keep dependencies moving in one direction:

### Main application dependency paths:

- Backend Logic classes -> Service class -> external services or APIs
- Backend Logic classes -> Storage class -> persistent data
- Backend handlers -> Backend Logic classes
- UI components -> UI Logic classes -> Services -> external services or APIs
- UI components -> UI Logic classes -> Storage classes -> persistent data
- Logic classes -> LogicPlugin classes
- LogicPlugin classes -> the same dependencies permitted for their consuming Logic layer
- Logic, LogicPlugin, Service, and Storage classes -> pure same-feature or global utility functions

These are the main permitted application dependency paths. The typed event
rules below define additional paths. UI Logic and its LogicPlugins may use
Storage for persistence. UI components must not call Storage directly.

Avoid circular dependencies.

Avoid direct cross-feature imports. A feature may import another feature's public
types or interfaces, including event interfaces. If two features need
the same utility function, hoist it to a shared location instead of importing it
from one feature into the other.

Logic classes should not call or depend on other Logic classes directly. The
exceptions are Logic dependencies on LogicPlugins and dependencies on typed
event interfaces.

Use events when one Logic class must react to state or behavior owned by another
part of the application. Events may be notifications or request/response. A Logic
class may subscribe to another feature's public typed event interface. Supply event
interfaces through Logic setup functions or a composition root. If coordination
spans several features, create a coordinating feature that composes their public
event interfaces.

Service classes should not depend on other Service, Storage, or Logic classes. If
several external capabilities form one integration boundary, one Service class may
encapsulate them. Otherwise, coordinate them in Logic.

Storage classes should not depend on other Storage, Service, or Logic classes.

## Where code belongs

- Put business logic and stateful logic in UI or Backend Logic classes, or in LogicPlugin classes when the logic is shared by multiple Logic classes in the same layer.
- Encapsulate external service+API usage in Service classes.
- Encapsulate all persistence operations in Storage classes.
- Keep Service and Storage classes thin and stateless. Do not let them slowly accumulate application rules.

When in doubt, ask which layer owns the decision:

- External boundary details belong in Service or Storage classes.
- State transitions and product behavior belong in UI or Backend Logic classes, or LogicPlugin classes (if shared between multiple Logic classes).
- Rendering and presentational logic belongs in UI components.

Classify a boundary by what it does:

- HTTP and WebSocket clients, authentication SDKs, and browser or platform capabilities belong in Services.
- A Service may transport data or change notifications, but direct database reads and writes belong in Storage.
- Filesystem access belongs in a Service when it exposes a platform capability. It belongs in Storage when it persists or loads application data.

## Backend handlers

`backend/src/live/index.ts` and `backend/src/tests/index.ts` each define
`createApp()`. Import the entrypoint for the required environment so a test app
does not load live service modules. `backend/src/index.ts` defines the shared
`App` types without runtime imports. Both entrypoints create the same Storage
classes and pass a `Kysely<DatabaseSchema>` instance. The live database factory
uses a PostgreSQL pool. The live entrypoint reads `DATABASE_URL` by default;
callers may instead pass `databaseUrl` to `createApp`. The test factory uses a
fresh in-memory PGlite database. Call `App.close()` to release either database.
Place each live service and its fake in separate files at the same `services/`
depth, with their shared interface in `types.ts`. Keep integration
setup in these composition roots and business rules in backend Logic classes.
The service interfaces will gain methods when those operations are defined.
`DatabaseSchema` will gain table types with the first migration. The storage
and service classes are still stubs; they have no application operations yet.

Backend handlers are transport entrypoints. New handlers should validate and
normalize their input, apply transport-level authentication when required,
delegate to a backend Logic entrypoint, and map the result to the transport
response. Business logic belongs in backend Logic classes, while external calls
and persistence remain in Service and Storage classes.

Business logic that already exists inside a handler is an architecture violation
and should be reported as legacy debt. During normal coding tasks, do not require
immediate refactoring only to correct that existing structure. Put new or
substantially changed business logic behind a backend Logic class. A caller-side
Service for the backend API does not replace the architecture inside the handler.

## Practical check before shipping

Before you hand off a structural change, check:

- Is the dependency direction still obvious?
- Did any business logic slip into a Service or Storage class?
- Does every direct persistence operation pass through the appropriate UI or Backend Logic and Storage?
- Did one Logic class start depending directly on another Logic class?
- Does each Logic instance own a separate instance and state for each LogicPlugin it uses?
- Did the change create a cross-feature dependency that should instead be modeled through a shared abstraction or event?
