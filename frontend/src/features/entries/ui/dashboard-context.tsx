import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Audience } from "../../core/logic/types.js";
import { useLogic } from "../../core/logic/use-logic.js";
import type { SettingsEvents } from "../../settings/types.js";
import type { WeightEvents } from "../../weights/types.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { DashboardLogic } from "./dashboard-logic.js";
import { EntryActionsLogic } from "./entry-actions-logic.js";
import { EntryFormLogic } from "./entry-form-logic.js";
import { PhotoPreviewLogic } from "./photo-preview-logic.js";

interface DashboardContextValue {
  dashboard: { logic: DashboardLogic; state: DashboardLogic["state"] };
  form: { logic: EntryFormLogic; state: EntryFormLogic["state"] };
  actions: { logic: EntryActionsLogic; state: EntryActionsLogic["state"] };
  photos: { logic: PhotoPreviewLogic; state: PhotoPreviewLogic["state"] };
  /** True while a change or a read runs, so the buttons that start another wait. */
  busy: boolean;
  audience: Audience;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

/**
 * Owns the Logic classes of the dashboard for the life of the page. A visitor
 * has no settings or weight events, and no weight form.
 */
export function DashboardProvider({
  audience,
  settingsEvents,
  weightEvents,
  weightBusy = false,
  children,
}: {
  audience: Audience;
  settingsEvents?: SettingsEvents;
  weightEvents?: WeightEvents;
  /** True while the weight form saves. */
  weightBusy?: boolean;
  children: ReactNode;
}) {
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
  const photoDeps = useMemo(
    () => ({
      storage: {},
      services: {},
      api: { photos: app.api.photos, public: app.api.public },
      profile: app.profile,
      audience,
    }),
    [app, audience],
  );
  const photos = useLogic({ LogicClass: PhotoPreviewLogic, deps: photoDeps });
  const form = useLogic({ LogicClass: EntryFormLogic, deps: formDeps });
  const actions = useLogic({ LogicClass: EntryActionsLogic, deps: actionDeps });
  const dashboardDeps = useMemo(
    () => ({
      storage: { entries: app.storage.entries },
      services: {
        clock: app.services.clock,
        ticker: app.services.ticker,
        windowFocus: app.services.windowFocus,
      },
      api: {
        dashboard: app.api.dashboard,
        days: app.api.days,
        "saved-entries": app.api["saved-entries"],
        public: app.api.public,
      },
      audience,
      entryEvents: [form.logic.events, actions.logic.events],
      settingsEvents: settingsEvents ? [settingsEvents] : [],
      weightEvents: weightEvents ? [weightEvents] : [],
    }),
    [app, audience, form.logic, actions.logic, settingsEvents, weightEvents],
  );
  const dashboard = useLogic({
    LogicClass: DashboardLogic,
    deps: dashboardDeps,
  });
  const value: DashboardContextValue = {
    dashboard,
    form,
    actions,
    photos,
    busy:
      form.logic.busy ||
      actions.logic.busy ||
      weightBusy ||
      dashboard.state.loadDashboardState === "running",
    audience,
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
