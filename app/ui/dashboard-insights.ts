import { component, cx, h, type Component } from "./dom";
import type { ProteinGoalDay } from "../../domain/protein-goals";
import type { NutrientAggregateMap, NutrientGoalMap, NutrientKey, NutrientValueMap } from "../nutrition/nutrient-meta";
import { nutrientLabel, nutrientUnit } from "../nutrition/nutrient-meta";
import { normalizeFoodName } from "../insights/shared";
import { trendRangeSelect, type TrendRangeDays } from "./trend-range-select";

type TrendDatum = {
  date: string;
  label: string;
  proteinG: number;
  mealCount: number;
  nutrients: NutrientAggregateMap;
};

type FoodItem = {
  name: string;
  calories?: number;
  proteinG?: number;
  nutrients?: NutrientValueMap;
};

type LoggedMeal = { items: FoodItem[] };
type LoggedDay = { date: string; meals: LoggedMeal[] };

function format(value: number, digits = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function showDate(index: number, total: number) {
  return total <= 7 || index === 0 || index === total - 1 || (index % 7 === 0 && index < total - 2);
}

export function proteinTargetChart({
  days,
  selectedDate,
  goalByDate,
  fallbackTarget,
  range,
  onRangeChange,
}: {
  days: TrendDatum[];
  /** The day chosen in the dashboard, which the chart marks. */
  selectedDate: string;
  goalByDate: ProteinGoalDay[];
  fallbackTarget: number | null;
  range: TrendRangeDays;
  onRangeChange: (range: TrendRangeDays) => void;
}) {
  const targets = new Map(goalByDate.map((entry) => [entry.date, entry.targetG]));
  const values = days.map((day) => ({ ...day, target: targets.get(day.date) ?? fallbackTarget }));
  const max = Math.max(1, ...values.flatMap((day) => [day.proteinG, day.target ?? 0])) * 1.12;
  const knownDays = values.filter((day) => day.mealCount > 0);
  const average = knownDays.length ? knownDays.reduce((sum, day) => sum + day.proteinG, 0) / knownDays.length : 0;
  const targetDays = knownDays.filter((day) => day.target !== null && day.target > 0);
  const hitDays = targetDays.filter((day) => day.proteinG >= (day.target ?? Infinity)).length;

  return h("section", { class: "panel chart-panel protein-target-panel", "aria-labelledby": "protein-target-title" },
    h("div", { class: "panel-heading" },
      h("div", null, h("p", { class: "eyebrow" }, "Daily amount"), h("h2", { id: "protein-target-title" }, "Protein vs target")),
      trendRangeSelect({ value: range, onChange: onRangeChange, label: "Protein versus target" }),
    ),
    h("div", { class: "insight-summary" },
      h("span", null, h("strong", null, `${format(average)} g`), " known-day average"),
      h("span", null, h("strong", null, `${hitDays} of ${targetDays.length}`), " recorded days met target"),
    ),
    h("div", { class: cx("protein-target-chart", range === 30 && "is-month"), role: "group", "aria-label": `Daily protein in grams compared with the protein target for the past ${range} days` },
      values.map((day, index) => {
        const targetPercent = day.target ? Math.min(100, (day.target / max) * 100) : null;
        return h("button", {
          key: day.date,
          class: cx("protein-target-day", day.mealCount === 0 && "missing", day.date === selectedDate && "is-selected"),
          type: "button",
          "aria-label": day.mealCount > 0
            ? `${day.label}: ${format(day.proteinG)} grams protein${day.target ? `, target ${format(day.target)} grams` : ""}`
            : `${day.label}: no entries recorded`,
        },
          h("span", { class: "protein-target-tooltip" }, day.mealCount > 0 ? `${format(day.proteinG)}g${day.target ? ` / ${format(day.target)}g` : ""}` : "No meals"),
          h("span", { class: "protein-target-track", "aria-hidden": "true" },
            targetPercent === null ? null : h("i", { class: "protein-target-marker", style: { bottom: `${targetPercent}%` } }),
            h("i", { class: "protein-target-fill", style: { height: `${Math.min(100, (day.proteinG / max) * 100)}%` } }),
          ),
          h("span", null, showDate(index, values.length) ? day.label : ""),
        );
      }),
    ),
  );
}

const foodMetrics = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "saturatedFatG", label: "Saturated fat", unit: "g" },
] as const;

type FoodMetricKey = (typeof foodMetrics)[number]["key"];

