import { ChevronRightIcon } from "lucide-react";
import { cx } from "../utils/class-names.js";

/**
 * The heading of a section that opens and closes. The whole row is one button,
 * so a closed section looks like a bar to click. The caller owns the state and
 * gives the `id` of the content that the button controls. The button is named
 * by the title alone, and the description is its accessible description.
 */
export function CollapsibleSectionHeading({
  title,
  description,
  expanded,
  controls,
  onToggle,
}: {
  title: string;
  /** Shown while the section is closed. */
  description?: string | undefined;
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const titleId = `${controls}-heading-title`;
  const descriptionId = `${controls}-heading-description`;
  const showsDescription = !expanded && description !== undefined;
  return (
    <h2 className="collapsible-heading">
      <button
        type="button"
        className={cx("collapsible-heading-button", expanded && "is-open")}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-labelledby={titleId}
        aria-describedby={showsDescription ? descriptionId : undefined}
        onClick={onToggle}
      >
        <ChevronRightIcon
          className="collapsible-heading-chevron"
          aria-hidden="true"
        />
        <span className="collapsible-heading-text">
          <span className="collapsible-heading-line">
            <span className="collapsible-heading-title" id={titleId}>
              {title}
            </span>
            <span className="collapsible-heading-action" aria-hidden="true">
              {expanded ? "Hide" : "Show"}
            </span>
          </span>
          {showsDescription && (
            <span
              className="collapsible-heading-description"
              id={descriptionId}
            >
              {description}
            </span>
          )}
        </span>
      </button>
    </h2>
  );
}
