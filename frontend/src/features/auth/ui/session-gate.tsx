import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "../../core/ui/shadcn/button.js";
import { Page } from "../../core/ui/components/layout.js";
import { Loading } from "../../core/ui/components/loading.js";
import { PageHeader } from "../../core/ui/components/page-header.js";
import { Notice } from "../../core/ui/components/text.js";
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
    return <Loading label="Checking your session…" />;
  }
  if (state.loadSessionState === "error") {
    return (
      <Page>
        <PageHeader title="Unable to check your session" />
        <Notice
          tone="error"
          actions={
            <Button variant="outline" onClick={() => void logic.refresh()}>
              Try again
            </Button>
          }
        >
          {state.loadSessionError}
        </Notice>
      </Page>
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
