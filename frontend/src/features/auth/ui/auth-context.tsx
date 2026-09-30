import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useFrontendApp } from "../../../app/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { AuthLogic } from "./auth-logic.js";
type AuthContextValue = {
  logic: AuthLogic;
  state: ReturnType<AuthLogic["getState"]>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: {},
      api: { api: app.api.api },
      auth: app.auth,
      apiAccessEvents: app.apiAccessEvents,
    }),
    [app],
  );
  const value = useLogic({ LogicClass: AuthLogic, deps });
  useEffect(() => {
    const refresh = () => {
      void value.logic.refresh();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [value.logic]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
