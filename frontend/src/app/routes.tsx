import { Link, NavLink, Route, Routes } from "react-router";
import { ApiExamplePage } from "../features/examples/ui/api-example-page.js";
import { CounterPage } from "../features/examples/ui/counter-page.js";

/** Router-agnostic composition: BrowserRouter in live, MemoryRouter in tests. */
export function AppRoutes() {
  return (
    <div className="app-shell">
      <header>
        <Link className="brand" to="/">
          Shadow
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Counter
          </NavLink>
          <NavLink to="/examples/api/example-encounter">API example</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<CounterPage />} />
          <Route
            path="/examples/api/:encounterId?"
            element={<ApiExamplePage />}
          />
          <Route
            path="*"
            element={
              <section>
                <h1>Page not found</h1>
                <Link to="/">Go to the counter example</Link>
              </section>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
