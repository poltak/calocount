import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { SettingsLogic } from "./settings-logic.js";

interface SettingsContextValue {
  logic: SettingsLogic;
  state: SettingsLogic["state"];
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const deps = useMemo(() => ({ storage: {}, services: {}, api: {} }), []);
  const value = useLogic({ LogicClass: SettingsLogic, deps });
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used inside SettingsProvider");
  }
  return value;
}
