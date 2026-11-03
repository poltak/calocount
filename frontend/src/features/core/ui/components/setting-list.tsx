import { useEffect, useRef, type ReactNode } from "react";
import "./components.css";

/** Brings the element into view each time `highlighted` turns on. */
function useRevealWhen<Element extends HTMLElement>(highlighted: boolean) {
  const ref = useRef<Element>(null);
  useEffect(() => {
    if (highlighted) {
      ref.current?.scrollIntoView({ block: "center" });
    }
  }, [highlighted]);
  return ref;
}

/** A titled part of the settings: its rows, in one card, with a line between them. */
export function SettingGroup({
  title,
  description,
  highlighted = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** The search led here: the group scrolls into view and pulses once. */
  highlighted?: boolean | undefined;
  children: ReactNode;
}) {
  const ref = useRevealWhen<HTMLElement>(highlighted);
  return (
    <section
      ref={ref}
      className="ui-setting-group"
      aria-label={title}
      data-target={highlighted ? "" : undefined}
    >
      <h2>{title}</h2>
      {description && <p className="ui-setting-note">{description}</p>}
      <div className="ui-setting-rows">{children}</div>
    </section>
  );
}

/** One setting: its name and meaning on the left, and its control on the right. */
export function SettingRow({
  title,
  description,
  control,
  highlighted = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A select, a button, or a short value. */
  control?: ReactNode;
  /** The search led here: the row scrolls into view and pulses once. */
  highlighted?: boolean | undefined;
  /** A part under the row, such as a form, a list, or a notice. */
  children?: ReactNode;
}) {
  const ref = useRevealWhen<HTMLDivElement>(highlighted);
  return (
    <div
      ref={ref}
      className="ui-setting-row"
      data-target={highlighted ? "" : undefined}
    >
      <div className="ui-setting-row-head">
        <div className="ui-setting-row-text">
          <div className="ui-setting-row-title">{title}</div>
          {description && <p className="ui-setting-note">{description}</p>}
        </div>
        {control && <div className="ui-setting-row-control">{control}</div>}
      </div>
      {children && <div className="ui-setting-row-body">{children}</div>}
    </div>
  );
}
