import type { ReactNode } from "react";
import { ChartFrame } from "../../core/ui/chart-frame.js";
import { ChartPanel } from "../../core/ui/chart-panel.js";
import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import type { TrendRange } from "../../core/utils/trend-range.js";
import { trendDateLabel } from "../../core/utils/dashboard-format.js";
import {
  buildWeightChart,
  formatWeight,
  showWeightDateLabel,
} from "../utils/weight-chart.js";

interface WeightTrendPanelProps {
  /** The days of the trend range, oldest first. */
  trendDates: string[];
  trendWeights: { logicalDate: string; weightKg: number }[];
  trendRange: TrendRange;
  /** True when the chart shows every day from the first weight, not the trend range. */
  allTime: boolean;
  onTrendRangeChange: (range: TrendRange) => void;
  onAllTime: () => void;
  selectedDate: string | null;
  /** The owner's button that adds or changes the weight of the day in view. A visitor has none. */
  action: ReactNode;
  /** The owner's form, below the heading. */
  form: ReactNode;
}

/** The weight of each day in the trend range, with the 7-day average. A day without a weight is a gap. */
export function WeightTrendPanel({
  trendDates,
  trendWeights,
  trendRange,
  allTime,
  onTrendRangeChange,
  onAllTime,
  selectedDate,
  action,
  form,
}: WeightTrendPanelProps) {
  const chart = buildWeightChart({
    dates: trendDates,
    weights: trendWeights,
  });
  const { days, ticks, rawSegments, averageLine, weeklyChange, latestAverage } =
    chart;
  return (
    <ChartPanel
      id="weight"
      className="weight-trend-panel"
      titleId="weight-trend-title"
      eyebrow="A quick view"
      title="Weight trend"
      action={
        <div className="panel-heading-actions">
          {action}
          <TrendRangeSelect
            value={trendRange}
            onChange={onTrendRangeChange}
            allTime={allTime}
            onAllTime={onAllTime}
            label="Weight trend"
          />
        </div>
      }
      form={form}
      summary={
        chart.hasData &&
        latestAverage !== null && (
          <span>
            <strong>{`${formatWeight(latestAverage)} kg`}</strong> 7-day average
            {weeklyChange !== null &&
              ` · ${weeklyChange > 0 ? "+" : ""}${formatWeight(weeklyChange)} kg vs 7 days earlier`}
          </span>
        )
      }
      legend={
        chart.hasData && (
          <>
            <span>
              <i className="legend-swatch weight-swatch" /> Daily weight
            </span>
            <span>
              <i className="legend-line weight-average-line" /> 7-day average
            </span>
          </>
        )
      }
    >
      {chart.hasData ? (
        <ChartFrame
          ariaLabel={`Recorded weight ${allTime ? `for all time, ${days.length} days` : `for the past ${days.length} days`} in kilograms; missing days are shown as gaps`}
          density={allTime ? "packed" : trendRange === 30 ? "dense" : "regular"}
          evenColumns
          yTicks={ticks.map((tick, index) => ({
            percent: (1 - index / (ticks.length - 1)) * 100,
            label: formatWeight(tick),
          }))}
          underlay={
            <svg
              className="weight-line"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="weight-area-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop className="weight-area-start" offset="0" />
                  <stop className="weight-area-end" offset="1" />
                </linearGradient>
              </defs>
              {averageLine.length > 1 && (
                <polygon
                  className="weight-area"
                  points={`${averageLine.join(" ")} ${averageLine.at(-1)?.split(",")[0]},100 ${averageLine[0]?.split(",")[0]},100`}
                />
              )}
              {rawSegments.map(
                (points) =>
                  points.length > 1 && (
                    <polyline
                      key={points[0]}
                      className="weight-raw-line"
                      points={points.join(" ")}
                    />
                  ),
              )}
              {averageLine.length > 1 && (
                <polyline
                  className="weight-average-path"
                  points={averageLine.join(" ")}
                />
              )}
            </svg>
          }
          columns={days.map((day, index) => ({
            key: day.date,
            label: trendDateLabel(day.date),
            showLabel: showWeightDateLabel({
              index,
              total: days.length,
              allTime,
            }),
            ariaLabel:
              day.value === null
                ? `${trendDateLabel(day.date)}: no weight recorded`
                : `${trendDateLabel(day.date)}: ${formatWeight(day.value)} kilograms`,
            tooltip:
              day.value === null
                ? "No record"
                : `${formatWeight(day.value)} kg`,
            selected: day.date === selectedDate,
            content: day.value !== null && (
              <span
                className="weight-point"
                style={{ bottom: `${day.height ?? 0}%` }}
              />
            ),
          }))}
        />
      ) : (
        <output className="chart-empty">
          <strong>
            {allTime
              ? "No weight records yet"
              : `No weight records for the past ${trendRange} days`}
          </strong>
          <span>Record a daily weight to see your trend.</span>
        </output>
      )}
    </ChartPanel>
  );
}
