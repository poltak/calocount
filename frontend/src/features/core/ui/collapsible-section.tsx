import type { ReactNode } from "react";
import { cx } from "../utils/class-names.js";
import { CollapsibleSectionHeading } from "./collapsible-section-heading.js";

/**
 * One container for a section that opens and closes: the heading button is its
 * top row, and the open content sits inside the same border, so each panel in
 * the content reads as part of the section. The caller owns the state. Closed,
 * the container is only the heading bar.
 */
export function CollapsibleSection({
  title,
  description,
  expanded,
  controls,
  onToggle,
  id,
  className,
  notice,
  children,
}: {
  title: string;
  /** Shown while the section is closed. */
  description?: string | undefined;
  expanded: boolean;
  /** The `id` of the content that the heading button controls. */
  controls: string;
  onToggle: () => void;
  id?: string;
  className?: string;
  /** Shown under the heading whether the section is open or closed, such as a load error. */
  notice?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={cx("collapsible-section", className)}
      id={id}
      aria-label={title}
    >
      <CollapsibleSectionHeading
        title={title}
        description={description}
        expanded={expanded}
        controls={controls}
        onToggle={onToggle}
      />
      {notice}
      <div
        className="collapsible-section-content"
        id={controls}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}
