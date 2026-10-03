import type { ErrorFallbackProps } from "./error-boundary.js";

/** Replaces one page after it failed to render. The header and navigation stay usable. */
export function PageErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <section>
      <h1>This page failed to load</h1>
      <p role="alert">An unexpected error occurred on this page.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}

/** Replaces the whole app after a failure that no page boundary caught. */
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
