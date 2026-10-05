import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { Link, Navigate } from "react-router";
import { useAuth } from "./auth-context.js";

/** The page where a visitor makes an account. It works only in open sign-up mode. */
export function SignUpPage() {
  const { logic, state } = useAuth();
  if (state.isSignedIn) {
    return <Navigate to="/" replace />;
  }
  if (
    state.loadSignUpStatusState === "pristine" ||
    state.loadSignUpStatusState === "running"
  ) {
    return <output>Checking if sign-up is open…</output>;
  }
  if (state.loadSignUpStatusState === "error") {
    return (
      <section className="login-panel">
        <h1>Unable to check if sign-up is open</h1>
        <p role="alert">{state.loadSignUpStatusError}</p>
        <button onClick={() => void logic.loadSignUpStatus()}>Try again</button>
      </section>
    );
  }
  if (!state.isSignUpOpen) {
    return (
      <section className="login-panel">
        <h1>Sign-up is closed</h1>
        <p>You cannot make an account here.</p>
        <Link to="/login">Sign in</Link>
      </section>
    );
  }

  const signingUp = state.signUpState === "running";
  return (
    <section className="login-panel">
      <h1>Create your {APP_NAME} account</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void logic.signUp();
        }}
      >
        <label htmlFor="sign-up-name">Name</label>
        <input
          id="sign-up-name"
          name="name"
          autoComplete="name"
          required
          value={state.signUpName}
          onChange={(event) => logic.setSignUpName(event.target.value)}
          disabled={signingUp}
        />
        {state.signUpFieldErrors?.name && (
          <p role="alert">{state.signUpFieldErrors.name}</p>
        )}
        <label htmlFor="sign-up-email">Email</label>
        <input
          id="sign-up-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={state.email}
          onChange={(event) => logic.setEmail(event.target.value)}
          disabled={signingUp}
        />
        {state.signUpFieldErrors?.email && (
          <p role="alert">{state.signUpFieldErrors.email}</p>
        )}
        <label htmlFor="sign-up-password">Password</label>
        <input
          id="sign-up-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={state.password}
          onChange={(event) => logic.setPassword(event.target.value)}
          disabled={signingUp}
        />
        {state.signUpFieldErrors?.password && (
          <p role="alert">{state.signUpFieldErrors.password}</p>
        )}
        {state.signUpError && !state.signUpFieldErrors && (
          <p role="alert">{state.signUpError}</p>
        )}
        <button type="submit" disabled={signingUp}>
          {signingUp ? "Creating your account…" : "Create account"}
        </button>
      </form>
      <p>
        Do you have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
