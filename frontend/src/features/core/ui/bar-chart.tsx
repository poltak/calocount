import { ChartFrame } from "./chart-frame.js";

type BarTone = "calorie" | "protein" | "carbs" | "fat";

export interface BarChartBar {
  key: string;
  /** The date label under the bar. */
  label: string;
  showLabel: boolean;
  ariaLabel: string;
  tooltip: string;
  selected: boolean;
  /** A day without data has no fill and shows a dash. */
  missing: boolean;
  /** One segment is a plain bar. Several are a stacked bar, from the bottom up. */
  segments: { value: number; tone: BarTone }[];
  /** The marker of this bar's own target, in value units. */
  target?: number | null;
}

/**
 * The column chart of the dashboard trend panels. Each bar is a button in the
 * shared chart frame, so the panel can select a day and the tooltip shows on
 * hover and on focus.
 */
export function BarChart({
  ariaLabel,
  dense,
  yTicks,
  max,
  targetLine,
  bars,
}: {
  ariaLabel: string;
  /** The layout of a 30-day range, with narrow bars. */
  dense: boolean;
  yTicks: { value: number; label: string }[];
  max: number;
  targetLine?: { value: number; label: string };
  bars: BarChartBar[];
}) {
  const percent = (value: number) => Math.min(100, (value / max) * 100);
  return (
    <ChartFrame
      ariaLabel={ariaLabel}
      density={dense ? "dense" : "regular"}
      yTicks={yTicks.map((tick) => ({
        percent: percent(tick.value),
        label: tick.label,
      }))}
      underlay={
        targetLine && (
          <div
            className="column-chart-goal"
            style={{
              bottom: `calc(21px + (100% - 21px) * ${Math.min(1, targetLine.value / max)})`,
            }}
          >
            <span>{targetLine.label}</span>
          </div>
        )
      }
      columns={bars.map((bar) => {
        const total = bar.segments.reduce(
          (sum, segment) => sum + segment.value,
          0,
        );
        return {
          key: bar.key,
          label: bar.label,
          showLabel: bar.showLabel,
          ariaLabel: bar.ariaLabel,
          tooltip: bar.tooltip,
          selected: bar.selected,
          content: (
            <span className="column-chart-track">
              {bar.target ? (
                <i
                  className="column-chart-marker"
                  style={{ bottom: `${percent(bar.target)}%` }}
                />
              ) : null}
              {bar.missing && <span className="column-chart-gap">—</span>}
              {!bar.missing && total > 0 && (
                <span
                  className="column-chart-fill"
                  style={{ height: `${percent(total)}%` }}
                >
                  {bar.segments
                    .filter((segment) => segment.value > 0)
                    .map((segment, index) => (
                      <i
                        // oxlint-disable-next-line react/no-array-index-key -- The segments never reorder.
                        key={index}
                        className={`column-chart-segment tone-${segment.tone}`}
                        style={{
                          height: `${(segment.value / total) * 100}%`,
                        }}
                      />
                    ))}
                </span>
              )}
            </span>
          ),
        };
      })}
    />
  );
}
