import { h } from "./dom";

export type TrendRangeDays = 7 | 30;

type TrendRangeSelectProps = {
  value: TrendRangeDays;
  onChange: (value: TrendRangeDays) => void;
  label: string;
};

export function trendRangeSelect({ value, onChange, label }: TrendRangeSelectProps) {
  return h("label", { class: "chart-range-control" },
    h("span", { class: "sr-only" }, `${label} range`),
    h("select", {
      class: "chart-range-select",
      value,
      onchange: (event: Event) => onChange((event.target as HTMLSelectElement).value === "30" ? 30 : 7),
    },
      h("option", { value: 7 }, "Past 7 days"),
      h("option", { value: 30 }, "Past 30 days"),
    ),
  );
}
