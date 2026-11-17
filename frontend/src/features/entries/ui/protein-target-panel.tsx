import { TrendRangeSelect } from "../../core/ui/trend-range-select.js";
import { BarChart } from "../../core/ui/bar-chart.js";
import { ChartPanel } from "../../core/ui/chart-panel.js";
import {
  showTrendDateLabel,
  trendDateLabel,
} from "../../core/utils/dashboard-format.js";
import { calculateProteinChartScale } from "../utils/dashboard-calculations.js";
import { useDashboard } from "./dashboard-context.js";

function format(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** The protein of each day in the trend range against the target of that day. */
export function ProteinTargetPanel() {
  const { dashboard } = useDashboard();
  const { selectedDate, trendRange, proteinTargets } = dashboard.state;
  const targets = new Map(
    proteinTargets.map((entry) => [entry.date, entry.targetG]),
  );
  const values = dashboard.logic.visibleTrendDays.map((day) => ({
    ...day,
    target: targets.get(day.date) ?? null,
  }));
  const scale = calculateProteinChartScale(
    values.flatMap((day) => [day.proteinG, day.target ?? 0]),
  );
  const knownDays = values.filter((day) => day.mealCount > 0);
  const average =
    knownDays.length > 0
      ? knownDays.reduce((sum, day) => sum + day.proteinG, 0) / knownDays.length
      : 0;
  const targetDays = knownDays.filter(
    (day) => day.target !== null && day.target > 0,
  );
  const hitDays = targetDays.filter(
    (day) => day.proteinG >= (day.target ?? Infinity),
  ).length;
  return (
    <ChartPanel
      className="protein-target-panel"
      titleId="protein-target-title"
      eyebrow="Daily amount"
      title="Protein vs target"
      action={
        <TrendRangeSelect
          value={trendRange}
          onChange={(range) => dashboard.logic.setTrendRange({ range })}
          label="Protein versus target"
        />
      }
      summary={
        <>
          <span>
            <strong>{`${format(average)} g`}</strong> known-day average
          </span>
          <span>
            <strong>{`${hitDays} of ${targetDays.length}`}</strong> recorded
            days met target
          </span>
        </>
      }
      legend={
        <>
          <span>
            <i className="legend-swatch protein-swatch" /> Protein
          </span>
          <span>
            <i className="legend-line" /> Daily target
          </span>
        </>
      }
    >
      <BarChart
        ariaLabel={`Daily protein in grams compared with the protein target for the past ${trendRange} days`}
        dense={trendRange === 30}
        yTicks={scale.ticks.map((value) => ({
          value,
          label: String(value),
        }))}
        max={scale.max}
        bars={values.map((day, index) => {
          const label = trendDateLabel(day.date);
          return {
            key: day.date,
            label,
            showLabel: showTrendDateLabel(index, values.length),
            ariaLabel:
              day.mealCount > 0
                ? `${label}: ${format(day.proteinG)} grams protein${day.target ? `, target ${format(day.target)} grams` : ""}`
                : `${label}: no entries recorded`,
            tooltip:
              day.mealCount > 0
                ? `${format(day.proteinG)}g${day.target ? ` / ${format(day.target)}g` : ""}`
                : "No meals",
            selected: day.date === selectedDate,
            missing: day.mealCount === 0,
            segments: [{ value: day.proteinG, tone: "protein" }],
            target: day.target,
          };
        })}
      />
    </ChartPanel>
  );
}
