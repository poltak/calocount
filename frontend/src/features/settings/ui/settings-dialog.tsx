import type { ReactNode } from "react";
import { useSettings } from "./settings-context.js";

/** The settings dialog. The form and the account section come from the pages that compose it. */
export function SettingsDialog({ children }: { children: ReactNode }) {
  const { logic, state } = useSettings();
  if (!state.isOpen) {
    return null;
  }
  const pending =
    state.loadState === "running" || state.saveState === "running";
  return (
    <dialog
      className={pending ? "settings-panel is-pending" : "settings-panel"}
      id="settings-panel"
      open
      aria-labelledby="settings-title"
      aria-busy={pending}
    >
      <div className="settings-heading">
        <div>
          <p className="eyebrow">Personal targets</p>
          <h2 id="settings-title">Daily targets</h2>
        </div>
        <button
          className="close-button"
          type="button"
          aria-label="Close settings"
          disabled={pending}
          onClick={() => logic.close()}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
