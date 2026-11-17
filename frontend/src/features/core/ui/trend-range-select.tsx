import { parseTrendRange, type TrendRange } from "../utils/trend-range.js";

/**
 * The select in the heading of a trend panel. The panels share the choice. A
 * panel that has an "All time" view passes `onAllTime`, and `allTime` says
 * that the view is on.
 */
export function TrendRangeSelect({
  value,
  onChange,
  allTime = false,
  onAllTime,
  label,
}: {
  value: TrendRange;
  onChange: (range: TrendRange) => void;
  allTime?: boolean;
  onAllTime?: () => void;
  /** The name of the panel, such as "Calorie trend". */
  label: string;
}) {
  return (
    <label className="chart-range-control">
      <span className="sr-only">{`${label} range`}</span>
      <select
        className="chart-range-select"
        value={allTime ? "all" : value}
        onChange={(event) =>
          event.target.value === "all"
            ? onAllTime?.()
            : onChange(parseTrendRange(event.target.value))
        }
      >
        <option value={7}>Past 7 days</option>
        <option value={30}>Past 30 days</option>
        {onAllTime && <option value="all">All time</option>}
      </select>
    </label>
  );
}
