import { component, h, memo, type Component } from "./dom";
import {
  calculateFoodScenario,
  calculateNutrientSourceDependence,
  calculateNutrientSourceExclusion,
  foodScenarioTradeoffText,
  foodScenarioMetricKeys,
  foodScenarioMultipliers,
  insightDateRange,
  scenarioFoodCandidates,
  type FoodScenarioMetric,
  type FoodScenarioMode,
  type FoodScenarioMultiplier,
  type InsightRange,
  type NutrientSource,
  type ScenarioFoodCandidate,
} from "../insights/nutrient-food-calculations";
import {
  nutrientKeys,
  nutrientMeta,
  type NutrientGoalMap,
  type NutrientKey,
} from "../nutrition/nutrient-meta";
import type { InsightEntry } from "../insights/types";

export type NutrientFoodScenariosProps = {
  entries: InsightEntry[];
  currentDate: string;
  goals: NutrientGoalMap;
  /** Nutrient selected from the attention panel; used to orient both views. */
  focusedNutrient?: NutrientKey | null;
};

const ranges: readonly InsightRange[] = [14, 28];
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

function metricDigits(key: FoodScenarioMetric["key"]) {
  return key === "calories" ? 0 : key === "proteinG" ? 1 : nutrientMeta(key).precision;
}

function formatAmount(value: number | null, key: FoodScenarioMetric["key"]) {
  if (value === null || !Number.isFinite(value)) return "Unknown";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: metricDigits(key) }).format(value);
}

function formatMetricValue(value: number | null, metric: FoodScenarioMetric) {
  return value === null ? "Unknown" : `${formatAmount(value, metric.key)} ${metric.unit}`;
}

function formatDelta(metric: FoodScenarioMetric) {
  if (metric.delta === null) return "Unknown";
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: metricDigits(metric.key),
    signDisplay: "exceptZero",
  }).format(metric.delta);
  return `${amount} ${metric.unit}`;
}

function candidateLabel(candidate: ScenarioFoodCandidate) {
  const quantity = candidate.item.quantity == null
    ? ""
    : ` · ${candidate.item.quantity}${candidate.item.unit ? ` ${candidate.item.unit}` : ""}`;
  return `${candidate.label}${quantity} · ${formatDate(candidate.date)}`;
}

function goalLabel(metric: FoodScenarioMetric, goals: NutrientGoalMap) {
  if (metric.key === "calories" || metric.key === "proteinG") return null;
  const goal = goals[metric.key];
  if (!goal || goal.value === null) return null;
  return `${goal.direction === "minimum" ? "minimum" : "maximum"} ${formatAmount(goal.value, metric.key)} ${metric.unit}`;
}

function referencePercent(value: number | null, metric: FoodScenarioMetric, goals: NutrientGoalMap) {
  if (value === null || metric.key === "calories" || metric.key === "proteinG") return null;
  const goal = goals[metric.key];
  if (!goal || goal.value === null || goal.value <= 0) return null;
  return { value: value / goal.value * 100, direction: goal.direction };
}

function referenceProgress({ value, metric, goals, side }: {
  value: number | null;
  metric: FoodScenarioMetric;
  goals: NutrientGoalMap;
  side: "before" | "after";
}) {
  const reference = referencePercent(value, metric, goals);
  if (!reference) return null;
  const percent = Math.max(0, reference.value);
  const label = reference.direction === "minimum" ? "minimum reference" : "maximum reference";
  return h("span", {
    class: `nutrient-food-scenarios__reference ${reference.direction === "maximum" && percent > 100 ? "is-over" : ""}`,
    "aria-label": `${metric.label} ${side}: ${Math.round(percent)}% of ${label}`,
  },
    h("span", { class: "nutrient-food-scenarios__reference-label" }, `${Math.round(percent)}% of ${reference.direction === "minimum" ? "minimum" : "maximum"}`),
    h("span", { class: "nutrient-food-scenarios__reference-bar", "aria-hidden": "true" }, h("i", { style: { width: `${Math.min(100, percent)}%` } })),
  );
}

