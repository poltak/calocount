import { component, cx, h, memo, type Component } from "./dom";
import { formatNutrientAmount, goalKindFor, goalKindWord, groupedNutrientKeys, nutrientGroupLabel, nutrientLabel, nutrientUnit, nutrientKeys, type NutrientAggregateMap, type NutrientGoalMap } from "../nutrition/nutrient-meta";
import { knownAverage, trendCoverage, trendForNutrient } from "../nutrition/nutrition-calculations";
import { trendRangeSelect, type TrendRangeDays } from "./trend-range-select";

type NutrientTrendPanelProps = {
  byDate: Array<{ date: string; nutrients: NutrientAggregateMap }>;
  /** The day chosen in the dashboard, which the chart marks. */
  selectedDate?: string;
  goals?: NutrientGoalMap;
  range: TrendRangeDays;
  onRangeChange: (value: TrendRangeDays) => void;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dateLabel(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00.000Z`));
}

function oneDecimal(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function createNutrientTrendPanel(): Component<NutrientTrendPanelProps> {
  let selectedNutrient: string = nutrientKeys[0] ?? "fiberG";
  const trendPoints = memo(trendForNutrient);

  const panel = component<NutrientTrendPanelProps>(
    h("section", { class: "panel chart-panel nutrient-trend-panel", id: "nutrient-trend", "aria-labelledby": "nutrient-trend-title" }),
    ({ byDate, selectedDate, goals, range, onRangeChange }) => {
      const points = trendPoints(byDate, selectedNutrient);
      const average = knownAverage(points);
      const coverage = trendCoverage(points);
      const goal = goals?.[selectedNutrient as keyof NutrientGoalMap];
      const goalWord = goalKindWord(goalKindFor(selectedNutrient, goal));
      const max = Math.max(1, goal?.value ?? 0, ...points.map((point) => point.amount ?? 0));
      const unit = nutrientUnit(selectedNutrient);
      const goalValue = goal?.value ?? null;

      return [
        h("div", { class: "panel-heading" },
          h("div", null, h("p", { class: "eyebrow" }, "One nutrient at a time"), h("h2", { id: "nutrient-trend-title" }, "Nutrient trend")),
          trendRangeSelect({ value: range, onChange: onRangeChange, label: "Nutrient trend" }),
        ),
        h("div", { class: "nutrient-trend-controls" },
          h("label", { for: "nutrient-trend-selector" }, "Show"),
          h("select", {
            id: "nutrient-trend-selector",
            value: selectedNutrient,
            onchange: (event: Event) => {
              selectedNutrient = (event.target as HTMLSelectElement).value;
              panel.rerender();
            },
          }, groupedNutrientKeys().map(({ group, keys }) => h("optgroup", { label: nutrientGroupLabel(group) },
            keys.map((key) => h("option", { value: key }, nutrientLabel(key))),
          ))),
          h("span", { class: "panel-meta" }, unit),
        ),
        points.length ? [
          h("div", { class: "nutrient-trend-summary", "aria-live": "polite" },
            h("span", null, "Known average ", h("strong", null, average === null ? "—" : `${oneDecimal(average)} ${unit}`)),
            goalValue !== null
              ? h("span", null, `Daily ${goalWord} `, h("strong", null, `${formatNutrientAmount(goalValue, selectedNutrient)} ${unit}`))
              : h("span", null, "No daily goal"),
            h("span", { class: coverage.complete ? "coverage-complete" : "coverage-partial" }, `${coverage.knownDays} of ${coverage.totalDays} days known${coverage.complete ? "" : " · Partial"}`),
          ),
          h("div", { class: cx("nutrient-trend-chart", range === 30 && "is-month"), role: "group", "aria-label": `${nutrientLabel(selectedNutrient)} for the past ${range} days; missing days are shown as gaps` },
            h("div", { class: "nutrient-trend-y-axis", "aria-hidden": "true" }, h("span", null, oneDecimal(max)), h("span", null, oneDecimal(max / 2)), h("span", null, "0")),
            h("div", { class: "nutrient-trend-plot" },
              h("div", { class: "grid-line line-one" }), h("div", { class: "grid-line line-two" }), h("div", { class: "grid-line line-three" }),
              goalValue !== null ? h("div", { class: `nutrient-trend-goal-line goal-${goalWord}`, style: { bottom: `${Math.min(100, (goalValue / max) * 100)}%` } },
                h("span", null, `${goalWord[0].toUpperCase()}${goalWord.slice(1)}`),
              ) : null,
              h("div", { class: "nutrient-trend-bars" }, points.map((point, index) => h("button", {
                class: cx("nutrient-trend-column", point.amount === null && "missing", point.date === selectedDate && "is-selected"),
                type: "button",
                "aria-label": point.amount === null ? `${dateLabel(point.date)}: unknown` : `${dateLabel(point.date)}: ${point.amount} ${unit}`,
              },
                point.amount === null
                  ? h("span", { class: "nutrient-trend-gap", "aria-hidden": "true" }, "—")
                  : [
                    h("div", { class: "bar-value" }, oneDecimal(point.amount)),
                    h("div", { class: "bar nutrient-trend-bar", style: { height: `${Math.max(8, (point.amount / max) * 100)}%` } }),
                  ],
                h("span", null, points.length <= 7 || index === 0 || index === points.length - 1 || (index % 7 === 0 && index < points.length - 2) ? dateLabel(point.date) : ""),
              ))),
            ),
          ),
        ] : h("div", { class: "chart-empty", role: "status" }, h("strong", null, `No nutrient records for the past ${range} days`), h("span", null, "Add nutrient estimates to see a trend.")),
      ];
    },
  );
  return panel;
}
