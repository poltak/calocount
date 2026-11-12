import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";
import "./components.css";
import { Badge } from "../shadcn/badge.js";
import { Icon } from "./icon.js";

/**
 * A part that opens and closes, such as the history of an item. Pass `open`
 * and `onToggle` when a Logic keeps the state, else Base UI keeps it.
 */
export function Disclosure({
  summary,
  count,
  open,
  onToggle,
  actions,
  revealActions = false,
  children,
}: {
  summary: ReactNode;
  count?: number | undefined;
  open?: boolean | undefined;
  onToggle?: ((open: boolean) => void) | undefined;
  /** Buttons at the right of the summary, such as Edit. */
  actions?: ReactNode;
  /** The buttons show only while the pointer is on the summary. */
  revealActions?: boolean | undefined;
  children: ReactNode;
}) {
  const controlled = onToggle !== undefined && open !== undefined;
  const details = (
    <Collapsible.Root
      // With no `onToggle`, a new `open` starts the part again from that value.
      key={controlled ? undefined : String(open)}
      className="ui-disclosure"
      data-slot="disclosure"
      open={controlled ? open : undefined}
      defaultOpen={controlled ? undefined : (open ?? false)}
      onOpenChange={(nextOpen) => onToggle?.(nextOpen)}
    >
      <Collapsible.Trigger
        className="ui-disclosure-trigger"
        data-slot="disclosure-trigger"
      >
        <Icon name="chevron-right" />
        {summary}
        {count !== undefined && <Badge variant="secondary">{count}</Badge>}
      </Collapsible.Trigger>
      <Collapsible.Panel
        className="ui-disclosure-body"
        data-slot="disclosure-content"
        keepMounted
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
  if (!actions) {
    return details;
  }
  return (
    <div
      className="ui-disclosure-frame"
      data-reveal-actions={revealActions ? "" : undefined}
    >
      {details}
      <span className="ui-actions">{actions}</span>
    </div>
  );
}
