import { calculateMacroPercentages } from "../utils/dashboard-calculations.js";
import { formatNumber } from "../../core/utils/dashboard-format.js";
import { dayTotals } from "../utils/entry-view.js";
import { useDashboard } from "./dashboard-context.js";

function LegendRow({
  name,
  label,
  grams,
  percent,
}: {
  name: string;
  label: string;
  grams: number;
  percent: number;
}) {
  return (
    <div>
      <span className={`macro-key ${name}`} />
      <span>{label}</span>
      <small>{`${formatNumber(Math.round(grams))} g`}</small>
      <strong>{`${percent}%`}</strong>
    </div>
  );
}

/** The split of the day's calories between carbs, protein and fat. */
export function MacroPanel() {
  const { dashboard } = useDashboard();
  const totals = dayTotals(dashboard.state.entries);
  const percentages = calculateMacroPercentages({
    carbsG: totals.carbs,
    proteinG: totals.protein,
    fatG: totals.fat,
  });
  const hasData = percentages.carbs + percentages.protein + percentages.fat > 0;
  const gradient = hasData
    ? `conic-gradient(var(--chart-green) 0 ${percentages.protein}%, var(--chart-blue) ${percentages.protein}% ${percentages.protein + percentages.carbs}%, var(--chart-orange) ${percentages.protein + percentages.carbs}% 100%)`
    : "var(--chart-base)";
  return (
    <section
      className="panel macro-panel compact-dashboard-panel"
      aria-labelledby="macros"
    >
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Daily split</p>
          <h2 id="macros">Macros</h2>
        </div>
        <span className="panel-meta">per day</span>
      </div>
      <div
        className="macro-donut"
        style={{ background: gradient }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An img element cannot hold the kcal figure in its centre.
        role="img"
        aria-label={`Estimated daily macro split: ${percentages.carbs} percent carbohydrates, ${percentages.protein} percent protein, ${percentages.fat} percent fat`}
      >
        <div>
          <strong>{formatNumber(Math.round(totals.calories))}</strong>
          <span>kcal</span>
        </div>
      </div>
      <div className="macro-legend">
        <LegendRow
          name="carbs"
          label="Carbs"
          grams={totals.carbs}
          percent={percentages.carbs}
        />
        <LegendRow
          name="protein"
          label="Protein"
          grams={totals.protein}
          percent={percentages.protein}
        />
        <LegendRow
          name="fat"
          label="Fat"
          grams={totals.fat}
          percent={percentages.fat}
        />
      </div>
    </section>
  );
}
