import type { ReactNode } from "react";
import { Link } from "react-router";

function BrandMark() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>calocount</span>
    </>
  );
}

/**
 * The top bar. The owner page gives it the settings button. A visitor gets a
 * link to the owner view, and no control that changes data.
 */
export function DashboardTopbar(
  props:
    | { audience: "public" }
    | { audience: "owner"; actions: ReactNode; profileSwitch: ReactNode },
) {
  if (props.audience === "public") {
    return (
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Calocount public view">
          <BrandMark />
        </Link>
        <div className="topbar-actions">
          <span className="sync-status">
            <span className="status-dot" aria-hidden="true" /> Public read-only
          </span>
          <Link className="secondary-button owner-link" to="/owner">
            Open owner view
          </Link>
          <span className="avatar" aria-label="Public read-only view">
            <span aria-hidden="true">↗</span>
          </span>
        </div>
      </header>
    );
  }
  return (
    <header className="topbar">
      <a className="brand" href="#today" aria-label="Calocount home">
        <BrandMark />
      </a>
      {props.profileSwitch}
      <div className="topbar-actions">
        <span className="sync-status">
          <span className="status-dot" aria-hidden="true" /> Live data
        </span>
        {props.actions}
        <span className="avatar" aria-label="Account">
          <span aria-hidden="true">M</span>
        </span>
      </div>
    </header>
  );
}
