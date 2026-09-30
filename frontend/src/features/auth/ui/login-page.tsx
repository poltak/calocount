import { Navigate, useLocation } from "react-router";
import { useAuth } from "./auth-context.js";
export function LoginPage() {
  const { logic, state } = useAuth();
  const location = useLocation();
  const returnTo: unknown = location.state?.returnTo;
  const destination =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("\\") &&
    !returnTo.startsWith("/login")
      ? returnTo
      : "/";
  if (state.status === "signedIn") return <Navigate to={destination} replace />;
  return (
    <section className="login-panel">
      <h1>Sign in to Shadow</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void logic.signIn();
        }}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={state.email}
          onChange={(event) => logic.setEmail(event.target.value)}
          disabled={state.busy || state.status === "loading"}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={state.password}
          onChange={(event) => logic.setPassword(event.target.value)}
          disabled={state.busy || state.status === "loading"}
        />
        {state.error && <p role="alert">{state.error}</p>}
        {state.status === "loading" && <output>Checking your session…</output>}
        <button
          type="submit"
          disabled={state.busy || state.status === "loading"}
        >
          {state.busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
