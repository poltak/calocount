import { parseTrendRange, type TrendRange } from "../utils/trend-range.js";

/** The select in the heading of a trend panel. The panels share the choice. */
export function TrendRangeSelect({
  value,
  onChange,
  label,
}: {
  value: TrendRange;
  onChange: (range: TrendRange) => void;
  /** The name of the panel, such as "Calorie trend". */
  label: string;
}) {
  return (
    <label className="chart-range-control">
      <span className="sr-only">{`${label} range`}</span>
      <select
        className="chart-range-select"
        value={value}
        onChange={(event) => onChange(parseTrendRange(event.target.value))}
      >
        <option value={7}>Past 7 days</option>
        <option value={30}>Past 30 days</option>
      </select>
    </label>
  );
}
