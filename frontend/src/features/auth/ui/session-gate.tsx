import { Alert, AlertDescription } from "../../core/ui/shadcn/alert.js";
import { CircleXIcon } from "lucide-react";
import { Spinner } from "../../core/ui/shadcn/spinner.js";
import { Navigate, Outlet, useLocation } from "react-router";
import { Button } from "../../core/ui/shadcn/button.js";
import { Page } from "../../core/ui/core/page.js";
import { PageHeader } from "../../core/ui/core/page-header.js";
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
    return (
      <Page>
        <output className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" />
          {"Checking your session…"}
        </output>
      </Page>
    );
  }
  if (state.loadSessionState === "error") {
    return (
      <Page>
        <PageHeader title="Unable to check your session" />
        <Alert variant="destructive">
          <CircleXIcon aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-2">
            {state.loadSessionError}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void logic.refresh()}>
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
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
