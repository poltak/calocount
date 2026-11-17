import type { ReactNode } from "react";
import { cx } from "../utils/class-names.js";

/**
 * How tight the columns sit. "dense" is for 30 days, and "packed" is for a
 * range so long that a gap between columns would be wider than the plot.
 */
export type ChartDensity = "regular" | "dense" | "packed";

export interface ChartFrameColumn {
  key: string;
  /** The date label under the column. */
  label: string;
  showLabel: boolean;
  ariaLabel: string;
  tooltip: string;
  selected: boolean;
  /** What the chart draws in the plot box of this column, such as a bar or a point. */
  content: ReactNode;
}

/**
 * The frame of every dashboard trend chart: the y-axis, the plot box with its
 * grid lines, and one button for each day with its date label and tooltip.
 * The bar chart and the weight chart both draw in it, so their plot boxes have
 * the same size and position when the panels sit in one row.
 */
export function ChartFrame({
  ariaLabel,
  density,
  yTicks,
  underlay,
  evenColumns = false,
  columns,
}: {
  ariaLabel: string;
  density: ChartDensity;
  /** Each tick sits at `percent` of the plot height, measured from the bottom. */
  yTicks: { percent: number; label: string }[];
  /** Drawn behind the columns, such as a target line or the weight line. */
  underlay?: ReactNode;
  /**
   * Columns fill the plot with no gap, so column `i` of `n` is centred at
   * `(i + 0.5) / n` of the plot width. An underlay that draws in plot percent,
   * such as the weight line, needs this to meet the points in the columns.
   */
  evenColumns?: boolean;
  columns: ChartFrameColumn[];
}) {
  return (
    <div
      className={cx(
        "chart-frame",
        density === "dense" && "is-dense",
        density === "packed" && "is-packed",
        evenColumns && "has-even-columns",
      )}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart grid.
      role="group"
      aria-label={ariaLabel}
    >
      <div className="chart-frame-axis" aria-hidden="true">
        {yTicks.map((tick) => (
          <span key={tick.percent} style={{ bottom: `${tick.percent}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
      <div className="chart-frame-plot">
        <div className="chart-frame-grid" aria-hidden="true">
          {yTicks
            .filter((tick) => tick.percent > 0)
            .map((tick) => (
              <i
                key={tick.percent}
                className="chart-frame-grid-line"
                style={{ bottom: `${tick.percent}%` }}
              />
            ))}
        </div>
        {underlay}
        <div className="chart-frame-columns">
          {columns.map((column) => (
            <button
              key={column.key}
              className={cx(
                "chart-frame-day",
                column.selected && "is-selected",
              )}
              type="button"
              aria-label={column.ariaLabel}
            >
              <span className="chart-frame-tooltip">{column.tooltip}</span>
              <span className="chart-frame-slot" aria-hidden="true">
                {column.content}
              </span>
              <span className="chart-frame-label">
                {column.showLabel ? column.label : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
