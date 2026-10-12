import { component, cx, h, memo, svg, type Component } from "./dom";
import type { InsightDay, InsightEntry } from "../insights/types";
import {
  calculateWaterfall,
  calculateWeeklyChanges,
  type WaterfallContribution,
  type WeeklyMetricKey,
} from "../insights/weekly-changes-calculations";

export type WeeklyChangesProps = {
  days: InsightDay[];
  entries: InsightEntry[];
  currentDate: string;
};

const metricMeta: Record<WeeklyMetricKey, { label: string; unit: string; digits: number }> = {
  calories: { label: "Calories", unit: "kcal", digits: 0 },
  proteinG: { label: "Protein", unit: "g", digits: 1 },
  fiberG: { label: "Fiber", unit: "g", digits: 1 },
  sodiumMg: { label: "Sodium", unit: "mg", digits: 0 },
  caffeineMg: { label: "Caffeine", unit: "mg", digits: 0 },
};

const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function format(value: number | null, key: WeeklyMetricKey, signed = false) {
  if (value === null) return "Unavailable";
  const meta = metricMeta[key];
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: meta.digits,
    minimumFractionDigits: 0,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
  return `${amount} ${meta.unit}`;
}

function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return shortDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

function periodLabel(start: string, end: string) {
  return `${shortDate(start)}–${shortDate(end)}`;
}

function coverage(itemCount: number | null, totalCount: number | null) {
  if (itemCount === null || totalCount === null) return null;
  return `${itemCount} of ${totalCount} items have values`;
}

function waterfallChart({ before, after, items, selected, metric, onSelect }: {
  before: number;
  after: number;
  items: WaterfallContribution[];
  selected: string | null;
  metric: WeeklyMetricKey;
  onSelect: (key: string) => void;
}) {
  const geometry: Array<{ item: WaterfallContribution; start: number; end: number }> = [];
  const values = [0, before, after];
  let running = before;
  for (const item of items) {
    const end = running + item.difference;
    geometry.push({ item, start: running, end });
    values.push(running, end);
    running = end;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const plotTop = 30;
  const plotHeight = 170;
  const y = (value: number) => plotTop + ((max - value) / span) * plotHeight;
  const columns = items.length + 2;
  const plotLeft = 62;
  const plotWidth = 520;
  const step = plotWidth / columns;
  const width = Math.min(50, step * 0.58);
  const bars = [
    { key: "before", label: "Before", start: 0, end: before, total: true },
    ...geometry.map(({ item, start, end }) => ({ key: item.key, label: item.label, start, end, total: false })),
    { key: "after", label: "After", start: 0, end: after, total: true },
  ];
  return svg("svg", { class: "weekly-waterfall", viewBox: "0 0 600 260", role: "img", "aria-label": `${metricMeta[metric].label} average change waterfall` },
    [max, (max + min) / 2, min].map((tick) => svg("g", null,
      svg("line", { x1: plotLeft, x2: 582, y1: y(tick), y2: y(tick), class: "weekly-waterfall-grid" }),
      svg("text", { x: "55", y: y(tick) + 4, "text-anchor": "end" }, format(tick, metric)),
    )),
    svg("line", { x1: plotLeft, x2: "582", y1: y(0), y2: y(0), class: "weekly-waterfall-zero" }),
    bars.map((bar, index) => {
      const top = Math.min(y(bar.start), y(bar.end));
      const height = Math.abs(y(bar.start) - y(bar.end));
      const x = plotLeft + step * index + step / 2 - width / 2;
      const contribution = items.find((item) => item.key === bar.key);
      const interactive = Boolean(contribution);
      return svg("g", interactive ? {
        role: "button",
        tabindex: 0,
        "aria-label": `${bar.label}, ${format(contribution?.difference ?? 0, metric, true)}. Show source entries.`,
        onclick: () => onSelect(bar.key),
        onkeydown: (event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(bar.key);
          }
        },
      } : null,
        index > 0 && !bar.total ? svg("line", { x1: x - step + width, x2: x, y1: y(bar.start), y2: y(bar.start), class: "weekly-waterfall-connector" }) : null,
        height > .01
          ? svg("rect", { x, y: top, width, height, rx: "1.5", class: `${bar.total ? "total" : bar.end >= bar.start ? "increase" : "decrease"}${selected === bar.key ? " selected" : ""}` })
          : svg("line", { x1: x, x2: x + width, y1: y(bar.start), y2: y(bar.start), class: "weekly-waterfall-neutral" }),
        svg("text", { x: x + width / 2, y: "225", "text-anchor": "middle" }, bar.total ? bar.label : String(index)),
      );
    }),
    svg("text", { x: "62", y: "250" }, `Daily average (${metricMeta[metric].unit})`),
  );
}

function sourceList({ label, sources, metric }: { label: string; sources: WaterfallContribution["previousSources"]; metric: WeeklyMetricKey }) {
  return h("div", null,
    h("h5", null, label),
    sources.length ? h("ul", null, sources.map((source) => h("li", null,
      h("span", null, `${source.name} · ${shortDate(source.date)}`),
      h("strong", null, `${format(source.amount, metric)} logged · ${format(source.contribution, metric)}/recorded day`),
    ))) : h("p", null, "No matching entry details."),
  );
}

