import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { FrontendAppProvider } from "./features/core/ui/frontend-app-context.js";
import { AppRoutes } from "./features/core/ui/routes.js";
import "./features/core/ui/app.css";
import { createApp } from "./features/core/live/index.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The root element is missing from index.html");
}

const app = createApp({ baseUrl: import.meta.env.VITE_API_BASE_URL });
createRoot(rootElement).render(
  <StrictMode>
    <FrontendAppProvider app={app}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </FrontendAppProvider>
  </StrictMode>,
);
