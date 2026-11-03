import { cva } from "class-variance-authority";
import { cn } from "../../utils/class-names.js";
import "./components.css";

const loadingVariants = cva(
  "ui-loading flex items-center gap-2 text-sm text-muted-foreground",
  {
    variants: {
      variant: {
        inline: "",
        block: "justify-center px-4 py-8",
      },
    },
    defaultVariants: {
      variant: "inline",
    },
  },
);

/**
 * What shows while data loads. Write the label as "Loading the <thing>…".
 * - `inline`: in a card or a row, beside other content.
 * - `block`: in the place of a whole page or panel. The page header stays.
 * - `skeleton`: gray lines in the shape of text that comes, such as a summary.
 */
export function Loading({
  label,
  variant = "inline",
  lines = 3,
}: {
  label: string;
  variant?: "inline" | "block" | "skeleton" | undefined;
  /** The number of lines of a skeleton. */
  lines?: number | undefined;
}) {
  if (variant === "skeleton") {
    return (
      <output className="ui-skeleton grid w-full gap-2" aria-label={label}>
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className="ui-skeleton-line h-3 animate-pulse rounded-sm bg-secondary motion-reduce:animate-none"
            aria-hidden="true"
          />
        ))}
      </output>
    );
  }
  return (
    <output className={cn(loadingVariants({ variant }))} data-variant={variant}>
      <span
        className="ui-spinner size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        aria-hidden="true"
      />
      {label}
    </output>
  );
}
