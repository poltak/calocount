import { component, h, memo, type Component } from "./dom";
import type { ProteinGoalDay } from "../../domain/protein-goals";
import type { NutrientGoalMap } from "../nutrition/nutrient-meta";
import { axisPosition, buildRepeatPoints, repeatAxisScale, repeatPointCounts, type RepeatMetric } from "../insights/days-worth-repeating-calculations";
import type { InsightDay, InsightEntry } from "../insights/types";

type Props = {
  days: InsightDay[];
  entries: InsightEntry[];
  currentDate: string;
  calorieTarget: number | null;
  proteinGoals: ProteinGoalDay[];
  fallbackProteinTarget: number | null;
  nutrientGoals: NutrientGoalMap;
};

const BANDS = {
  "80–120%": [80, 120],
  "90–110%": [90, 110],
  "95–105%": [95, 105],
} as const;

const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`));

function selectValue(event: Event) {
  return (event.target as HTMLSelectElement).value;
}

export function createDaysWorthRepeating(): Component<Props> {
  let range: 7 | 30 = 30;
  let metric: RepeatMetric = "protein";
  let bandName: keyof typeof BANDS = "90–110%";
  let selectedDate: string | null = null;
  const repeatPoints = memo((
    days: Props["days"], currentDate: string, calorieTarget: number | null, proteinGoals: ProteinGoalDay[],
    fallbackProteinTarget: number | null, nutrientGoals: NutrientGoalMap, pointRange: 7 | 30, pointMetric: RepeatMetric, band: keyof typeof BANDS,
  ) => buildRepeatPoints({ days, currentDate, calorieTarget, proteinGoals, fallbackProteinTarget, nutrientGoals, range: pointRange, metric: pointMetric, calorieBand: BANDS[band] }));

  const panel = component<Props>(
    h("section", { class: "panel days-repeat", "aria-labelledby": "days-repeat-title" }),
    ({ days, entries, currentDate, calorieTarget, proteinGoals, fallbackProteinTarget, nutrientGoals }) => {
      const points = repeatPoints(days, currentDate, calorieTarget, proteinGoals, fallbackProteinTarget, nutrientGoals, range, metric, bandName);
      const plotted = points.filter((point) => point.caloriePercent !== null && point.percent !== null);
      const xScale = repeatAxisScale(plotted.map((point) => point.caloriePercent));
      const yScale = repeatAxisScale(plotted.map((point) => point.percent));
      const counts = repeatPointCounts(points);
      const selected = points.find((point) => point.date === selectedDate) ?? plotted.at(-1) ?? points.at(-1) ?? null;
      const selectedEntries = selected ? entries.filter((entry) => entry.date === selected.date).sort((a, b) => a.consumedAt - b.consumedAt) : [];
      const metricName = metric === "protein" ? "Protein" : "Fiber";
      const selectDate = (date: string) => {
        selectedDate = date;
        panel.rerender();
      };

      return [
        h("div", { class: "days-repeat-heading" },
          h("div", null,
            h("h2", { id: "days-repeat-title" }, "Days worth repeating"),
            h("p", null, "Find past logged days that matched the targets you use now, then inspect what you ate and drank. Today is excluded."),
          ),
          h("div", { class: "days-repeat-controls" },
            h("label", null, "Range", h("select", { value: range, onchange: (event: Event) => { range = Number(selectValue(event)) as 7 | 30; panel.rerender(); } },
              h("option", { value: 7 }, "Last 7 days"), h("option", { value: 30 }, "Last 30 days"))),
            h("label", null, "Vertical axis", h("select", { value: metric, onchange: (event: Event) => { metric = selectValue(event) as RepeatMetric; panel.rerender(); } },
              h("option", { value: "protein" }, "Protein"), h("option", { value: "fiber" }, "Fiber"))),
            h("label", null, "Calorie band", h("select", { value: bandName, onchange: (event: Event) => { bandName = selectValue(event) as keyof typeof BANDS; panel.rerender(); } },
              Object.keys(BANDS).map((name) => h("option", null, name)))),
          ),
        ),

        points.length === 0 ? h("p", { class: "days-repeat-empty" }, "No past logged days are available in this range yet.") : [
          h("p", { class: "days-repeat-summary" },
            `Showing ${counts.displayed} of ${points.length} logged days. `,
            counts.unknownMetric > 0 ? `${counts.unknownMetric} lack a usable ${metric} target or value. ` : null,
            metric === "fiber" && counts.partialMetric > 0 ? `${counts.partialMetric} have partial fiber coverage.` : null,
          ),
          counts.unknownCalories > 0 ? h("p", { class: "days-repeat-empty" }, "A positive current calorie target is needed to place days on the horizontal axis.") : null,
          h("div", { class: "days-repeat-legend", "aria-label": "Chart legend" },
            h("span", null, h("i", { class: "repeat-dot joint" }), `Calorie band and ${metric} target met`),
            h("span", null, h("i", { class: "repeat-dot in-band" }), "Calorie band only"),
            h("span", null, h("i", { class: "repeat-dot" }), "Outside calorie band"),
            metric === "fiber" ? h("span", null, h("i", { class: "repeat-dot partial" }), "Partial fiber data") : null,
          ),
          h("div", { class: "repeat-chart-wrap" },
            h("div", { class: "repeat-y-title" }, `${metricName} (% of current target)`),
            h("div", { class: "repeat-chart", role: "group", "aria-label": `Scatter plot of calories and ${metric} as percentages of current targets` },
              h("div", { class: "repeat-chart-plot" },
                h("span", { class: "repeat-success-zone", "aria-hidden": "true", style: { left: `${axisPosition(BANDS[bandName][0], xScale)}%`, width: `${axisPosition(BANDS[bandName][1] - BANDS[bandName][0], xScale)}%`, bottom: `${axisPosition(100, yScale)}%` } }),
                h("span", { class: "repeat-guide y", "aria-hidden": "true", style: { bottom: `${axisPosition(100, yScale)}%` } }),
                h("span", { class: "repeat-guide x", "aria-hidden": "true", style: { left: `${axisPosition(100, xScale)}%` } }),
                xScale.ticks.map((tick) => h("span", { class: "repeat-tick x", style: { left: `${axisPosition(tick, xScale)}%` } }, `${tick}%`)),
                yScale.ticks.map((tick) => h("span", { class: "repeat-tick y", style: { bottom: `${axisPosition(tick, yScale)}%` } }, `${tick}%`)),
                plotted.map((point) => h("button", {
                  type: "button",
                  class: `repeat-point ${point.meetsBothTargets ? "joint" : point.inCalorieBand ? "in-band" : ""} ${point.coverage === "partial" ? "partial" : ""} ${selected?.date === point.date ? "selected" : ""}`,
                  style: { left: `${axisPosition(point.caloriePercent!, xScale)}%`, bottom: `${axisPosition(point.percent!, yScale)}%` },
                  "aria-label": `${formatDate(point.date)}: ${Math.round(point.caloriePercent!)}% of calorie target, ${Math.round(point.percent!)}% of ${metric} target${point.coverage === "partial" ? ", partial fiber data" : ""}`,
                  onclick: () => selectDate(point.date),
                })),
                plotted.length === 0 ? h("p", { class: "days-repeat-chart-empty" }, "No days have both targets available.") : null,
              ),
            ),
            h("div", { class: "repeat-x-title" }, "Calories (% of current target)"),
          ),

          h("label", { class: "repeat-date-select" }, "Inspect a day", h("select", { value: selected?.date ?? "", onchange: (event: Event) => selectDate(selectValue(event)) },
            h("option", { value: "", disabled: true }, "Select a date"),
            points.map((point) => h("option", { value: point.date }, formatDate(point.date))),
          )),
          selected ? h("div", { class: "repeat-details", "aria-live": "polite" },
            h("h3", null, formatDate(selected.date)),
            h("p", null,
              selected.caloriePercent === null ? `${Math.round(selected.calories)} kcal; calorie target unavailable.` : `${Math.round(selected.caloriePercent)}% of the current calorie target.`,
              " ",
              selected.percent === null ? `${metricName} comparison unavailable.` : `${Math.round(selected.percent)}% of the current ${metric} target.`,
              " ",
              selected.coverage === "partial" ? (selected.targetMet ? "The known fiber amount reaches the target, but some items lack fiber data." : "Fiber data is partial, so target status is uncertain.") : null,
            ),
            h("h4", null, "Food and drink logged"),
            selectedEntries.length === 0
              ? h("p", { class: "days-repeat-empty" }, "No entry details are available for this day.")
              : h("ul", null, selectedEntries.flatMap((entry) => entry.items.map((item) => h("li", null,
                h("span", null, item.name),
                h("small", null, `${item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · ` : ""}${Math.round(item.calories)} kcal · ${Math.round(item.proteinG)} g protein`),
              )))),
          ) : null,
          h("p", { class: "days-repeat-note" }, "Comparisons use your current calorie, nutrient, and per-day protein targets. Per-kilogram protein targets can differ by date. The calorie band is a matching filter, not a judgment that fewer calories are healthier."),
        ],
      ];
    },
  );
  return panel;
}
