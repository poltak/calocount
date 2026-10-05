# Open work

Keep this list current. Add unresolved decisions and temporary behavior with
links to the affected code. Close or remove items when they are resolved.

- [ ] **API error contracts:** errors share one body and one [code-to-status map](../../../backend/src/features/core/handlers/error-responses.ts). Add codes to [`AppErrorCode`](../../../backend/src/features/core/errors/app-error.ts) as features need them. The client types do not validate responses at runtime; decide on response validation if independently deployed backends require it.
- [ ] **Account recovery:** configure a verified recovery path and email delivery when required. The [owner setup command](../../../backend/src/features/auth/scripts/setup-owner.ts) only creates a new account and never resets an existing password.
- [ ] **Email verification:** open sign-up mode does not verify email addresses; see [decisions](../decisions.md#authentication). Add it, with a Service that sends email, before a public release in that mode.
- [ ] **Serving the frontend:** the backend does not serve the frontend build, and the page has no content security policy. Decide this with the hosting.
- [ ] **Session middleware calls the auth Service:** [`requireSession`](../../../backend/src/features/auth/handlers/require-session.ts) and [`requireTrustedOrigin`](../../../backend/src/features/auth/handlers/require-trusted-origin.ts) call the auth Service, but the dependency rules say that handlers call Logic. No lint rule checks this. Decide how handlers get the session, then add a rule that handler files use only the Logic collection and Core Services.
- [ ] **Error tracking:** add it as a logger implementation that forwards each `error` entry to a service like Sentry, one in each workspace. The places that must report already log through the logger: the backend error handler, the frontend root's error callbacks in `main.tsx`, and `useLogic`. Each live composition root then gives the app a logger that writes to both the current logger and the new one. Make a separate Core Service only if tracking needs more than error entries, such as the user's identity or a trail of earlier events.