function rangeLabel(range: InsightRange, currentDate: string) {
  const { startDate, endDate } = insightDateRange(currentDate, range);
  return `${formatDate(startDate)}–${formatDate(endDate)}`;
}

function rangeControls(range: InsightRange, onChange: (range: InsightRange) => void, label: string) {
  return h("div", { class: "nutrient-food-scenarios__range", "aria-label": label },
    ranges.map((value) => h("button", {
      type: "button",
      "aria-pressed": range === value,
      class: range === value ? "is-active" : "",
      onclick: () => onChange(value),
    }, `${value} days`)),
  );
}

function metricTable(rows: FoodScenarioMetric[], caption: string, goals: NutrientGoalMap) {
  return h("table", { class: "nutrient-food-scenarios__scenario-table" },
    h("caption", null, caption),
    h("thead", null, h("tr", null, ["Nutrient", "Before", "After", "Change"].map((heading) => h("th", { scope: "col" }, heading)))),
    h("tbody", null, rows.map((metric) => h("tr", { class: metric.delta === null ? "is-unknown" : "" },
      h("th", { scope: "row" }, h("span", null, metric.label), goalLabel(metric, goals) ? h("small", null, goalLabel(metric, goals)) : null),
      h("td", { "data-label": "Before" }, h("span", { class: "nutrient-food-scenarios__metric-value" }, formatMetricValue(metric.before, metric)), referenceProgress({ value: metric.before, metric, goals, side: "before" })),
      h("td", { "data-label": "After" }, h("span", { class: "nutrient-food-scenarios__metric-value" }, formatMetricValue(metric.after, metric)), referenceProgress({ value: metric.after, metric, goals, side: "after" })),
      h("td", { "data-label": "Change", class: metric.delta === null ? "" : metric.delta > 0 ? "is-increase" : metric.delta < 0 ? "is-decrease" : "" }, formatDelta(metric)),
    ))),
  );
}

function scenarioMetricTable({ metrics, goals }: { metrics: FoodScenarioMetric[]; goals: NutrientGoalMap }) {
  const rank = (metric: FoodScenarioMetric) => {
    if (metric.key === "calories") return 0;
    if (metric.key === "proteinG") return 1;
    if (goals[metric.key].value !== null) return 2;
    return 3;
  };
  const ordered = [...metrics].sort((left, right) =>
    Number(left.delta === null) - Number(right.delta === null) || rank(left) - rank(right) || foodScenarioMetricKeys.indexOf(left.key) - foodScenarioMetricKeys.indexOf(right.key));
  const known = ordered.filter((metric) => metric.delta !== null);
  const unavailable = ordered.filter((metric) => metric.delta === null);
  return h("div", { class: "nutrient-food-scenarios__table-wrap" },
    metricTable(known, "Known recorded amounts for one hypothetical portion", goals),
    unavailable.length ? h("details", { class: "nutrient-food-scenarios__unavailable" },
      h("summary", null, `Show unavailable nutrients (${unavailable.length})`),
      h("div", { class: "nutrient-food-scenarios__unavailable-table" }, metricTable(unavailable, "Unavailable nutrient values for one hypothetical portion", goals)),
    ) : null,
  );
}

function scenarioFoodSelect({ label, candidates, value, onChange }: {
  label: string;
  candidates: ScenarioFoodCandidate[];
  value: ScenarioFoodCandidate | null;
  onChange: (id: string) => void;
}) {
  return h("label", { class: "nutrient-food-scenarios__select-label" },
    h("span", null, label),
    h("select", { value: value?.id ?? "", onchange: (event: Event) => onChange((event.target as HTMLSelectElement).value), disabled: !candidates.length },
      !candidates.length ? h("option", { value: "" }, "No logged foods in this range") : null,
      candidates.map((candidate) => h("option", { value: candidate.id }, candidateLabel(candidate))),
    ),
  );
}

