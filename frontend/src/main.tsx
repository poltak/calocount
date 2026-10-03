import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ErrorBoundary } from "./features/core/ui/error-boundary.js";
import { AppErrorFallback } from "./features/core/ui/error-fallbacks.js";
import { FrontendAppProvider } from "./features/core/ui/frontend-app-context.js";
import { AppRoutes } from "./features/core/ui/routes.js";
import "./features/core/ui/app.css";
import { createApp } from "./features/core/live/index.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The root element is missing from index.html");
}

const app = createApp({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  // The console shows every entry in development, and only problems in a build.
  logLevel: import.meta.env.DEV ? "debug" : "warn",
});
const { logger } = app.services;

createRoot(rootElement, {
  // React reports every rendering error here: one that an error boundary
  // caught, and one that nothing caught.
  onCaughtError: (error, { componentStack }) => {
    logger.error("A component failed to render", { error, componentStack });
  },
  onUncaughtError: (error, { componentStack }) => {
    logger.error("A component failed to render outside an error boundary", {
      error,
      componentStack,
    });
  },
}).render(
  <StrictMode>
    <FrontendAppProvider app={app}>
      <ErrorBoundary Fallback={AppErrorFallback}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ErrorBoundary>
    </FrontendAppProvider>
  </StrictMode>,
);
