# TODOs from initial set up

Keep this list current while initial setup continues. Add unresolved decisions
and temporary behavior with links to the affected code. Close or remove items
when they are resolved.

- [ ] **Encounter ID format:** not defined yet. The temporary [`encounterParamsSchema`](../../backend/src/features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.ts) trims the ID and requires a non-empty string. Replace it when the ID contract is defined.
- [ ] **Encounter operations:** [`EncounterLifecycleLogic`](../../backend/src/features/encounter-lifecycle/logic/encounter-lifecycle-logic.ts) has stub `start`, `pause`, and `stop` methods. Define state transitions and persistence; valid HTTP requests currently return 501.
- [ ] **API contracts:** define request bodies and final result/error contracts for the [lifecycle handlers](../../backend/src/features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.ts). Their success response is a placeholder 204.
- [ ] **Storage and Service contracts:** add table types to [`DatabaseSchema`](../../backend/src/database/database.ts), operations to [encounter Storage](../../backend/src/features/encounter-lifecycle/storage/encounter-lifecycle-storage.ts), and methods to the existing feature Service interfaces as their operations are defined.
- [ ] **Authentication:** the [HTTP scaffold](../../backend/src/server/http-app.ts) has no authentication or caller identity yet. The [Node entry point](../../backend/src/server/start.ts) binds to localhost by default.
- [x] **Full application tests:** the [shared fixture](../../frontend/tests/fixtures/full-application.ts) connects UI, Hono, and PGlite in one process. Its [example test](../../frontend/tests/full-application.test.tsx) substitutes the unfinished lifecycle method to prove a database write. Replace that substitute with real encounter behavior when implemented; see the [test plan](full-application-test-plan.md).
- [x] **Frontend router:** React Router is installed with counter and API example routes. Replace the [example pages](../../frontend/src/app/routes.tsx) as real screens are added.
- [ ] **API error contracts:** keep the global response type in [`backend/api`](../../backend/src/api.ts) aligned with handler errors. The client types do not validate responses at runtime; decide on response validation if independently deployed backends require it.
- [ ] **Frontend persistence:** define browser Storage contracts when a feature needs persistence. Keep the frontend Storage collection empty until then.
- [ ] **Local installation:** add packaging, startup, and static file serving for a local Hono server when local deployment is implemented. Choosing React + Vite does not implement this deployment path.