function createFoodScenarioPanel(): Component<NutrientFoodScenariosProps> {
  let range: InsightRange = 28;
  let mode: FoodScenarioMode = "addition";
  let multiplier: FoodScenarioMultiplier = 1;
  let candidateId: string | null = null;
  let beforeId: string | null = null;
  let afterId: string | null = null;
  const foodCandidates = memo((entries: InsightEntry[], currentDate: string, focusedNutrient: NutrientKey | null | undefined, forRange: InsightRange) =>
    scenarioFoodCandidates({ entries, currentDate, range: forRange, prioritizeNutrient: focusedNutrient ?? undefined }));

  const panel = component<NutrientFoodScenariosProps>(
    h("article", { class: "nutrient-food-scenarios__panel", "aria-labelledby": "nutrient-food-change-title" }),
    ({ entries, currentDate, goals, focusedNutrient }) => {
      const candidates = foodCandidates(entries, currentDate, focusedNutrient, range);
      const candidate = candidates.find((item) => item.id === candidateId) ?? candidates[0] ?? null;
      const before = candidates.find((item) => item.id === beforeId) ?? candidates[0] ?? null;
      const after = candidates.find((item) => item.id === afterId)
        ?? candidates.find((item) => item.label.toLocaleLowerCase() !== before?.label.toLocaleLowerCase())
        ?? candidates.find((item) => item.id !== before?.id)
        ?? candidates[0]
        ?? null;
      const scenario = mode === "addition"
        ? candidate ? calculateFoodScenario({ mode, item: candidate.item, multiplier }) : null
        : before && after ? calculateFoodScenario({ mode, before: before.item, after: after.item, multiplier }) : null;

      return [
        h("div", { class: "nutrient-food-scenarios__heading" },
          h("div", null,
            h("p", { class: "eyebrow" }, "Food changes"),
            h("h3", { id: "nutrient-food-change-title" }, "Compare a food change"),
          ),
          rangeControls(range, (value) => { range = value; panel.rerender(); }, "Food change date range"),
        ),
        h("p", { class: "nutrient-food-scenarios__description" },
          `Choose a logged portion from ${rangeLabel(range, currentDate)}. The comparison is hypothetical and does not log a meal or change your totals; missing nutrient values stay unknown.`,
        ),
        focusedNutrient ? h("p", { class: "nutrient-food-scenarios__focus-note" }, "Focused finding: ", h("strong", null, nutrientMeta(focusedNutrient).label), ". Logged candidates with a known amount of this nutrient are shown first.") : null,
        h("div", { class: "nutrient-food-scenarios__scenario-controls" },
          h("label", { class: "nutrient-food-scenarios__select-label" },
            h("span", null, "Change type"),
            h("select", { value: mode, onchange: (event: Event) => { mode = (event.target as HTMLSelectElement).value as FoodScenarioMode; panel.rerender(); } },
              h("option", { value: "addition" }, "Add a logged food"),
              h("option", { value: "replacement" }, "Replace one logged food"),
            ),
          ),
          mode === "addition"
            ? scenarioFoodSelect({ label: "Food to add", candidates, value: candidate, onChange: (id) => { candidateId = id; panel.rerender(); } })
            : [
              scenarioFoodSelect({ label: "Food being replaced", candidates, value: before, onChange: (id) => { beforeId = id; panel.rerender(); } }),
              scenarioFoodSelect({ label: "Replacement food", candidates, value: after, onChange: (id) => { afterId = id; panel.rerender(); } }),
            ],
          h("div", { class: "nutrient-food-scenarios__multiplier", "aria-label": "Logged portion multiplier" },
            h("span", null, "Portion"),
            h("div", null, foodScenarioMultipliers.map((value) => h("button", {
              type: "button",
              "aria-pressed": multiplier === value,
              class: multiplier === value ? "is-active" : "",
              onclick: () => { multiplier = value; panel.rerender(); },
            }, `${value}×`))),
          ),
        ),
        scenario ? h("div", { class: "nutrient-food-scenarios__scenario-result", "aria-live": "polite" },
          h("p", { class: "nutrient-food-scenarios__scenario-summary" },
            `${scenario.mode === "addition" ? `Adding ${scenario.afterName}` : `Replacing ${scenario.beforeName ?? "the selected food"} with ${scenario.afterName}`} at ${scenario.multiplier}× the logged portion. `,
            h("span", null, `${scenario.knownMetricCount} of ${scenario.metrics.length} tracked values have a known change.`),
          ),
          h("p", { class: "nutrient-food-scenarios__tradeoff" }, h("strong", null, "Tradeoff:"), ` ${foodScenarioTradeoffText(scenario, { focusedNutrient })}`),
          scenarioMetricTable({ metrics: scenario.metrics, goals }),
        ) : h("div", { class: "nutrient-food-scenarios__empty", role: "status" }, "Log a food with this date range to compare a hypothetical change."),
      ];
    },
  );
  return panel;
}

