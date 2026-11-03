import type { ReactNode } from "react";
import "./components.css";
import { Icon, type IconName } from "./icon.js";

/**
 * - `body`: running text.
 * - `description`: the explanation under a title.
 * - `note`: what a person wrote about an item, in a list or a history.
 * - `meta`: dates, authors, and sources of an item.
 * - `caption`: the smallest text, such as a unit or a page number.
 * - `label`: an uppercase label over a group, such as "Recent notes".
 */
export type TextVariant =
  "body" | "description" | "note" | "meta" | "caption" | "label";

/** Text with one of the roles of the type scale. */
export function Text({
  variant = "body",
  as: Element = "p",
  preserveLines = false,
  tone,
  children,
}: {
  variant?: TextVariant | undefined;
  as?: "p" | "span" | "div" | undefined;
  /** Keep the line breaks of the text, such as of a note that a person wrote. */
  preserveLines?: boolean | undefined;
  /** `danger` for a value that needs attention, such as an overdue date. */
  tone?: "danger" | undefined;
  children: ReactNode;
}) {
  return (
    <Element
      className="ui-text"
      data-variant={variant}
      data-preserve-lines={preserveLines ? "" : undefined}
      data-tone={tone}
    >
      {children}
    </Element>
  );
}

/**
 * - `info`: a fact the person should know, such as "Nothing new since your last visit".
 * - `warning`: a fact that can change what the person does.
 * - `error`: an action failed. It is announced at once.
 * - `success`: an action finished, when the page shows no other result.
 */
export type NoticeTone = "info" | "warning" | "error" | "success";

const NOTICE_ICONS: Record<NoticeTone, IconName> = {
  info: "info",
  warning: "warning",
  error: "error",
  success: "success",
};

/** A message in the flow of the page, with actions under it when needed. */
export function Notice({
  tone = "info",
  title,
  actions,
  children,
}: {
  tone?: NoticeTone | undefined;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="ui-notice"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name={NOTICE_ICONS[tone]} />
      <div className="ui-notice-body">
        {title && <strong>{title}</strong>}
        <p>{children}</p>
        {actions && <div className="ui-actions">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A text with each match of a search in a colored mark. The search of the
 * backend finds a text as one piece, with no regard to case, so this does too.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) {
    return text;
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The capture group keeps each match in the list, at the odd indexes.
  return text.split(new RegExp(`(${escaped})`, "gi")).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="ui-highlight">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * What a list or a section shows when it has nothing. Say what is missing,
 * such as "No notes yet.", and give the action that adds the first one.
 * `inline` is for a section in a card, and `block` for a page or a large panel.
 */
export function EmptyState({
  variant = "inline",
  icon,
  action,
  children,
}: {
  variant?: "inline" | "block" | undefined;
  icon?: IconName | undefined;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ui-empty" data-variant={variant}>
      {icon && <Icon name={icon} />}
      <p>{children}</p>
      {action}
    </div>
  );
}
