import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { FrontendAppProvider } from "./app/frontend-app-context.js";
import { createApp } from "./live/index.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("The root element is missing from index.html");
}

const app = createApp({ baseUrl: import.meta.env.VITE_API_BASE_URL });
createRoot(rootElement).render(
  <StrictMode>
    <FrontendAppProvider app={app}>
      <BrowserRouter>
        <h1>Shadow</h1>
      </BrowserRouter>
    </FrontendAppProvider>
  </StrictMode>,
);
