import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { useMemo } from "react";
import { Link, Outlet, Route, Routes, useLocation } from "react-router";
import { AccountSection } from "../../auth/ui/account-section.js";
import { AuthProvider, useAuth } from "../../auth/ui/auth-context.js";
import { SessionGate } from "../../auth/ui/session-gate.js";
import { SignInPage } from "../../auth/ui/sign-in-page.js";
import { DashboardPage } from "../../entries/ui/dashboard-page.js";
import { CalendarPanel } from "../../history/ui/calendar-panel.js";
import { SettingsButton } from "../../settings/ui/settings-button.js";
import { SettingsForm } from "../../settings/ui/settings-form.js";
import { SettingsDialog } from "../../settings/ui/settings-dialog.js";
import {
  SettingsProvider,
  useSettings,
} from "../../settings/ui/settings-context.js";
import { PrivacyPage } from "../../public-view/ui/privacy-page.js";
import { PublicDashboardPage } from "../../public-view/ui/public-dashboard-page.js";
import { useWeights, WeightProvider } from "../../weights/ui/weight-context.js";
import { WeightPanel } from "../../weights/ui/weight-panel.js";
import { WeightTrendPanel } from "../../weights/ui/weight-trend-panel.js";
import { ErrorBoundary } from "./error-boundary.js";
import { PageErrorFallback } from "./error-fallbacks.js";
import type { ProtectedPageContext } from "./signed-in-user.js";

/** A page without a layout of its own gets this header, with the way out. */
function ProtectedLayout() {
  const { logic, state } = useAuth();
  const location = useLocation();
  // The session gate renders this layout only for a signed-in user.
  const pageContext = useMemo<ProtectedPageContext>(
    () => ({ authEvents: logic.events }),
    [logic.events],
  );
  return (
    <>
      <header>
        <Link className="brand" to="/owner">
          {APP_NAME}
        </Link>
        <div className="session-actions">
          <button
            disabled={state.signOutState === "running"}
            onClick={() => void logic.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      {state.signOutError && <p role="alert">{state.signOutError}</p>}
      <main>
        {/* A page that fails leaves the header usable. Navigation clears the failure. */}
        <ErrorBoundary resetKey={location.key} Fallback={PageErrorFallback}>
          <Outlet context={pageContext} />
        </ErrorBoundary>
      </main>
    </>
  );
}

/** The owner pages draw their own top bar, and share one settings dialog. */
function OwnerLayout() {
  const location = useLocation();
  return (
    <SettingsProvider>
      <WeightProvider>
        <ErrorBoundary resetKey={location.key} Fallback={PageErrorFallback}>
          <Outlet />
        </ErrorBoundary>
      </WeightProvider>
    </SettingsProvider>
  );
}

/** The owner dashboard with the parts that other features give it. */
function OwnerDashboard() {
  const settings = useSettings();
  const weights = useWeights();
  return (
    <DashboardPage
      topbarActions={<SettingsButton />}
      belowTopbar={
        <SettingsDialog>
          <SettingsForm />
          <AccountSection />
        </SettingsDialog>
      }
      settingsEvents={settings.logic.events}
      weightEvents={weights.logic.events}
      weightBusy={weights.logic.busy}
      renderCalendar={(props) => <CalendarPanel {...props} />}
      renderWeightTrend={(props) => <WeightTrendPanel {...props} />}
      renderWeightPanel={({ selectedDate, weights: dayWeights, ...props }) => (
        <WeightPanel
          selectedDate={selectedDate}
          weights={dayWeights}
          {...props}
        />
      )}
    />
  );
}

/** The public pages need no session. The settings provider applies the theme of this device. */
function PublicLayout() {
  const location = useLocation();
  return (
    <SettingsProvider>
      <ErrorBoundary resetKey={location.key} Fallback={PageErrorFallback}>
        <Outlet />
      </ErrorBoundary>
    </SettingsProvider>
  );
}

function viewOf(pathname: string) {
  if (pathname === "/login") {
    return "sign-in";
  }
  return pathname === "/" || pathname === "/privacy" ? "public" : "owner";
}

function Shell() {
  const view = viewOf(useLocation().pathname);
  return (
    <div
      className={view === "sign-in" ? "app-shell auth-shell" : "app-shell"}
      data-view={view}
    >
      <Routes>
        <Route path="/login" element={<SignInPage />} />
        <Route element={<PublicLayout />}>
          <Route
            path="/"
            element={
              <PublicDashboardPage
                renderCalendar={(props) => <CalendarPanel {...props} />}
              />
            }
          />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Route>
        <Route element={<SessionGate />}>
          <Route element={<OwnerLayout />}>
            <Route path="/owner" element={<OwnerDashboard />} />
          </Route>
          <Route element={<ProtectedLayout />}>
            <Route
              path="*"
              element={
                <section>
                  <h1>Page not found</h1>
                  <Link to="/owner">Go to the start page</Link>
                </section>
              }
            />
          </Route>
        </Route>
      </Routes>
    </div>
  );
}

/** Router-agnostic composition: BrowserRouter in live, MemoryRouter in tests. */
export function AppRoutes() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
