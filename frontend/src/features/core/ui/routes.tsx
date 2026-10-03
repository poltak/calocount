import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { ApiExamplePage } from "../../examples/ui/api-example-page.js";
import { CounterPage } from "../../examples/ui/counter-page.js";
import { NotesPage } from "../../notes/ui/notes-page.js";
import { AuthProvider, useAuth } from "../../auth/ui/auth-context.js";
import { SessionGate } from "../../auth/ui/session-gate.js";
import { LoginPage } from "../../auth/ui/login-page.js";
import { ErrorBoundary } from "./error-boundary.js";
import { PageErrorFallback } from "./error-fallbacks.js";

function ProtectedLayout() {
  const { logic, state } = useAuth();
  const location = useLocation();
  return (
    <>
      <header>
        <Link className="brand" to="/">
          Shadow
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Counter
          </NavLink>
          <NavLink to="/examples/api/example-encounter">API example</NavLink>
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
          <Outlet />
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
          <Route element={<SessionGate />}>
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<CounterPage />} />
              <Route
                path="/examples/api/:encounterId?"
                element={<ApiExamplePage />}
              />
              <Route path="/notes" element={<NotesPage />} />
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
