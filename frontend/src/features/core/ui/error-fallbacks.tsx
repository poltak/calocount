import type { ErrorFallbackProps } from "./error-boundary.js";

export function PageErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <section>
      <h1>This page failed to load</h1>
      <p role="alert">An unexpected error occurred on this page.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}

export function AppErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <div className="app-shell">
      <section>
        <h1>Something went wrong</h1>
        <p role="alert">An unexpected error occurred.</p>
        <button onClick={reset}>Try again</button>
      </section>
    </div>
  );
}
