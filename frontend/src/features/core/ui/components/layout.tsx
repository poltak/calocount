import type { ReactNode } from "react";
import "./components.css";

/** The parts of a page, one under the other: its header, tabs, and cards. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="ui-page">{children}</div>;
}