function formatSourceAmount(source: NutrientSource, nutrientKey: NutrientKey) {
  return source.amount === null ? "Unknown" : `${formatAmount(source.amount, nutrientKey)} ${nutrientMeta(nutrientKey).unit}`;
}

function plural(count: number) {
  return count === 1 ? "" : "s";
}

function sourceCoverage(source: NutrientSource) {
  const itemCoverage = source.unknownItemCount ? `${source.knownItemCount} of ${source.totalItemCount} values known` : `${source.totalItemCount} values`;
  return `${source.entryCount} portion${plural(source.entryCount)} · ${source.dayCount} day${plural(source.dayCount)} · ${itemCoverage}`;
}

function formatTime(timestamp: number) {
  return timeFormatter.format(new Date(timestamp));
}

function sourceConcentrationText(result: ReturnType<typeof calculateNutrientSourceDependence>, nutrientLabel: string) {
  const largest = result.allSources[0];
  if (!largest || result.largestSourceShare === null) {
    return `Concentration is unavailable because there is no positive known recorded ${nutrientLabel.toLowerCase()} amount.`;
  }
  const largestShare = Math.round(result.largestSourceShare * 100);
  const topThreeShare = result.topThreeSourceShare === null ? null : Math.round(result.topThreeSourceShare * 100);
  const habit = `The largest recorded source is ${largest.label}, appearing in ${largest.entryCount} portion${plural(largest.entryCount)} across ${largest.dayCount} day${plural(largest.dayCount)}.`;
  return `${largest.label} provides ${largestShare}% of known recorded ${nutrientLabel.toLowerCase()}; ${topThreeShare === null ? "the top-three share is unavailable" : `the top three sources provide ${topThreeShare}%`}. ${habit} This describes concentration in the log, not a health score.`;
}

