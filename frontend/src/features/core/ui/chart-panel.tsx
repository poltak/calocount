import type { ReactNode } from "react";

/**
 * The shell of a dashboard chart panel. Every panel has the same rows: the
 * heading, one summary line, one legend line and the chart. The summary and
 * the legend keep their height when empty, and the chart fills the rest of the
 * panel, so the plots of the panels in one row line up.
 */
export function ChartPanel({
  id,
  className,
  titleId,
  eyebrow,
  title,
  action,
  form,
  summary,
  legend,
  children,
}: {
  id?: string;
  className?: string;
  titleId: string;
  eyebrow: string;
  title: string;
  /** The controls at the end of the heading, such as the range select. */
  action: ReactNode;
  /** A form that opens below the heading. */
  form?: ReactNode;
  summary?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`panel chart-panel chart-card${className ? ` ${className}` : ""}`}
      id={id}
      aria-labelledby={titleId}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
        </div>
        {action}
      </div>
      {form}
      <div className="chart-summary">{summary}</div>
      <div className="chart-legend">{legend}</div>
      <div className="chart-body">{children}</div>
    </section>
  );
}
