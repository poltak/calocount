import { getNutritionAttention } from "@app/common/features/entries/utils/insights/nutrition-attention";
import type { InsightRange } from "@app/common/features/entries/utils/insights/nutrient-food-scenario";
import { useMemo } from "react";
import { formatDateRange } from "../utils/insight-format.js";
import { coverageRowsFor } from "./attention-format.js";
import { CoverageBlock } from "./coverage-block.js";
import { ExcessBlock } from "./excess-block.js";
import { useInsights } from "./insights-context.js";
import { ShortfallBlock } from "./shortfall-block.js";

const WINDOWS: readonly InsightRange[] = [14, 28];

/** Persistent shortfalls, repeated high days and the coverage behind them, for a 14 or 28 day window. */
export function NutritionAttentionPanel() {
  const { logic, state } = useInsights();
  const {
    days,
    entries,
    today,
    nutrientGoals,
    referenceSettings,
    attentionRange: range,
  } = state;
  const currentDate = today ?? "";
  const model = useMemo(
    () =>
      getNutritionAttention({
        days,
        entries,
        currentDate,
        goals: nutrientGoals,
        windowDays: range,
        referenceSettings,
      }),
    [days, entries, currentDate, nutrientGoals, range, referenceSettings],
  );
  const coverage = useMemo(
    () => coverageRowsFor({ model, entries }),
    [model, entries],
  );
  const loggedDays = days.filter(
    (day) =>
      day.date >= model.startDate &&
      day.date <= model.endDate &&
      day.mealCount > 0,
  ).length;

  return (
    <section
      className="panel nutrition-attention"
      aria-labelledby="nutrition-attention-title"
    >
      <div className="nutrition-attention__heading">
        <div>
          <p className="eyebrow">Recorded diet signals</p>
          <h2 id="nutrition-attention-title">Nutrition attention</h2>
          <p className="nutrition-attention__intro">
            Look for persistent gaps, repeated high days, and the missing values
            that limit what your log can tell you.
          </p>
        </div>
        <div
          className="nutrition-attention__controls"
          aria-label="Nutrition attention range"
        >
          <span>Window</span>
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              className={range === value ? "is-active" : ""}
              aria-pressed={range === value}
              onClick={() => logic.choose({ attentionRange: value })}
            >
              {`${value} days`}
            </button>
          ))}
        </div>
      </div>

      <p className="nutrition-attention__coverage-line">
        {`${formatDateRange(model.startDate, model.endDate)} · ${loggedDays} of ${model.windowDays} days have logs · current day excluded`}
      </p>

      <div className="nutrition-attention__grid">
        <ShortfallBlock model={model} coverage={coverage} />
        <ExcessBlock model={model} />
      </div>

      <CoverageBlock model={model} coverage={coverage} />

      <p className="nutrition-attention__note">
        These comparisons describe recorded intake and current goals. They do
        not measure nutrient status in the body or establish deficiency,
        toxicity, or medical risk.
      </p>
    </section>
  );
}
