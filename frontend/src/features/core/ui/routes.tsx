import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { useMemo } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { AccountSection } from "../../auth/ui/account-section.js";
import { AuthProvider, useAuth } from "../../auth/ui/auth-context.js";
import { SessionGate } from "../../auth/ui/session-gate.js";
import { SignInPage } from "../../auth/ui/sign-in-page.js";
import { DashboardPage } from "../../entries/ui/dashboard-page.js";
import { InsightsSection } from "../../insights/ui/insights-section.js";
import { SettingsButton } from "../../settings/ui/settings-button.js";
import { SettingsForm } from "../../settings/ui/settings-form.js";
import { SettingsDialog } from "../../settings/ui/settings-dialog.js";
import {
  SettingsProvider,
  useSettings,
} from "../../settings/ui/settings-context.js";
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
        <Link className="brand" to="/">
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
      renderWeightTrend={(props) => <WeightTrendPanel {...props} />}
      renderWeightPanel={({ selectedDate, weights: dayWeights, ...props }) => (
        <WeightPanel
          selectedDate={selectedDate}
          weights={dayWeights}
          {...props}
        />
      )}
      renderInsights={(props) => <InsightsSection {...props} />}
    />
  );
}

function Shell() {
  const onSignIn = useLocation().pathname === "/login";
  return (
    <div
      className={onSignIn ? "app-shell auth-shell" : "app-shell"}
      data-view={onSignIn ? "sign-in" : "owner"}
    >
      <Routes>
        <Route path="/login" element={<SignInPage />} />
        <Route element={<SessionGate />}>
          <Route element={<OwnerLayout />}>
            <Route path="/" element={<Navigate to="/owner" replace />} />
            <Route path="/owner" element={<OwnerDashboard />} />
          </Route>
          <Route element={<ProtectedLayout />}>
            <Route
              path="*"
              element={
                <section>
                  <h1>Page not found</h1>
                  <Link to="/">Go to the start page</Link>
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
