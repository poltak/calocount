import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { WeightLogic } from "./weight-logic.js";

interface WeightContextValue {
  logic: WeightLogic;
  state: WeightLogic["state"];
}

const WeightContext = createContext<WeightContextValue | null>(null);

/** Owns the weight form for the life of the page, so the dashboard can listen to it. */
export function WeightProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({ storage: {}, services: {}, api: { weights: app.api.weights } }),
    [app],
  );
  const value = useLogic({ LogicClass: WeightLogic, deps });
  return (
    <WeightContext.Provider value={value}>{children}</WeightContext.Provider>
  );
}

export function useWeights(): WeightContextValue {
  const value = useContext(WeightContext);
  if (!value) {
    throw new Error("useWeights must be used inside WeightProvider");
  }
  return value;
}
