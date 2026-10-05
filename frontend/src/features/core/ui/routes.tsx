import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { useMemo } from "react";
import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { CounterPage } from "../../examples/ui/counter-page.js";
import { NoteEditPage } from "../../notes/ui/note-edit-page.js";
import { NotesPage } from "../../notes/ui/notes-page.js";
import { AuthProvider, useAuth } from "../../auth/ui/auth-context.js";
import { SessionGate } from "../../auth/ui/session-gate.js";
import { LoginPage } from "../../auth/ui/login-page.js";
import { SignUpPage } from "../../auth/ui/sign-up-page.js";
import { ErrorBoundary } from "./error-boundary.js";
import { PageErrorFallback } from "./error-fallbacks.js";
import type { SignedInUser } from "./signed-in-user.js";

function ProtectedLayout() {
  const { logic, state } = useAuth();
  const location = useLocation();
  // The session gate renders this layout only for a signed-in user.
  const signedInUser = useMemo<SignedInUser>(
    () => ({ id: state.userId ?? "" }),
    [state.userId],
  );
  return (
    <>
      <header>
        <Link className="brand" to="/">
          {APP_NAME}
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Counter
          </NavLink>
          <NavLink to="/notes">Notes</NavLink>
        </nav>
        <div className="session-actions">
          <span>{state.userName}</span>
          <button
            disabled={state.signOutState === "running"}
            onClick={() => void logic.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      {state.signOutError && <p role="alert">{state.signOutError}</p>}
      <main>
        {/* A page that fails leaves the header usable. Navigation clears the failure. */}
        <ErrorBoundary resetKey={location.key} Fallback={PageErrorFallback}>
          <Outlet context={signedInUser} />
        </ErrorBoundary>
      </main>
    </>
  );
}

/** Router-agnostic composition: BrowserRouter in live, MemoryRouter in tests. */
export function AppRoutes() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sign-up" element={<SignUpPage />} />
          <Route element={<SessionGate />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<CounterPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/notes/:noteId" element={<NoteEditPage />} />
              <Route
                path="*"
                element={
                  <section>
                    <h1>Page not found</h1>
                    <Link to="/">Go to the counter example</Link>
                  </section>
                }
              />
            </Route>
          </Route>
        </Routes>
      </div>
    </AuthProvider>
  );
}
