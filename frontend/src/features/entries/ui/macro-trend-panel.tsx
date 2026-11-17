import { BarChart } from "../../core/ui/bar-chart.js";
import { ChartPanel } from "../../core/ui/chart-panel.js";
import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import {
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import {
  calculateMacroAverage,
  calculateMacroTrend,
} from "../utils/dashboard-calculations.js";
import { useDashboard } from "./dashboard-context.js";

const MACRO_TICKS = [
  { value: 100, label: "100%" },
  { value: 50, label: "50%" },
  { value: 0, label: "0%" },
];

/** The calorie-weighted split of carbs, protein and fat on each day of the trend range. */
export function MacroTrendPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, trendRange } = dashboard.state;
  const days = dashboard.logic.visibleTrendDays;
  const values = calculateMacroTrend(days);
  const average = calculateMacroAverage(days);
  const hasData = values.some((day) => day.hasData);
  return (
    <ChartPanel
      className="macro-trend-panel"
      titleId="macro-trend-title"
      eyebrow="A quick view"
      title="Macros trend"
      action={
        <TrendRangeSelect
          value={trendRange}
          onChange={(range) => dashboard.logic.setTrendRange({ range })}
          label="Macros trend"
        />
      }
      summary={
        average.hasData && (
          <span>
            <strong>
              {`Carbs ${average.percentages.carbs}% · Protein ${average.percentages.protein}% · Fat ${average.percentages.fat}%`}
            </strong>{" "}
            average
          </span>
        )
      }
      legend={
        hasData && (
          <>
            <span>
              <i className="legend-swatch macro-carbs-swatch" /> Carbs
            </span>
            <span>
              <i className="legend-swatch macro-protein-swatch" /> Protein
            </span>
            <span>
              <i className="legend-swatch macro-fat-swatch" /> Fat
            </span>
          </>
        )
      }
    >
      {hasData ? (
        <>
          <BarChart
            ariaLabel={`Calorie-weighted carbohydrate, protein, and fat split for the past ${trendRange} days; days without macro data are shown as gaps`}
            dense={trendRange === 30}
            yTicks={MACRO_TICKS}
            max={100}
            bars={values.map((day, index) => {
              const { carbs, protein, fat } = day.percentages;
              const label = trendDateLabel(day.date);
              return {
                key: day.date,
                label,
                showLabel: showTrendDateLabel(index, values.length),
                ariaLabel: day.hasData
                  ? `${label}: ${carbs}% carbohydrates, ${protein}% protein, ${fat}% fat`
                  : `${label}: no macro data`,
                tooltip: day.hasData
                  ? `${carbs}% C · ${protein}% P · ${fat}% F`
                  : "No data",
                selected: day.date === selectedDate,
                missing: !day.hasData,
                segments: [
                  { value: carbs, tone: "carbs" },
                  { value: protein, tone: "protein" },
                  { value: fat, tone: "fat" },
                ],
              };
            })}
          />
        </>
      ) : (
        <output className="chart-empty">
          <strong>{`No macro records for the past ${trendRange} days`}</strong>
          <span>
            Add protein, carbs, or fat to an entry to see the daily split.
          </span>
        </output>
      )}
    </ChartPanel>
  );
}
