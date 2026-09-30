# TODOs from initial set up

Keep this list current while initial setup continues. Add unresolved decisions
and temporary behavior with links to the affected code. Close or remove items
when they are resolved.

- [ ] **Encounter ID format:** not defined yet. The temporary [`encounterParamsSchema`](../../backend/src/features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.ts) trims the ID and requires a non-empty string. Replace it when the ID contract is defined.
- [ ] **Encounter operations:** [`EncounterLifecycleLogic`](../../backend/src/features/encounter-lifecycle/logic/encounter-lifecycle-logic.ts) has stub `start`, `pause`, and `stop` methods. Define state transitions and persistence; valid HTTP requests currently return 501.
- [ ] **API contracts:** define request bodies and final result/error contracts for the [lifecycle handlers](../../backend/src/features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.ts). Their success response is a placeholder 204.
- [ ] **Storage and Service contracts:** add table types to [`DatabaseSchema`](../../backend/src/database/database.ts), operations to [encounter Storage](../../backend/src/features/encounter-lifecycle/storage/encounter-lifecycle-storage.ts), and methods to the existing feature Service interfaces as their operations are defined.
- [ ] **Authentication:** the [HTTP scaffold](../../backend/src/server/http-app.ts) has no authentication or caller identity yet. The [Node entry point](../../backend/src/server/start.ts) binds to localhost by default.
- [ ] **Full application tests:** once the [frontend workspace](../../frontend/package.json) has its UI framework and test tools, compose it with the test backend and database and route requests through Hono in memory.
