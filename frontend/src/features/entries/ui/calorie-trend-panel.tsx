import { BarChart } from "../../core/ui/bar-chart.js";
import { ChartPanel } from "../../core/ui/chart-panel.js";
import {
  calculateCalorieChartScale,
  compareAverageToTarget,
} from "../utils/dashboard-calculations.js";
import {
  formatKcal,
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import { useDashboard } from "./dashboard-context.js";

function formatChartTick(value: number): string {
  return value === 0 ? "0" : `${(value / 1000).toFixed(1)}k`;
}

/** The calories of each day in the trend range against the goal. */
export function CalorieTrendPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, targets, trendRange, averageCalories } =
    dashboard.state;
  const days = dashboard.logic.visibleTrendDays;
  const goal = targets.calories;
  const comparison = compareAverageToTarget(averageCalories, goal);
  const scale = calculateCalorieChartScale(
    days.map((day) => day.calories),
    goal,
  );
  return (
    <ChartPanel
      id="trend"
      titleId="trend-title"
      eyebrow="A quick view"
      title="Calorie trend"
      action={
        <TrendRangeSelect
          value={trendRange}
          onChange={(range) => dashboard.logic.setTrendRange({ range })}
          label="Calorie trend"
        />
      }
      summary={
        <span>
          <strong>{`${formatKcal(Math.round(averageCalories))} kcal`}</strong>{" "}
          7-day average
          {comparison.direction === "at"
            ? " · at target"
            : ` · ${comparison.percentage}% ${comparison.direction} target`}
        </span>
      }
      legend={
        <>
          <span>
            <i className="legend-swatch calorie-swatch" /> Calories
          </span>
          <span>
            <i className="legend-line" />
            {` Target ${formatKcal(goal)}`}
          </span>
        </>
      }
    >
      <BarChart
        ariaLabel={`Calorie intake for the past ${days.length} days compared with a ${goal} calorie target`}
        dense={trendRange === 30}
        yTicks={scale.tickValues.map((value) => ({
          value,
          label: formatChartTick(value),
        }))}
        max={scale.tickValues[0] ?? 0}
        targetLine={{ value: goal, label: formatKcal(goal) }}
        bars={days.map((day, index) => ({
          key: day.date,
          label: trendDateLabel(day.date),
          showLabel: showTrendDateLabel(index, days.length),
          ariaLabel: `${trendDateLabel(day.date)}: ${formatKcal(day.calories)} kilocalories`,
          tooltip: formatKcal(day.calories),
          selected: day.date === selectedDate,
          missing: false,
          segments: [{ value: day.calories, tone: "calorie" }],
        }))}
      />
    </ChartPanel>
  );
}
