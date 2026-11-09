import type { ReactNode } from "react";
import { useSettings } from "./settings-context.js";

/** The settings dialog. What it holds comes from the pages that compose it. */
export function SettingsDialog({ children }: { children: ReactNode }) {
  const { logic, state } = useSettings();
  if (!state.isOpen) {
    return null;
  }
  return (
    <dialog
      className="settings-panel"
      id="settings-panel"
      open
      aria-labelledby="settings-title"
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
          onClick={() => logic.close()}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
