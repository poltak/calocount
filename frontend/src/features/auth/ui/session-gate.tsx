import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./auth-context.js";
export function SessionGate() {
  const { logic, state } = useAuth();
  const location = useLocation();
  if (state.isSignedIn) {
    return <Outlet />;
  }
  if (
    state.loadSessionState === "pristine" ||
    state.loadSessionState === "running"
  ) {
    return <output>Checking your session…</output>;
  }
  if (state.loadSessionState === "error") {
    return (
      <section>
        <h1>Unable to check your session</h1>
        <p role="alert">{state.loadSessionError}</p>
        <button onClick={() => void logic.refresh()}>Try again</button>
      </section>
    );
  }
  return (
    <Navigate
      to="/login"
      replace
      state={
        // The sign-out makes the session end before its task ends, so a
        // running sign-out must not keep the page as the return address.
        state.signOutState === "pristine"
          ? { returnTo: location.pathname + location.search + location.hash }
          : undefined
      }
    />
  );
}
