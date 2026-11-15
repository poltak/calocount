import { useSettings } from "./settings-context.js";

/** The button in the top bar that opens the settings dialog. */
export function SettingsButton() {
  const { logic, state } = useSettings();
  return (
    <button
      className="icon-button"
      type="button"
      aria-label="Open settings"
      aria-expanded={state.isOpen}
      aria-controls="settings-panel"
      onClick={() => void logic.open()}
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M2 4.5h6.5M13 4.5h1M2 11.5h1M7.5 11.5H14" />
        <circle cx="10.75" cy="4.5" r="2" />
        <circle cx="5.25" cy="11.5" r="2" />
      </svg>
    </button>
  );
}
