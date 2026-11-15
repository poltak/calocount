import {
  axisPosition,
  buildRepeatPoints,
  repeatAxisScale,
  repeatPointCounts,
} from "@app/common/features/entries/utils/insights/days-worth-repeating";
import { useMemo } from "react";
import { cx } from "../../core/utils/class-names.js";
import { formatLongDate } from "../utils/insight-format.js";
import { useInsights } from "./insights-context.js";
import type { CalorieBandName } from "./insights-logic.js";

const BANDS: Record<CalorieBandName, readonly [number, number]> = {
  "80–120%": [80, 120],
  "90–110%": [90, 110],
  "95–105%": [95, 105],
};

function bandNameOf(value: string): CalorieBandName {
  return (
    (Object.keys(BANDS) as CalorieBandName[]).find((name) => name === value) ??
    "90–110%"
  );
}

/** Past logged days placed by their calories and one nutrient, as percentages of the current targets. */
export function DaysWorthRepeatingPanel() {
  const { logic, state } = useInsights();
  const {
    days,
    entries,
    today,
    calorieTarget,
    proteinTargets,
    nutrientGoals,
    repeatRange: range,
    repeatMetric: metric,
    repeatBand: bandName,
    repeatDate,
  } = state;
  const points = useMemo(
    () =>
      buildRepeatPoints({
        days,
        currentDate: today ?? "",
        range,
        calorieTarget,
        proteinGoals: proteinTargets,
        fallbackProteinTarget: null,
        nutrientGoals,
        metric,
        calorieBand: BANDS[bandName],
      }),
    [
      days,
      today,
      range,
      calorieTarget,
      proteinTargets,
      nutrientGoals,
      metric,
      bandName,
    ],
  );
  const plotted = points.filter(
    (point) => point.caloriePercent !== null && point.percent !== null,
  );
  const xScale = repeatAxisScale(plotted.map((point) => point.caloriePercent));
  const yScale = repeatAxisScale(plotted.map((point) => point.percent));
  const counts = repeatPointCounts(points);
  const selected =
    points.find((point) => point.date === repeatDate) ??
    plotted.at(-1) ??
    points.at(-1) ??
    null;
  const selectedEntries = selected
    ? entries
        .filter((entry) => entry.date === selected.date)
        .toSorted((a, b) => a.consumedAt - b.consumedAt)
    : [];
  const metricName = metric === "protein" ? "Protein" : "Fiber";
  const band = BANDS[bandName];

  return (
    <section className="panel days-repeat" aria-labelledby="days-repeat-title">
      <div className="days-repeat-heading">
        <div>
          <h2 id="days-repeat-title">Days worth repeating</h2>
          <p>
            Find past logged days that matched the targets you use now, then
            inspect what you ate and drank. Today is excluded.
          </p>
        </div>
        <div className="days-repeat-controls">
          <label>
            Range
            <select
              value={range}
              onChange={(event) =>
                logic.choose({
                  repeatRange: Number(event.target.value) === 7 ? 7 : 30,
                })
              }
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
          <label>
            Vertical axis
            <select
              value={metric}
              onChange={(event) =>
                logic.choose({
                  repeatMetric:
                    event.target.value === "fiber" ? "fiber" : "protein",
                })
              }
            >
              <option value="protein">Protein</option>
              <option value="fiber">Fiber</option>
            </select>
          </label>
          <label>
            Calorie band
            <select
              value={bandName}
              onChange={(event) =>
                logic.choose({ repeatBand: bandNameOf(event.target.value) })
              }
            >
              {Object.keys(BANDS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="days-repeat-empty">
          No past logged days are available in this range yet.
        </p>
      ) : (
        <>
          <p className="days-repeat-summary">
            {`Showing ${counts.displayed} of ${points.length} logged days. `}
            {counts.unknownMetric > 0
              ? `${counts.unknownMetric} lack a usable ${metric} target or value. `
              : null}
            {metric === "fiber" && counts.partialMetric > 0
              ? `${counts.partialMetric} have partial fiber coverage.`
              : null}
          </p>
          {counts.unknownCalories > 0 && (
            <p className="days-repeat-empty">
              A positive current calorie target is needed to place days on the
              horizontal axis.
            </p>
          )}
          <div className="days-repeat-legend" aria-label="Chart legend">
            <span>
              <i className="repeat-dot joint" />
              {`Calorie band and ${metric} target met`}
            </span>
            <span>
              <i className="repeat-dot in-band" />
              Calorie band only
            </span>
            <span>
              <i className="repeat-dot" />
              Outside calorie band
            </span>
            {metric === "fiber" && (
              <span>
                <i className="repeat-dot partial" />
                Partial fiber data
              </span>
            )}
          </div>
          <div className="repeat-chart-wrap">
            <div className="repeat-y-title">{`${metricName} (% of current target)`}</div>
            <div
              className="repeat-chart"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A fieldset would bring its own box into the chart or list.
              role="group"
              aria-label={`Scatter plot of calories and ${metric} as percentages of current targets`}
            >
              <div className="repeat-chart-plot">
                <span
                  className="repeat-success-zone"
                  aria-hidden="true"
                  style={{
                    left: `${axisPosition(band[0], xScale)}%`,
                    width: `${axisPosition(band[1] - band[0], xScale)}%`,
                    bottom: `${axisPosition(100, yScale)}%`,
                  }}
                />
                <span
                  className="repeat-guide y"
                  aria-hidden="true"
                  style={{ bottom: `${axisPosition(100, yScale)}%` }}
                />
                <span
                  className="repeat-guide x"
                  aria-hidden="true"
                  style={{ left: `${axisPosition(100, xScale)}%` }}
                />
                {xScale.ticks.map((tick) => (
                  <span
                    key={`x${tick}`}
                    className="repeat-tick x"
                    style={{ left: `${axisPosition(tick, xScale)}%` }}
                  >
                    {`${tick}%`}
                  </span>
                ))}
                {yScale.ticks.map((tick) => (
                  <span
                    key={`y${tick}`}
                    className="repeat-tick y"
                    style={{ bottom: `${axisPosition(tick, yScale)}%` }}
                  >
                    {`${tick}%`}
                  </span>
                ))}
                {plotted.map((point) => (
                  <button
                    key={point.date}
                    type="button"
                    className={cx(
                      "repeat-point",
                      point.meetsBothTargets
                        ? "joint"
                        : point.inCalorieBand && "in-band",
                      point.coverage === "partial" && "partial",
                      selected?.date === point.date && "selected",
                    )}
                    style={{
                      left: `${axisPosition(point.caloriePercent ?? 0, xScale)}%`,
                      bottom: `${axisPosition(point.percent ?? 0, yScale)}%`,
                    }}
                    aria-label={`${formatLongDate(point.date)}: ${Math.round(point.caloriePercent ?? 0)}% of calorie target, ${Math.round(point.percent ?? 0)}% of ${metric} target${point.coverage === "partial" ? ", partial fiber data" : ""}`}
                    onClick={() => logic.choose({ repeatDate: point.date })}
                  />
                ))}
                {plotted.length === 0 && (
                  <p className="days-repeat-chart-empty">
                    No days have both targets available.
                  </p>
                )}
              </div>
            </div>
            <div className="repeat-x-title">Calories (% of current target)</div>
          </div>

          <label className="repeat-date-select">
            Inspect a day
            <select
              value={selected?.date ?? ""}
              onChange={(event) =>
                logic.choose({ repeatDate: event.target.value })
              }
            >
              <option value="" disabled>
                Select a date
              </option>
              {points.map((point) => (
                <option key={point.date} value={point.date}>
                  {formatLongDate(point.date)}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <div className="repeat-details" aria-live="polite">
              <h3>{formatLongDate(selected.date)}</h3>
              <p>
                {selected.caloriePercent === null
                  ? `${Math.round(selected.calories)} kcal; calorie target unavailable.`
                  : `${Math.round(selected.caloriePercent)}% of the current calorie target.`}{" "}
                {selected.percent === null
                  ? `${metricName} comparison unavailable.`
                  : `${Math.round(selected.percent)}% of the current ${metric} target.`}{" "}
                {selected.coverage === "partial"
                  ? selected.targetMet
                    ? "The known fiber amount reaches the target, but some items lack fiber data."
                    : "Fiber data is partial, so target status is uncertain."
                  : null}
              </p>
              <h4>Food and drink logged</h4>
              {selectedEntries.length === 0 ? (
                <p className="days-repeat-empty">
                  No entry details are available for this day.
                </p>
              ) : (
                <ul>
                  {selectedEntries.flatMap((entry) =>
                    entry.items.map((item, index) => (
                      <li key={`${entry.id}-${index}`}>
                        <span>{item.name}</span>
                        <small>
                          {`${item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""} · ` : ""}${Math.round(item.calories)} kcal · ${Math.round(item.proteinG)} g protein`}
                        </small>
                      </li>
                    )),
                  )}
                </ul>
              )}
            </div>
          )}
          <p className="days-repeat-note">
            Comparisons use your current calorie, nutrient, and per-day protein
            targets. Per-kilogram protein targets can differ by date. The
            calorie band is a matching filter, not a judgment that fewer
            calories are healthier.
          </p>
        </>
      )}
    </section>
  );
}