export function createFoodContributionChart(): Component<{ days: LoggedDay[]; visibleDates: string[] }> {
  let metric: FoodMetricKey = "calories";

  const chart = component<{ days: LoggedDay[]; visibleDates: string[] }>(
    h("section", { class: "panel chart-panel food-contribution-panel", "aria-labelledby": "food-contribution-title" }),
    ({ days, visibleDates }) => {
      const metricMeta = foodMetrics.find((entry) => entry.key === metric) ?? foodMetrics[0];
      const dateSet = new Set(visibleDates);
      const totals = new Map<string, { label: string; value: number; occurrences: number }>();
      for (const day of days) {
        if (!dateSet.has(day.date)) continue;
        for (const item of day.meals.flatMap((meal) => meal.items)) {
          const raw = metric === "calories" || metric === "proteinG" ? item[metric] : item.nutrients?.[metric];
          if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) continue;
          const normalized = normalizeFoodName(item.name);
          const current = totals.get(normalized) ?? { label: item.name.trim() || "Unnamed food", value: 0, occurrences: 0 };
          current.value += raw;
          current.occurrences += 1;
          totals.set(normalized, current);
        }
      }
      const rows = [...totals.values()].sort((left, right) => right.value - left.value).slice(0, 6);
      const max = rows[0]?.value ?? 1;

      return [
        h("div", { class: "panel-heading" },
          h("div", null, h("p", { class: "eyebrow" }, "What drives your totals"), h("h2", { id: "food-contribution-title" }, "Top food contributors")),
          h("label", { class: "compact-select" }, "Show ", h("select", {
            value: metric,
            onchange: (event: Event) => {
              metric = (event.target as HTMLSelectElement).value as FoodMetricKey;
              chart.rerender();
            },
          }, foodMetrics.map((entry) => h("option", { value: entry.key }, entry.label)))),
        ),
        rows.length ? h("div", { class: "contribution-list", role: "list", "aria-label": `Foods contributing the most ${metricMeta.label.toLocaleLowerCase()}` },
          rows.map((row) => h("div", { class: "contribution-row", role: "listitem" },
            h("div", { class: "contribution-label" }, h("strong", { title: row.label }, row.label), h("span", null, `${row.occurrences} ${row.occurrences === 1 ? "entry" : "entries"}`)),
            h("div", { class: "contribution-bar" }, h("i", { style: { width: `${(row.value / max) * 100}%` } })),
            h("span", { class: "contribution-value" }, `${format(row.value)} ${metricMeta.unit}`),
          )),
        ) : h("div", { class: "chart-empty compact-empty", role: "status" }, h("strong", null, `No ${metricMeta.label.toLocaleLowerCase()} data in this range`), h("span", null, "Logged food items will appear here.")),
      ];
    },
  );
  return chart;
}

const matrixNutrients: NutrientKey[] = ["fiberG", "saturatedFatG", "sodiumMg", "potassiumMg", "calciumMg", "ironMg"];

export function nutrientConsistencyMatrix({ days, selectedDate, goals }: { days: TrendDatum[]; selectedDate: string; goals: NutrientGoalMap }) {
  const visible = days.slice(-7);
  return h("section", { class: "panel chart-panel consistency-panel", "aria-labelledby": "consistency-title" },
    h("div", { class: "panel-heading" },
      h("div", null, h("p", { class: "eyebrow" }, "Seven-day pattern"), h("h2", { id: "consistency-title" }, "Nutrient consistency")),
      h("span", { class: "panel-meta" }, "target progress"),
    ),
    h("div", { class: "matrix-legend", "aria-hidden": "true" },
      h("span", null, h("i", { class: "matrix-key low" }), " Below goal"),
      h("span", null, h("i", { class: "matrix-key met" }), " On target"),
      h("span", null, h("i", { class: "matrix-key over" }), " Over limit"),
      h("span", null, h("i", { class: "matrix-key partial" }), " Partial data"),
    ),
    h("div", { class: "consistency-scroll" },
      h("div", { class: "consistency-matrix", style: { "--matrix-columns": visible.length } },
        h("div"),
        visible.map((day) => h("strong", { class: cx("matrix-date", day.date === selectedDate && "is-selected") }, day.label.replace(" ", "\n"))),
        matrixNutrients.map((key) => {
          const goal = goals[key];
          return h("div", { class: "matrix-row" },
            h("div", { class: "matrix-label" },
              h("strong", null, nutrientLabel(key)),
              h("span", null, `${goal?.direction === "maximum" ? "limit" : "goal"} ${goal?.value ? `${format(goal.value)} ${nutrientUnit(key)}` : "off"}`),
            ),
            visible.map((day) => {
              const aggregate = day.nutrients[key];
              const amount = aggregate?.amount;
              const progress = typeof amount === "number" && goal?.value ? (amount / goal.value) * 100 : null;
              const met = progress !== null && (goal.direction === "minimum" ? progress >= 100 : progress <= 100);
              const intensity = progress === null ? 0 : Math.min(100, Math.max(12, progress));
              const coverage = aggregate && aggregate.totalItemCount > 0 ? aggregate.knownItemCount / aggregate.totalItemCount : 0;
              const state = progress === null ? "unknown" : met ? "met" : goal?.direction === "maximum" ? "over" : "low";
              const label = progress === null ? "unknown" : `${format(amount ?? 0)} ${nutrientUnit(key)}, ${Math.round(progress)}% of ${goal?.direction === "maximum" ? "limit" : "goal"}`;
              return h("button", {
                type: "button",
                class: cx("matrix-cell", state, coverage < 1 && progress !== null && "partial"),
                style: { "--cell-intensity": `${intensity}%`, "--cell-coverage": coverage },
                "aria-label": `${day.label}, ${nutrientLabel(key)}: ${label}`,
              }, h("span", null, progress === null ? "—" : `${Math.round(progress)}%`));
            }),
          );
        }),
      ),
    ),
  );
}
