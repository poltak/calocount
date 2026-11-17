import { NUTRIENT_KEYS } from "@app/common/features/entries/utils/nutrients";
import { useEffect, useId, useMemo, useRef } from "react";
import { formatKcal } from "../../core/utils/dashboard-format.js";
import {
  groupedNutrientKeys,
  nutrientGroupLabel,
  nutrientLabel,
  nutrientValueText,
} from "../../core/utils/nutrient-format.js";
import {
  calculateFoodSources,
  type FoodSourceMetric,
} from "../utils/food-sources.js";
import {
  formatClock,
  formatDateRange,
  formatShortDate,
  plural,
} from "../utils/insight-format.js";
import { useInsights } from "./insights-context.js";

const NUTRIENT_GROUPS = groupedNutrientKeys();

function metricOf(value: string): FoodSourceMetric {
  if (value === "calories" || value === "proteinG") {
    return value;
  }
  return NUTRIENT_KEYS.find((key) => key === value) ?? "calories";
}

function metricLabel(metric: FoodSourceMetric): string {
  if (metric === "calories") {
    return "Calories";
  }
  return metric === "proteinG" ? "Protein" : nutrientLabel(metric);
}

function amountText(value: number, metric: FoodSourceMetric): string {
  if (metric === "calories" || metric === "proteinG") {
    const digits = metric === "calories" ? 0 : 1;
    const amount =
      metric === "calories"
        ? formatKcal(Math.round(value))
        : value.toLocaleString("en-US", { maximumFractionDigits: digits });
    return `${amount} ${metric === "calories" ? "kcal" : "g"}`;
  }
  return nutrientValueText(value, metric);
}

function shareText(share: number): string {
  const percent = Math.round(share * 100);
  return percent < 1 ? "<1%" : `${percent}%`;
}

function MetricOptions() {
  return (
    <>
      <option value="calories">Calories</option>
      <option value="proteinG">Protein</option>
      {NUTRIENT_GROUPS.map(({ group, keys }) => (
        <optgroup key={group} label={nutrientGroupLabel(group)}>
          {keys.map((key) => (
            <option key={key} value={key}>
              {nutrientLabel(key)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** The foods that supply most of one measure over the last 7 or 30 days, with the entries behind each. */
export function FoodSourcesPanel() {
  const { logic, state } = useInsights();
  const {
    entries,
    today,
    foodSourcesRange: range,
    foodSourcesMetric: metric,
    expandedFoodSource,
    foodSourcesFocusCount,
  } = state;
  const sectionRef = useRef<HTMLElement>(null);
  const idPrefix = useId();
  // The action of a finding in Nutrition attention brings this panel into view.
  useEffect(() => {
    if (foodSourcesFocusCount > 0) {
      sectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [foodSourcesFocusCount]);
  const result = useMemo(
    () =>
      calculateFoodSources({
        entries,
        currentDate: today ?? "",
        range,
        metric,
      }),
    [entries, today, range, metric],
  );
  const label = metricLabel(metric);
  const max = result.sources[0]?.amount ?? 1;
  return (
    <section
      ref={sectionRef}
      className="panel chart-panel food-sources"
      id="food-sources"
      aria-labelledby="food-sources-title"
    >
      <div className="panel-heading food-sources__heading">
        <div>
          <p className="eyebrow">What drives your totals</p>
          <h2 id="food-sources-title">Food sources</h2>
        </div>
        <div className="food-sources__controls">
          <div className="food-sources__range" aria-label="Food sources range">
            {([7, 30] as const).map((value) => (
              <button
                key={value}
                className={range === value ? "is-active" : ""}
                type="button"
                aria-pressed={range === value}
                onClick={() => logic.choose({ foodSourcesRange: value })}
              >
                {`${value} days`}
              </button>
            ))}
          </div>
          <label className="compact-select">
            Measure
            <select
              value={metric}
              onChange={(event) =>
                logic.choose({
                  foodSourcesMetric: metricOf(event.target.value),
                  expandedFoodSource: null,
                })
              }
            >
              <MetricOptions />
            </select>
          </label>
        </div>
      </div>
      <p className="food-sources__coverage">
        {`${formatDateRange(result.startDate, result.endDate)} · ${amountText(result.knownTotal, metric)} known · ${result.knownItemCount} of ${result.totalItemCount} item value${plural(result.totalItemCount)} known`}
      </p>
      {result.sources.length > 0 ? (
        <ol
          className="food-sources__list"
          aria-label={`Foods that supply the most ${label.toLocaleLowerCase()}`}
        >
          {result.sources.map((source, position) => {
            const open = expandedFoodSource === source.key;
            const entriesId = `${idPrefix}-${position}`;
            return (
              <li className="food-sources__row" key={source.key}>
                <button
                  type="button"
                  className="food-sources__summary"
                  aria-expanded={open}
                  aria-controls={entriesId}
                  onClick={() =>
                    logic.choose({
                      expandedFoodSource: open ? null : source.key,
                    })
                  }
                >
                  <span className="food-sources__name">
                    <strong title={source.label}>{source.label}</strong>
                    <small>{`${source.entryCount} ${source.entryCount === 1 ? "entry" : "entries"}`}</small>
                  </span>
                  <span className="food-sources__bar" aria-hidden="true">
                    <i style={{ width: `${(source.amount / max) * 100}%` }} />
                  </span>
                  <span className="food-sources__amount">
                    {amountText(source.amount, metric)}
                  </span>
                  <span className="food-sources__share">
                    {shareText(source.share)}
                  </span>
                </button>
                {open && (
                  <ul
                    className="food-sources__entries"
                    id={entriesId}
                    aria-label={`${source.label} entries`}
                  >
                    {source.entries.map((entry, index) => (
                      <li key={`${entry.entryId}-${index}`}>
                        <span>
                          {`${formatShortDate(entry.date)} · ${formatClock(entry.consumedAt)}`}
                        </span>
                        <span>
                          {entry.quantity === null
                            ? "No quantity"
                            : `${entry.quantity}${entry.unit ? ` ${entry.unit}` : ""}`}
                        </span>
                        <strong>
                          {entry.amount === null
                            ? "Unknown"
                            : amountText(entry.amount, metric)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <output className="chart-empty compact-empty">
          <strong>{`No ${label.toLocaleLowerCase()} data in this range`}</strong>
          <span>Logged food items will appear here.</span>
        </output>
      )}
    </section>
  );
}
