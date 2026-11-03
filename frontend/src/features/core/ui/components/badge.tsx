import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "../../utils/class-names.js";
import "./components.css";

/**
 * - `neutral`: a kind or a property, such as "Personal" or "Draft".
 * - `info`: a state that waits, such as "Draft" or "Pending".
 * - `success`: a good or finished state, such as "Approved" or "Paid".
 * - `warning`: a state that needs a look, such as "Expires soon".
 * - `danger`: a bad state, such as "Failed" or "Overdue".
 */
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

const badgeVariants = cva(
  "ui-badge inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        info: "border-transparent bg-primary/8 text-[var(--color-link)] dark:bg-primary/16",
        success:
          "border-transparent bg-[var(--color-success-soft)] text-(--success)",
        warning:
          "border-transparent bg-[var(--color-notice-background)] text-[var(--color-notice-text)]",
        danger:
          "border-transparent bg-[var(--color-danger-soft)] text-(--color-danger)",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

/**
 * A short label for a state or a kind. Show no badge for a missing value,
 * such as "No label".
 */
export function Badge({
  tone = "neutral",
  dot = false,
  loading = false,
  title,
  children,
}: {
  tone?: BadgeTone | undefined;
  /** A colored dot before the text, for a state among other badges. */
  dot?: boolean | undefined;
  /** A spinner before the text, for a state that the app is working on. */
  loading?: boolean | undefined;
  /** A longer text on hover, such as why the state is a warning. */
  title?: string | undefined;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(badgeVariants({ tone }))}
      data-tone={tone}
      title={title}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
      {dot && (
        <span
          className="ui-badge-dot size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/** A number of items, beside a tab or a title. */
export function Count({
  value,
  found,
}: {
  value: number;
  /** How many of the items a search finds. It shows before the total. */
  found?: number | undefined;
}) {
  return (
    <span className="ui-count">
      {found === undefined ? value : `${found} / ${value}`}
    </span>
  );
}
