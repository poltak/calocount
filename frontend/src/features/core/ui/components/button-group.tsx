import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import "./components.css";

const groupVariants = cva(
  "ui-button-group isolate m-0 inline-flex min-w-0 w-fit border-0 p-0 [&>.ui-button]:relative [&>.ui-button:focus-visible]:z-10",
  {
    variants: {
      orientation: {
        horizontal:
          "[&>.ui-button:not(:first-child)]:-ml-px [&>.ui-button:not(:first-child)]:rounded-l-none [&>.ui-button:not(:last-child)]:rounded-r-none",
        vertical:
          "flex-col [&>.ui-button:not(:first-child)]:-mt-px [&>.ui-button:not(:first-child)]:rounded-t-none [&>.ui-button:not(:last-child)]:rounded-b-none",
      },
    },
    defaultVariants: { orientation: "horizontal" },
  },
);

export function ButtonGroup({
  label,
  orientation = "horizontal",
  children,
}: {
  label: string;
  orientation?: "horizontal" | "vertical" | undefined;
  children: ReactNode;
}) {
  return (
    <fieldset
      aria-label={label}
      data-slot="button-group"
      data-orientation={orientation}
      className={groupVariants({ orientation })}
    >
      {children}
    </fieldset>
  );
}
