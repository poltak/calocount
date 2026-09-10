"use client";

export type TrendRangeDays = 7 | 30;

type TrendRangeSelectProps = {
  value: TrendRangeDays;
  onChange: (value: TrendRangeDays) => void;
  label: string;
};

export function TrendRangeSelect({ value, onChange, label }: TrendRangeSelectProps) {
  return <label className="chart-range-control">
    <span className="sr-only">{label} range</span>
    <select
      className="chart-range-select"
      value={value}
      onChange={(event) => onChange(event.target.value === "30" ? 30 : 7)}
    >
      <option value={7}>Past 7 days</option>
      <option value={30}>Past 30 days</option>
    </select>
  </label>;
}
