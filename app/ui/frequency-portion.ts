import { component, cx, h, memo, svg, type Component } from "./dom";
import {
  calculateFrequencyPortion,
  frequencyAxisMaximum,
  frequencyPortionMetrics,
  type FrequencyPortionMetric,
  type FrequencyPortionRange,
} from "../insights/frequency-portion-calculations";
import type { InsightDay, InsightEntry } from "../insights/types";

type FrequencyPortionProps = {
  entries: InsightEntry[];
  days: InsightDay[];
  currentDate: string;
};

const WIDTH = 720;
const HEIGHT = 340;
const PLOT = { left: 104, right: 22, top: 22, bottom: 54 };

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function format(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function ticks(max: number, count = 4) {
  return Array.from({ length: count + 1 }, (_, index) => (max * index) / count);
}

export function createFrequencyPortion(): Component<FrequencyPortionProps> {
  let range: FrequencyPortionRange = 30;
  let metric: FrequencyPortionMetric = "calories";
  let selectedKey: string | null = null;
  const frequencyPortion = memo((entries: InsightEntry[], currentDate: string, forRange: FrequencyPortionRange, forMetric: FrequencyPortionMetric) =>
    calculateFrequencyPortion({ entries, currentDate, range: forRange, metric: forMetric }));

  const panel = component<FrequencyPortionProps>(
    h("section", { class: "panel frequency-portion", "aria-labelledby": "frequency-portion-title" }),
    ({ entries, days, currentDate }) => {
      const result = frequencyPortion(entries, currentDate, range, metric);
      const metricMeta = frequencyPortionMetrics.find((candidate) => candidate.key === metric) ?? frequencyPortionMetrics[0];
      const metricName = metricMeta.label.toLowerCase();
      const plotted = result.points.filter((point) => point.averageValue !== null);
      const selected = result.points.find((point) => point.key === selectedKey) ?? result.points[0] ?? null;
      const maxX = frequencyAxisMaximum(plotted.map((point) => point.occurrencesPerWeek));
      const maxY = frequencyAxisMaximum(plotted.map((point) => point.averageValue ?? 0));
      const plotWidth = WIDTH - PLOT.left - PLOT.right;
      const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
      const selectedDays = days.filter((day) => day.date >= result.startDate && day.date <= result.endDate);
      const loggedDays = selectedDays.filter((day) => day.mealCount > 0).length;
      const choose = (key: string) => {
        selectedKey = key;
        panel.rerender();
      };

      return [
        h("div", { class: "frequency-portion__heading" },
          h("div", null,
            h("p", { class: "eyebrow" }, "Food patterns"),
            h("h2", { id: "frequency-portion-title" }, "Frequency & amount"),
          ),
          h("div", { class: "frequency-portion__controls" },
            h("div", { class: "frequency-portion__range", "aria-label": "Frequency and amount date range" },
              ([7, 30] as const).map((value) => h("button", {
                class: range === value ? "is-active" : "",
                type: "button",
                "aria-pressed": range === value,
                onclick: () => { range = value; panel.rerender(); },
              }, `${value} days`)),
            ),
            h("label", null, "Amount",
              h("select", { value: metric, onchange: (event: Event) => { metric = (event.target as HTMLSelectElement).value as FrequencyPortionMetric; panel.rerender(); } },
                frequencyPortionMetrics.map((option) => h("option", { value: option.key }, option.label)),
              ),
            ),
          ),
        ),

        h("p", { class: "frequency-portion__explanation" },
          `Each dot is one exact food name. Frequency uses all ${result.elapsedDays} calendar days ending yesterday; amount is the average known ${metricName} per log entry, not a standard serving or per-gram value.`,
        ),
        h("p", { class: "frequency-portion__coverage" },
          `${formatDate(result.startDate)}–${formatDate(result.endDate)} · ${loggedDays} of ${result.elapsedDays} days have logs`,
        ),

        result.points.length ? h("div", { class: "frequency-portion__layout" },
          h("div", { class: "frequency-portion__visual" },
            plotted.length ? svg("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: "img", "aria-labelledby": "frequency-portion-chart-title frequency-portion-chart-desc" },
              svg("title", { id: "frequency-portion-chart-title" }, `Food logging frequency versus average ${metricName}`),
              svg("desc", { id: "frequency-portion-chart-desc" }, `Horizontal axis shows occurrences per week across the full ${range}-day window. Vertical axis shows average known ${metricName} per log entry. Use the food list below to select overlapping points.`),
              ticks(maxY).map((tick) => {
                const y = PLOT.top + plotHeight - (tick / maxY) * plotHeight;
                return svg("g", { class: "frequency-portion__tick frequency-portion__tick--y" },
                  svg("line", { x1: PLOT.left, x2: WIDTH - PLOT.right, y1: y, y2: y }),
                  svg("text", { x: PLOT.left - 10, y: y + 4, "text-anchor": "end" }, format(tick)),
                );
              }),
              ticks(maxX).map((tick) => {
                const x = PLOT.left + (tick / maxX) * plotWidth;
                return svg("g", { class: "frequency-portion__tick" },
                  svg("line", { x1: x, x2: x, y1: PLOT.top, y2: HEIGHT - PLOT.bottom }),
                  svg("text", { x, y: HEIGHT - PLOT.bottom + 22, "text-anchor": "middle" }, format(tick)),
                );
              }),
              svg("text", { class: "frequency-portion__axis-label", x: PLOT.left + plotWidth / 2, y: HEIGHT - 8, "text-anchor": "middle" }, `Occurrences per week (${range}-day window)`),
              svg("text", { class: "frequency-portion__axis-label", transform: `translate(16 ${PLOT.top + plotHeight / 2}) rotate(-90)`, "text-anchor": "middle" }, `Avg ${metricName} per logged entry (${metricMeta.unit})`),
              plotted.map((point) => {
                const x = PLOT.left + (point.occurrencesPerWeek / maxX) * plotWidth;
                const y = PLOT.top + plotHeight - ((point.averageValue ?? 0) / maxY) * plotHeight;
                const active = selected?.key === point.key;
                return svg("g", {
                  class: cx("frequency-portion__point", active && "is-active"),
                  role: "button",
                  tabindex: 0,
                  "aria-label": `${point.label}: ${format(point.occurrencesPerWeek)} occurrences per week, average ${format(point.averageValue ?? 0)} ${metricMeta.unit} per logged entry`,
                  "aria-pressed": active,
                  onclick: () => choose(point.key),
                  onkeydown: (event: KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      choose(point.key);
                    }
                  },
                  transform: `translate(${x} ${y})`,
                }, svg("circle", { r: active ? 9 : 7 }));
              }),
            ) : h("div", { class: "frequency-portion__empty", role: "status" }, `No known ${metricName} values in this range.`),

            h("div", { class: "frequency-portion__food-list", "aria-label": "Select a food, including points that overlap" },
              result.points.map((point) => h("button", {
                type: "button",
                class: selected?.key === point.key ? "is-active" : "",
                "aria-pressed": selected?.key === point.key,
                onclick: () => choose(point.key),
              },
                h("span", null, point.label),
                h("small", null, `${format(point.occurrencesPerWeek)}×/week · ${point.averageValue === null ? `${metricMeta.label} unknown` : `${format(point.averageValue)} ${metricMeta.unit} avg`}`),
              )),
            ),
          ),

          selected ? h("aside", { class: "frequency-portion__details", "aria-live": "polite" },
            h("p", { class: "eyebrow" }, "Selected food"),
            h("h3", null, selected.label),
            h("dl", { class: "frequency-portion__stats" },
              h("div", null, h("dt", null, "Times logged"), h("dd", null, selected.occurrences)),
              h("div", null, h("dt", null, "Avg amount"), h("dd", null, selected.averageValue === null ? "Unknown" : `${format(selected.averageValue)} ${metricMeta.unit}`)),
              h("div", null, h("dt", null, "Total contribution"), h("dd", null, selected.totalValue === null ? "Unknown" : `${format(selected.totalValue)} ${metricMeta.unit}`)),
              h("div", null, h("dt", null, "Known coverage"), h("dd", null, `${selected.knownCount} of ${selected.occurrences} entries${selected.completeKnownCount < selected.knownCount ? ` · ${selected.knownCount - selected.completeKnownCount} partial` : ""}`)),
              selected.averageQuantity !== null ? h("div", null, h("dt", null, "Avg logged quantity"), h("dd", null, `${format(selected.averageQuantity)} ${selected.quantityUnit}`)) : null,
            ),
            h("h4", null, "Source entries"),
            h("ul", { class: "frequency-portion__sources" },
              selected.sources.map((source) => h("li", null,
                h("span", null, `${formatDate(source.date)}${source.quantity !== null ? ` · ${format(source.quantity)}${source.unit ? ` ${source.unit}` : ""}` : ""}`),
                h("strong", null, source.value === null ? "Unknown" : `${format(source.value)} ${metricMeta.unit}${source.knownItemCount < source.totalItemCount ? " · partial" : ""}`),
              )),
            ),
          ) : null,
        ) : h("div", { class: "frequency-portion__empty", role: "status" },
          h("strong", null, "No foods logged in this range"),
          h("span", null, "Food and drink entries will appear here after they are logged."),
        ),
      ];
    },
  );
  return panel;
}