function createSourceDependencePanel(initialNutrient: NutrientKey): Component<NutrientFoodScenariosProps> {
  let range: InsightRange = 28;
  let nutrientKey: NutrientKey = initialNutrient;
  let selectedSourceKey: string | null = null;
  const sourceDependence = memo((entries: InsightEntry[], currentDate: string, forNutrient: NutrientKey, forRange: InsightRange) =>
    calculateNutrientSourceDependence({ entries, currentDate, range: forRange, nutrientKey: forNutrient }));

  const panel = component<NutrientFoodScenariosProps>(
    h("article", { class: "nutrient-food-scenarios__panel", "aria-labelledby": "nutrient-source-title" }),
    ({ entries, currentDate, focusedNutrient }) => {
      const result = sourceDependence(entries, currentDate, nutrientKey, range);
      const rows = result.other ? [...result.sources, result.other] : result.sources;
      const selectedSource = selectedSourceKey === null ? null : rows.find((source) => source.key === selectedSourceKey) ?? result.allSources.find((source) => source.key === selectedSourceKey) ?? null;
      const exclusion = selectedSource ? calculateNutrientSourceExclusion(result, selectedSource.key) : null;
      const meta = nutrientMeta(nutrientKey);
      const nutrientName = meta.label.toLowerCase();
      const selectSource = (key: string) => {
        selectedSourceKey = key;
        panel.rerender();
      };

      return [
        h("div", { class: "nutrient-food-scenarios__heading" },
          h("div", null,
            h("p", { class: "eyebrow" }, "Food sources"),
            h("h3", { id: "nutrient-source-title" }, "Where a nutrient comes from"),
          ),
          rangeControls(range, (value) => { range = value; panel.rerender(); }, "Nutrient source date range"),
        ),
        h("div", { class: "nutrient-food-scenarios__source-controls" },
          h("label", { class: "nutrient-food-scenarios__select-label" },
            h("span", null, "Nutrient"),
            h("select", { value: nutrientKey, onchange: (event: Event) => { nutrientKey = (event.target as HTMLSelectElement).value as NutrientKey; selectedSourceKey = null; panel.rerender(); } },
              nutrientKeys.map((key) => h("option", { value: key }, nutrientMeta(key).label)),
            ),
          ),
          h("p", { class: "nutrient-food-scenarios__source-coverage" },
            `${rangeLabel(range, currentDate)} · ${result.knownTotal === null ? "No known recorded amount" : `${formatAmount(result.knownTotal, nutrientKey)} ${meta.unit} known`} · ${result.knownItemCount} of ${result.totalItemCount} item values known`,
          ),
        ),
        h("p", { class: "nutrient-food-scenarios__description" },
          `Sources use exact food names after trimming whitespace and ignoring case. Shares describe recorded known ${nutrientName} only; ${result.unknownItemCount ? `${result.unknownItemCount} item value${result.unknownItemCount === 1 ? " is" : "s are"} unknown.` : "all matching item values are known."}`,
        ),
        focusedNutrient ? h("p", { class: "nutrient-food-scenarios__focus-note" }, "Showing sources for the selected ", h("strong", null, meta.label), " finding.") : null,
        rows.length ? h("div", { class: "nutrient-food-scenarios__source-summary" },
          h("div", null, h("small", null, "Recorded entries"), h("strong", null, `${result.recordedEntryCount} · ${result.recordedDayCount} days`)),
          h("div", null, h("small", null, "Largest source"), h("strong", null, result.largestSourceShare === null ? "Unavailable" : `${Math.round(result.largestSourceShare * 100)}%`)),
          h("div", null, h("small", null, "Top three"), h("strong", null, result.topThreeSourceShare === null ? "Unavailable" : `${Math.round(result.topThreeSourceShare * 100)}%`)),
          h("p", null, sourceConcentrationText(result, meta.label)),
        ) : null,
        rows.length ? [
          rows.some((source) => source.share !== null && source.share > 0)
            ? h("div", { class: "nutrient-food-scenarios__stack", role: "group", "aria-label": `Recorded ${nutrientName} contributions by food source` },
              rows.map((source, index) => source.share !== null && source.share > 0 ? h("button", {
                type: "button",
                class: `nutrient-food-scenarios__stack-segment source-color-${index % 6}`,
                style: { width: `${source.share * 100}%` },
                "aria-label": `${source.label}: ${Math.round(source.share * 100)}% of known recorded ${nutrientName}. Select to inspect.`,
                onclick: () => selectSource(source.key),
              }) : null),
            )
            : h("div", { class: "nutrient-food-scenarios__source-no-chart" }, "Known recorded amounts are zero, so percentage shares are unavailable."),
          h("div", { class: "nutrient-food-scenarios__source-legend", "aria-label": "Nutrient source contributions" },
            rows.map((source, index) => h("div", { class: "nutrient-food-scenarios__source-row" },
              h("span", { class: `nutrient-food-scenarios__source-swatch source-color-${index % 6}`, "aria-hidden": "true" }),
              h("button", { type: "button", class: "nutrient-food-scenarios__source-name", "aria-pressed": selectedSourceKey === source.key, onclick: () => selectSource(source.key) },
                h("span", null, source.label),
                h("small", null, `${formatSourceAmount(source, nutrientKey)} · ${source.share === null ? "share unavailable" : `${Math.round(source.share * 100)}%`} · ${sourceCoverage(source)}`),
              ),
              h("button", { type: "button", class: "nutrient-food-scenarios__exclude", onclick: () => selectSource(source.key) }, "Exclude"),
            )),
          ),
          selectedSource && exclusion ? h("div", { class: "nutrient-food-scenarios__source-detail", "aria-live": "polite" },
            h("div", null,
              h("p", { class: "eyebrow" }, "Hypothetical exclusion"),
              h("h4", null, exclusion.sourceLabel),
              h("p", null, `Removing this source from the calculation leaves ${exclusion.remainingKnownAmount === null ? "an unknown" : `${formatAmount(exclusion.remainingKnownAmount, nutrientKey)} ${meta.unit}`} recorded known ${nutrientName}. Records are unchanged; this is a what-if view.`),
              h("p", null, `${selectedSource.entryCount} matching portion${plural(selectedSource.entryCount)} across ${selectedSource.dayCount} day${plural(selectedSource.dayCount)}; values below are from the logged portions.`),
            ),
            h("div", { class: "nutrient-food-scenarios__source-stats" },
              h("span", null, h("small", null, "Source amount"), h("strong", null, exclusion.excludedKnownAmount === null ? "Unknown" : `${formatAmount(exclusion.excludedKnownAmount, nutrientKey)} ${meta.unit}`)),
              h("span", null, h("small", null, "Unknown values removed"), h("strong", null, exclusion.excludedUnknownItemCount)),
            ),
            h("h5", null, "Matching entries"),
            h("ul", { class: "nutrient-food-scenarios__source-entries" },
              selectedSource.entries.map((entry) => h("li", null,
                h("span", null, h("strong", null, entry.itemName), h("small", null, `${formatDate(entry.date)} · ${formatTime(entry.consumedAt)}${entry.quantity === null ? "" : ` · ${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`}`)),
                h("strong", null, entry.value === null ? "Unknown" : `${formatAmount(entry.value, nutrientKey)} ${meta.unit}`),
              )),
            ),
          ) : null,
        ] : h("div", { class: "nutrient-food-scenarios__empty", role: "status" }, "No food entries are available in this date range."),
      ];
    },
  );
  return panel;
}

/** The two food panels. Both start again when the focused nutrient changes. */
export function createNutrientFoodScenarios(): Component<NutrientFoodScenariosProps> {
  const panels = h("div", { class: "nutrient-food-scenarios__panels" });
  const el = h("section", { class: "panel nutrient-food-scenarios", id: "nutrient-food-scenarios", "aria-labelledby": "nutrient-food-scenarios-title" },
    h("div", { class: "nutrient-food-scenarios__title" },
      h("h2", { id: "nutrient-food-scenarios-title" }, "Nutrition food insights"),
      h("p", null, "Use recorded food portions to explore practical nutrient changes and see which foods supply the nutrients you track."),
    ),
    panels,
  );
  let focused: NutrientKey | null | undefined;
  let scenario: Component<NutrientFoodScenariosProps> | null = null;
  let sources: Component<NutrientFoodScenariosProps> | null = null;

  return {
    el,
    update(props) {
      const focusedNutrient = props.focusedNutrient ?? null;
      if (!scenario || !sources || focused !== focusedNutrient) {
        focused = focusedNutrient;
        scenario = createFoodScenarioPanel();
        sources = createSourceDependencePanel(focusedNutrient ?? "fiberG");
        panels.replaceChildren(scenario.el, sources.el);
      }
      const next = { ...props, focusedNutrient };
      scenario.update(next);
      sources.update(next);
    },
  };
}
