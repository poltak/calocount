import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { AuthLogic } from "./auth-logic.js";
type AuthContextValue = {
  logic: AuthLogic;
  state: AuthLogic["state"];
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: {
        passkeys: app.services.passkeys,
        windowFocus: app.services.windowFocus,
      },
      api: { auth: app.api.auth },
      apiAccessEvents: app.apiAccessEvents,
    }),
    [app],
  );
  const value = useLogic({ LogicClass: AuthLogic, deps });
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
