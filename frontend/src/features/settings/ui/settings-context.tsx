import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { SettingsLogic } from "./settings-logic.js";
import { ThemeLogic } from "./theme-logic.js";

interface SettingsContextValue {
  logic: SettingsLogic;
  state: SettingsLogic["state"];
  theme: { logic: ThemeLogic; state: ThemeLogic["state"] };
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Owns the Logic of the settings dialog and of the theme, for the life of the page. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const settingsDeps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock },
      api: { settings: app.api.settings },
      profile: app.profile,
    }),
    [app],
  );
  const themeDeps = useMemo(
    () => ({
      storage: { settings: app.storage.settings },
      services: { theme: app.services.theme },
      api: {},
    }),
    [app],
  );
  const settings = useLogic({ LogicClass: SettingsLogic, deps: settingsDeps });
  const theme = useLogic({ LogicClass: ThemeLogic, deps: themeDeps });
  const value: SettingsContextValue = { ...settings, theme };
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
