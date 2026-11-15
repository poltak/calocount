import { useEffect, useRef, type ReactNode } from "react";
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
  /** True for a visitor, who changes no weight. */
  readOnly: boolean;
  /** True while the weight saves. */
  saving: boolean;
  /** What the owner or a visitor sees beside the heading. */
  action: ReactNode;
  /** The form that adds or changes the weight, or `null`. */
  form: ReactNode;
}

/** The weight of the day in view, with the 7-day facts. It has no state of its own. */
export function WeightPanel({
  dates,
  weights,
  selectedDate,
  weight,
  timeZone,
  readOnly,
  saving,
  action,
  form,
}: WeightPanelProps) {
  const chart = buildWeightChart({ dates, weights });
  if (selectedDate === null) {
    return null;
  }
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
        {action}
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
            <span>
              {readOnly
                ? `No weight was recorded for ${weekdayOf(selectedDate)}.`
                : `Add one value for ${weekdayOf(selectedDate)}.`}
            </span>
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
      {form}
    </section>
  );
}

interface EditableWeightPanelProps extends WeightSlotData {
  weight: { weightKg: number; recordedAt: number } | null;
  timeZone: string;
  /** True while another change or a read runs. */
  busy: boolean;
  /** The form opens, and takes the focus, when this number changes. */
  openFormRequest: number;
}

/** The weight panel of the owner: the button that adds or changes the weight, and its form. */
export function EditableWeightPanel({
  dates,
  weights,
  selectedDate,
  weight,
  timeZone,
  busy,
  openFormRequest,
}: EditableWeightPanelProps) {
  const { logic, state } = useWeights();
  const input = useRef<HTMLInputElement>(null);
  const seenRequest = useRef(openFormRequest);
  const focusWhenOpen = useRef(false);
  const weightKg = weight?.weightKg ?? null;
  useEffect(() => {
    if (seenRequest.current === openFormRequest) {
      return;
    }
    seenRequest.current = openFormRequest;
    // An open form has its field already. A closed one has it after the next render.
    if (input.current) {
      input.current.focus();
    } else {
      focusWhenOpen.current = true;
    }
    logic.openForm({ current: weightKg });
  }, [openFormRequest, logic, weightKg]);
  useEffect(() => {
    if (focusWhenOpen.current && input.current) {
      focusWhenOpen.current = false;
      input.current.focus();
    }
  });
  if (selectedDate === null) {
    return null;
  }
  const saving = state.saveState === "running";
  return (
    <WeightPanel
      dates={dates}
      weights={weights}
      selectedDate={selectedDate}
      weight={weight}
      timeZone={timeZone}
      readOnly={false}
      saving={saving}
      action={
        <button
          className="primary-button"
          type="button"
          disabled={busy || saving}
          aria-busy={saving}
          onClick={() => logic.openForm({ current: weight?.weightKg ?? null })}
        >
          {saving ? "Saving…" : weight ? "Edit weight" : "Add weight"}
        </button>
      }
      form={
        state.draft !== null && (
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
                ref={input}
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
        )
      }
    />
  );
}
