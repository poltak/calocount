import React, { createContext, useContext, type ReactNode } from "react";
import type { App } from "../types.js";

const FrontendAppContext = createContext<App | null>(null);

interface FrontendAppProviderProps {
  app: App;
  children: ReactNode;
}

export function FrontendAppProvider({
  app,
  children,
}: FrontendAppProviderProps) {
  return (
    <FrontendAppContext.Provider value={app}>
      {children}
    </FrontendAppContext.Provider>
  );
}

export function useFrontendApp(): App {
  const app = useContext(FrontendAppContext);
  if (!app) {
    throw new Error("useFrontendApp must be used inside FrontendAppProvider");
  }
  return app;
}
