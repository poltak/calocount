import { cx } from "../../core/utils/class-names.js";
import { weekdayOf } from "../../core/utils/dashboard-format.js";
import {
  buildWeightChart,
  formatRecordedTime,
  formatWeight,
  type WeightSlotData,
} from "../utils/weight-chart.js";
import { useWeights } from "./weight-context.js";

interface WeightPanelProps extends WeightSlotData {
  weight: { weightKg: number; recordedAt: number } | null;
  timeZone: string;
  /** True while another change or a read runs. */
  busy: boolean;
}

/** The weight of the day in view, with the form that adds or changes it. */
export function WeightPanel({
  dates,
  weights,
  selectedDate,
  weight,
  timeZone,
  busy,
}: WeightPanelProps) {
  const chart = buildWeightChart({ dates, weights });
  const { logic, state } = useWeights();
  if (selectedDate === null) {
    return null;
  }
  const saving = state.saveState === "running";
  const { latestAverage, weeklyChange } = chart;
  return (
    <section
      className="panel weight-panel compact-dashboard-panel"
      id="weight"
      aria-labelledby="weight-title"
    >
      <div className="panel-heading weight-heading">
        <div>
          <p className="eyebrow">Daily check-in</p>
          <h2 id="weight-title">Weight</h2>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={busy || saving}
          aria-busy={saving}
          onClick={() => logic.openForm({ current: weight?.weightKg ?? null })}
        >
          {saving ? "Saving…" : weight ? "Edit weight" : "Add weight"}
        </button>
      </div>
      <div
        className={cx(
          "weight-reading",
          !weight && "empty",
          saving && "is-pending",
        )}
        aria-busy={saving}
      >
        {weight ? (
          <>
            <strong>
              {`${formatWeight(weight.weightKg)} `}
              <small>kg</small>
            </strong>
            <time dateTime={new Date(weight.recordedAt).toISOString()}>
              {`Saved at ${formatRecordedTime(weight.recordedAt, timeZone)}`}
            </time>
          </>
        ) : (
          <>
            <strong>No weight recorded</strong>
            <span>{`Add one value for ${weekdayOf(selectedDate)}.`}</span>
          </>
        )}
      </div>
      {latestAverage !== null && (
        <div className="weight-facts">
          <div>
            <span>7-day average</span>
            <strong>
              {`${formatWeight(latestAverage)} `}
              <small>kg</small>
            </strong>
          </div>
          {weeklyChange !== null && (
            <div>
              <span>vs 7 days earlier</span>
              <strong>
                {`${weeklyChange > 0 ? "+" : ""}${formatWeight(weeklyChange)} `}
                <small>kg</small>
              </strong>
            </div>
          )}
        </div>
      )}
      {state.draft !== null && (
        <form
          className="weight-form"
          aria-busy={saving}
          onSubmit={(event) => {
            event.preventDefault();
            void logic.save({ date: selectedDate });
          }}
        >
          <label>
            Weight (kg)
            <input
              name="weightKg"
              type="number"
              min="1"
              max="1000"
              step="0.1"
              inputMode="decimal"
              required
              value={state.draft}
              disabled={saving}
              onChange={(event) =>
                logic.changeDraft({ value: event.target.value })
              }
            />
          </label>
          <button className="save-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : weight ? "Save changes" : "Save weight"}
          </button>
          <button
            className="cancel-button"
            type="button"
            disabled={saving}
            onClick={() => logic.closeForm()}
          >
            Cancel
          </button>
          {state.saveError && <p role="alert">{state.saveError}</p>}
        </form>
      )}
    </section>
  );
}
