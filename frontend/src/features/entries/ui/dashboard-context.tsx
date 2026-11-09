import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { DashboardLogic } from "./dashboard-logic.js";
import { EntryActionsLogic } from "./entry-actions-logic.js";
import { EntryFormLogic } from "./entry-form-logic.js";

interface DashboardContextValue {
  dashboard: { logic: DashboardLogic; state: DashboardLogic["state"] };
  form: { logic: EntryFormLogic; state: EntryFormLogic["state"] };
  actions: { logic: EntryActionsLogic; state: EntryActionsLogic["state"] };
  /** True while a change or a read runs, so the buttons that start another wait. */
  busy: boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

/** Owns the Logic classes of the owner dashboard for the life of the page. */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const formDeps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock },
      api: { meals: app.api.meals },
    }),
    [app],
  );
  const actionDeps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock, dialogs: app.services.dialogs },
      api: { meals: app.api.meals, "saved-entries": app.api["saved-entries"] },
    }),
    [app],
  );
  const form = useLogic({ LogicClass: EntryFormLogic, deps: formDeps });
  const actions = useLogic({ LogicClass: EntryActionsLogic, deps: actionDeps });
  const dashboardDeps = useMemo(
    () => ({
      storage: { entries: app.storage.entries },
      services: {
        clock: app.services.clock,
        windowFocus: app.services.windowFocus,
      },
      api: {
        dashboard: app.api.dashboard,
        days: app.api.days,
        "saved-entries": app.api["saved-entries"],
      },
      entryEvents: [form.logic.events, actions.logic.events],
    }),
    [app, form.logic, actions.logic],
  );
  const dashboard = useLogic({
    LogicClass: DashboardLogic,
    deps: dashboardDeps,
  });
  const value: DashboardContextValue = {
    dashboard,
    form,
    actions,
    busy:
      form.logic.busy ||
      actions.logic.busy ||
      dashboard.state.loadDashboardState === "running",
  };
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const value = useContext(DashboardContext);
  if (!value) {
    throw new Error("useDashboard must be used inside DashboardProvider");
  }
  return value;
}
