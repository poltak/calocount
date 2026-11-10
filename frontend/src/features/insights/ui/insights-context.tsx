import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import type { InsightsSlotProps } from "../types.js";
import { InsightsLogic } from "./insights-logic.js";

interface InsightsContextValue {
  logic: InsightsLogic;
  state: InsightsLogic["state"];
}

const InsightsContext = createContext<InsightsContextValue | null>(null);

/** Owns the Logic of the insight panels for the life of the dashboard. */
export function InsightsProvider({
  entryEvents,
  settingsEvents,
  weightEvents,
  children,
}: InsightsSlotProps & { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: {
        clock: app.services.clock,
        windowFocus: app.services.windowFocus,
      },
      api: { insights: app.api.insights },
      entryEvents,
      settingsEvents,
      weightEvents,
    }),
    [app, entryEvents, settingsEvents, weightEvents],
  );
  const value = useLogic({ LogicClass: InsightsLogic, deps });
  return (
    <InsightsContext.Provider value={value}>
      {children}
    </InsightsContext.Provider>
  );
}

export function useInsights(): InsightsContextValue {
  const value = useContext(InsightsContext);
  if (!value) {
    throw new Error("useInsights must be used inside InsightsProvider");
  }
  return value;
}
