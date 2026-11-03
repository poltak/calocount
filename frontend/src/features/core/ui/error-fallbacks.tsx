import { Button } from "./components/button.js";
import { Page } from "./components/layout.js";
import { PageHeader } from "./components/page-header.js";
import { Notice } from "./components/text.js";
import type { ErrorFallbackProps } from "./error-boundary.js";

export function PageErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <Page>
      <PageHeader title="This page failed to load" />
      <Notice tone="error" actions={<Button onClick={reset}>Try again</Button>}>
        An unexpected error occurred on this page.
      </Notice>
    </Page>
  );
}

export function AppErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <div className="app-shell">
      <Page>
        <PageHeader title="Something went wrong" />
        <Notice
          tone="error"
          actions={<Button onClick={reset}>Try again</Button>}
        >
          An unexpected error occurred.
        </Notice>
      </Page>
    </div>
  );
}
