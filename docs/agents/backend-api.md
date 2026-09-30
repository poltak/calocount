# Backend API scaffold

- Build with `pnpm run build`, then run `DATABASE_URL=<postgres-url> pnpm --filter backend start`.
- The Node entry point is `backend/src/server/start.ts`. Defaults: `HOST=127.0.0.1`, `PORT=3000`; both can be set through the environment.
- `createHttpApp({ app })` registers routes on an existing business App. It does not create database or Logic instances.
- The live and test `createApp()` factories expose the same `storage`, `services`, `logic`, and `close()` structure. Server startup initializes Logic; `close()` cleans it up and releases the database.
- `backend/src/live/index.ts` and `backend/src/tests/index.ts` hold the composition roots; `backend/src/index.ts` holds their shared App types without runtime imports. Both construct `EncounterLifecycleLogic` with the App's encounter Storage and empty initial state.
- `BackendLogicProps<StorageKeys, ServiceKeys>` in `backend/src/logic/types.ts` supplies `storage: Pick<BackendStorage, StorageKeys>` and `services: Pick<BackendServices, ServiceKeys>`. `EncounterLifecycleLogicProps` selects `"encounterLifecycle"` Storage and the `"patientRecords"` Service; its constructor stores `props` and passes them into the base Logic dependencies. Use `props.storage.encounterLifecycle` and `props.services.patientRecords` inside this Logic. Method parameters contain encounter data only.
- Both roots use the same Storage classes with an injected `Kysely<DatabaseSchema>`. Live setup uses a PostgreSQL pool and accepts `databaseUrl` or reads `DATABASE_URL`; tests use an isolated in-memory PGlite database. Storage constructors receive `BackendStorageProps` from `backend/src/storage/types.ts`.
- Feature handler dependencies use `Pick<BackendLogic, "encounterLifecycle">`. The HTTP app passes its Logic collection; the handlers select the encounter instance from that collection.
- `POST /encounters/:encounterId/start`, `/pause`, and `/stop` validate a non-empty encounter ID with Zod, then call the matching `EncounterLifecycleLogic` method.
- All three Logic methods are stubs. Valid requests return **501** with `error.code = "NOT_IMPLEMENTED"`; invalid IDs return **400** before Logic runs. No encounter state is read or changed.
- Handlers return **204** when a Logic method succeeds. Request bodies, the final ID format, and result contracts will be defined with the feature implementation.
- Authentication is not implemented in this scaffold. The server binds to localhost by default.

Track temporary contracts and unfinished setup in [TODOs from initial set up](initial-setup-todos.md).
