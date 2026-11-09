import type { ReactNode } from "react";

/** The top bar. The pages that compose the dashboard give it the settings button. */
export function DashboardTopbar({ actions }: { actions: ReactNode }) {
  return (
    <header className="topbar">
      <a className="brand" href="#today" aria-label="Calocount home">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>calocount</span>
      </a>
      <div className="topbar-actions">
        <span className="sync-status">
          <span className="status-dot" aria-hidden="true" /> Live data
        </span>
        {actions}
        <span className="avatar" aria-label="Account">
          <span aria-hidden="true">M</span>
        </span>
      </div>
    </header>
  );
}
