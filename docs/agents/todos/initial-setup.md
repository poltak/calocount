# TODOs from initial set up

Keep this list current while initial setup continues. Add unresolved decisions
and temporary behavior with links to the affected code. Close or remove items
when they are resolved.

- [ ] **Encounter ID format:** not defined yet. The temporary [`encounterParamsSchema`](../../../backend/src/features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.ts) trims the ID and requires a non-empty string. Replace it when the ID contract is defined.
- [ ] **Encounter operations:** [`EncounterLifecycleLogic`](../../../backend/src/features/encounter-lifecycle/logic/encounter-lifecycle-logic.ts) has stub `start`, `pause`, and `stop` methods. Define state transitions and persistence; valid HTTP requests currently return 501.
- [ ] **API contracts:** define request bodies and final result/error contracts for the [lifecycle handlers](../../../backend/src/features/encounter-lifecycle/handlers/encounter-lifecycle-handlers.ts). Their success response is a placeholder 204.
- [ ] **Storage and Service contracts:** add table types to [`DatabaseSchema`](../../../backend/src/features/core/database/database.ts), operations to [encounter Storage](../../../backend/src/features/encounter-lifecycle/storage/encounter-lifecycle-storage.ts), and methods to the existing feature Service interfaces as their operations are defined.
- [x] **Authentication:** the [HTTP app](../../../backend/src/features/core/server/http-app.ts) protects business routes through shared session middleware. Session routes remain reachable while logged out; see [decisions](../decisions.md#authentication).
- [x] **Full application tests:** the [shared fixture](../../../frontend/src/features/core/tests/full-application.ts) connects UI, Hono, and PGlite in one process. Its [example test](../../../frontend/src/features/core/tests/full-application.test.tsx) substitutes the unfinished lifecycle method to prove a database write. Replace that substitute with real encounter Logic and Storage when implemented.
- [ ] **Documented full application integration test expectations + examples:** need the first few examples of full application integration tests and expectations going forward for all new integration tests.
- [x] **Frontend router:** React Router is installed with counter and API example routes. Replace the [example pages](../../../frontend/src/features/core/ui/routes.tsx) as real screens are added.
- [ ] **API error contracts:** errors share one body and one [code-to-status map](../../../backend/src/features/core/handlers/error-responses.ts). Add codes to [`AppErrorCode`](../../../backend/src/features/core/errors/app-error.ts) as features need them. The client types do not validate responses at runtime; decide on response validation if independently deployed backends require it.
- [ ] **Frontend persistence:** define browser Storage contracts when a feature needs persistence. Keep the frontend Storage collection empty until then.
- [ ] **Account recovery:** configure a verified recovery path and email delivery when required. The [owner setup command](../../../backend/src/features/auth/scripts/setup-owner.ts) only creates a new account and never resets an existing password.
- [ ] **Multiple users:** replace the [single-user admission policy](../../../backend/src/features/auth/logic/auth-access-logic.ts) and add record ownership rules before admitting additional accounts. Registration is currently disabled.
- [ ] **Local installation:** add packaging, startup, and static file serving for a local Hono server when local deployment is implemented. Choosing React + Vite does not implement this deployment path.
- [ ] **Sign-in rate limiting:** Better Auth only enables its rate limiting when `NODE_ENV=production`. Enable it explicitly in the [auth Service](../../../backend/src/features/auth/services/live-auth-service.ts) or set that variable before the server is reachable by anyone else.
- [ ] **Error tracking service:** simple Service class which affords error tracking via a service like Sentry. May require separate implementations for both frontend and backend, ideally with same Service class interface.