function contributionDetails({ item, metric }: { item: WaterfallContribution; metric: WeeklyMetricKey }) {
  return h("div", { class: "weekly-source-detail", "aria-live": "polite" },
    h("h4", null, item.label),
    h("p", null, `Before ${format(item.previous, metric)} · After ${format(item.current, metric)}`),
    item.kind === "unavailable"
      ? h("p", null, "Available entry details do not fully match the recorded daily totals, so this amount cannot be assigned to a food or drink.")
      : h("div", { class: "weekly-source-columns" },
        sourceList({ label: "Before sources", sources: item.previousSources, metric }),
        sourceList({ label: "After sources", sources: item.currentSources, metric }),
      ),
  );
}

export function createWeeklyChanges(): Component<WeeklyChangesProps> {
  let selectedMetric: WeeklyMetricKey = "calories";
  let selectedKey: string | null = null;
  const weeklyChanges = memo(calculateWeeklyChanges);

  const panel = component<WeeklyChangesProps>(
    h("section", { class: "panel weekly-changes", "aria-labelledby": "weekly-changes-title" }),
    ({ days, entries, currentDate }) => {
      const result = weeklyChanges(days, entries, currentDate);
      const waterfall = calculateWaterfall(result.previous, result.current, selectedMetric);
      const selected = waterfall.find((item) => item.key === selectedKey) ?? null;
      const before = result.metrics[selectedMetric].previous.average;
      const after = result.metrics[selectedMetric].current.average;
      const selectKey = (key: string) => {
        selectedKey = key;
        panel.rerender();
      };

      return [
        h("div", { class: "panel-heading weekly-changes-heading" },
          h("div", null,
            h("h2", { id: "weekly-changes-title" }, "What changed this week?"),
            h("p", { class: "panel-meta" }, "Daily averages use recorded days only. Today is excluded."),
          ),
        ),

        h("div", { class: "weekly-period-key", "aria-label": "Compared periods" },
          h("span", null, h("i", { class: "previous" }), `Before · ${periodLabel(result.previous.start, result.previous.end)} · ${result.previous.days.length}/7 recorded days`),
          h("span", null, h("i", { class: "current" }), `After · ${periodLabel(result.current.start, result.current.end)} · ${result.current.days.length}/7 recorded days`),
        ),

        h("div", { class: "weekly-metrics" },
          (Object.keys(metricMeta) as WeeklyMetricKey[]).map((key) => {
            const comparison = result.metrics[key];
            const nutrient = key !== "calories" && key !== "proteinG";
            const difference = comparison.previous.average === null || comparison.current.average === null
              ? null : comparison.current.average - comparison.previous.average;
            return h("article", { class: cx("weekly-metric", selectedMetric === key && "selected") },
              h("button", { type: "button", "aria-pressed": selectedMetric === key, onclick: () => { selectedMetric = key; selectedKey = null; panel.rerender(); } },
                h("h3", null, metricMeta[key].label, nutrient ? h("small", null, "known logged amount") : null),
                h("div", { class: "weekly-metric-values" },
                  h("span", null, h("small", null, "Before"), h("strong", null, format(comparison.previous.average, key))),
                  h("span", null, h("small", null, "After"), h("strong", null, format(comparison.current.average, key))),
                ),
                h("p", null, difference === null ? "Change unavailable" : `${format(difference, key, true)} per recorded day`),
                nutrient ? h("p", { class: "weekly-coverage" }, `Coverage: ${coverage(comparison.previous.knownItemCount, comparison.previous.totalItemCount) ?? ""} before; ${coverage(comparison.current.knownItemCount, comparison.current.totalItemCount) ?? ""} after.`) : null,
              ),
            );
          }),
        ),

        h("div", { class: "weekly-breakdown" },
          h("div", null,
            h("h3", null, `What contributed to the ${metricMeta[selectedMetric].label.toLowerCase()} change?`),
            h("p", null, `Matching food and drink names are grouped. Values are ${metricMeta[selectedMetric].unit} per recorded day.`),
          ),
          before === null || after === null
            ? h("div", { class: "weekly-unavailable" }, "A comparison needs at least one recorded day in both periods.")
            : [
              h("div", { class: "weekly-waterfall-legend" }, h("span", { class: "total" }, "Period totals"), h("span", { class: "increase" }, "Increase"), h("span", { class: "decrease" }, "Decrease")),
              waterfallChart({ before, after, items: waterfall, selected: selectedKey, metric: selectedMetric, onSelect: selectKey }),
              h("ol", { class: "weekly-contribution-list" },
                waterfall.map((item, index) => h("li", null,
                  h("button", { type: "button", "aria-pressed": selectedKey === item.key, onclick: () => selectKey(item.key) },
                    h("span", null, h("b", null, index + 1), item.label),
                    h("strong", { class: item.difference >= 0 ? "increase" : "decrease" }, format(item.difference, selectedMetric, true)),
                    h("small", null, `${format(item.previous, selectedMetric)} → ${format(item.current, selectedMetric)}`),
                  ),
                )),
              ),
              selected ? contributionDetails({ item: selected, metric: selectedMetric }) : null,
            ],
        ),
      ];
    },
  );
  return panel;
}
