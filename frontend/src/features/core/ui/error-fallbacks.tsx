import { Alert, AlertDescription } from "./shadcn/alert.js";
import { CircleXIcon } from "lucide-react";
import { Button } from "./shadcn/button.js";
import { Page } from "./core/page.js";
import { PageHeader } from "./core/page-header.js";
import type { ErrorFallbackProps } from "./error-boundary.js";

export function PageErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <Page>
      <PageHeader title="This page failed to load" />
      <Alert variant="destructive">
        <CircleXIcon aria-hidden="true" />
        <AlertDescription className="flex flex-col gap-2">
          An unexpected error occurred on this page.
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </Page>
  );
}

export function AppErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <div className="app-shell">
      <Page>
        <PageHeader title="Something went wrong" />
        <Alert variant="destructive">
          <CircleXIcon aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-2">
            An unexpected error occurred.
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={reset}>
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </Page>
    </div>
  );
}
