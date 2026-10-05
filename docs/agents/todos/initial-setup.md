# Open work

Keep this list current. Add unresolved decisions and temporary behavior with
links to the affected code. Close or remove items when they are resolved.

- [ ] **Email verification:** open sign-up mode does not verify email addresses, and a user cannot reset a password without an operator; see [decisions](../decisions.md#authentication). Add both, with a Service that sends email, before a public release in that mode.
- [ ] **Serving the frontend:** the backend does not serve the frontend build, and the page has no content security policy. Decide this with the hosting.
- [ ] **Error tracking:** add it as a logger implementation that forwards each `error` entry to a service like Sentry, one in each workspace. The places that must report already log through the logger: the backend error handler, the frontend root's error callbacks in `main.tsx`, and `useLogic`. Each live composition root then gives the app a logger that writes to both the current logger and the new one. Make a separate Core Service only if tracking needs more than error entries, such as the user's identity or a trail of earlier events.
