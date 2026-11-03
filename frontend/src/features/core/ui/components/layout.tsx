import type { ReactNode } from "react";
import "./components.css";

/** The parts of a page, one under the other: its header, tabs, and cards. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="ui-page">{children}</div>;
}

/**
 * Two columns that become one on a narrow screen. `main-side` gives the main
 * column two thirds. `even` gives each column half. `side-main` puts a narrow
 * list first, as a list of threads beside their conversation.
 */
export function Columns({
  layout = "main-side",
  children,
}: {
  layout?: "main-side" | "side-main" | "even" | undefined;
  /** Two elements: the first column, then the second. */
  children: ReactNode;
}) {
  return (
    <div className="ui-columns" data-layout={layout}>
      {children}
    </div>
  );
}

/** Parts one under the other with the same space between them, such as cards in a column. */
export function Stack({
  as: Element = "div",
  label,
  gap = "md",
  children,
}: {
  /** `section` for a part of a page with a heading and no card around it. */
  as?: "div" | "section" | undefined;
  /** The accessible name of a section. */
  label?: string | undefined;
  /** `lg` for sections with no card around them, so that each title stands apart. */
  gap?: "sm" | "md" | "lg" | undefined;
  children: ReactNode;
}) {
  return (
    <Element className="ui-stack" data-gap={gap} aria-label={label}>
      {children}
    </Element>
  );
}

/** A row of buttons in a body, such as the actions of a group of items. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="ui-actions">{children}</div>;
}

/**
 * A row of controls over a part that has no title: the view switch and its
 * options on the left, and the actions on the right.
 */
export function Toolbar({
  start,
  end,
}: {
  start?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className="ui-toolbar">
      <div className="ui-actions">{start}</div>
      <div className="ui-actions">{end}</div>
    </div>
  );
}
