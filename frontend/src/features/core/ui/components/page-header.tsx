import type { ReactNode } from "react";
import "./components.css";
import { Badge } from "../shadcn/badge.js";

/**
 * The top of each page: the one `h1`, a line under it, and the page's
 * actions. Every page has one, also a page that shows an error or loads.
 */
export function PageHeader({
  title,
  subtitle,
  leading,
  search,
  actions,
}: {
  title: ReactNode;
  /** Short facts under the title, such as a birth date or a status. */
  subtitle?: ReactNode;
  /** Before the title, such as a photo. */
  leading?: ReactNode;
  /** A search of the whole page, beside the title. */
  search?: ReactNode;
  /** Buttons. The first one is the main action of the page. */
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header-main">
        {leading}
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="ui-page-header-subtitle">{subtitle}</p>}
        </div>
        {search && <div className="ui-page-header-search">{search}</div>}
      </div>
      {actions && <div className="ui-actions">{actions}</div>}
    </header>
  );
}

/**
 * The title of a section of a page, with its tools on the right. Use
 * `level={3}` for a part inside a section.
 */
export function SectionHeader({
  title,
  level = 2,
  size = "md",
  count,
  description,
  leading,
  trailing,
  actions,
  search,
  truncate = false,
}: {
  title: ReactNode;
  level?: 2 | 3 | undefined;
  /** `lg` for a section with no card around it, such as a list of blocks. */
  size?: "md" | "lg" | undefined;
  count?: number | undefined;
  description?: ReactNode;
  /** Before the title, such as a back button. */
  leading?: ReactNode;
  /** After the title, such as a state badge and a date. */
  trailing?: ReactNode;
  /** Small buttons and filters, such as Add or Active / Resolved. */
  actions?: ReactNode;
  search?: ReactNode;
  /**
   * End a long title in an ellipsis, so the actions stay on its line, such
   * as in a dialog header. On a narrow screen the actions go under it.
   */
  truncate?: boolean | undefined;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div
      className="ui-section-header"
      data-size={size}
      data-truncate={truncate ? "" : undefined}
    >
      <div className="ui-section-header-title">
        {leading}
        <Heading>{title}</Heading>
        {count !== undefined && <Badge variant="secondary">{count}</Badge>}
        {trailing}
      </div>
      {actions && <div className="ui-actions">{actions}</div>}
      {search && <div className="ui-section-header-search">{search}</div>}
      {description && (
        <p className="ui-section-header-description">{description}</p>
      )}
    </div>
  );
}
