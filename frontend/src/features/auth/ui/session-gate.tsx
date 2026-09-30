import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./auth-context.js";
export function SessionGate() {
  const { logic, state } = useAuth();
  const location = useLocation();
  if (state.status === "loading")
    return <output>Checking your session…</output>;
  if (state.status === "error")
    return (
      <section>
        <h1>Unable to connect</h1>
        <p role="alert">{state.error}</p>
        <button onClick={() => void logic.refresh()}>Try again</button>
      </section>
    );
  if (state.status === "signedOut")
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnTo: location.pathname + location.search + location.hash,
        }}
      />
    );
  return <Outlet />;
}
