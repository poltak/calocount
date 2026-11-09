import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { Link, Navigate, useLocation } from "react-router";
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
  if (state.isSignedIn) {
    return <Navigate to={destination} replace />;
  }
  const checkingSession =
    state.loadSessionState === "pristine" ||
    state.loadSessionState === "running";
  const signingIn = state.signInState === "running";
  const error = state.signInError ?? state.loadSessionError;
  return (
    <section className="login-panel">
      <h1>Sign in to {APP_NAME}</h1>
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
          aria-invalid={state.signInFieldErrors?.email ? true : undefined}
          aria-describedby={
            state.signInFieldErrors?.email ? "sign-in-email-error" : undefined
          }
          type="email"
          autoComplete="username"
          required
          value={state.email}
          onChange={(event) => logic.setEmail(event.target.value)}
          disabled={signingIn || checkingSession}
        />
        {state.signInFieldErrors?.email && (
          <p id="sign-in-email-error" role="alert">
            {state.signInFieldErrors.email}
          </p>
        )}
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          aria-invalid={state.signInFieldErrors?.password ? true : undefined}
          aria-describedby={
            state.signInFieldErrors?.password
              ? "sign-in-password-error"
              : undefined
          }
          type="password"
          autoComplete="current-password"
          required
          value={state.password}
          onChange={(event) => logic.setPassword(event.target.value)}
          disabled={signingIn || checkingSession}
        />
        {state.signInFieldErrors?.password && (
          <p id="sign-in-password-error" role="alert">
            {state.signInFieldErrors.password}
          </p>
        )}
        {error && !state.signInFieldErrors && <p role="alert">{error}</p>}
        {checkingSession && <output>Checking your session…</output>}
        <button type="submit" disabled={signingIn || checkingSession}>
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {state.isSignUpOpen && (
        <p>
          Do you not have an account?{" "}
          <Link to="/sign-up">Create an account</Link>
        </p>
      )}
    </section>
  );
}
