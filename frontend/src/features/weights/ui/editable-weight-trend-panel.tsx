import { useEffect, useRef } from "react";
import type { WeightSlotProps } from "../../entries/types.js";
import { WeightTrendPanel } from "./weight-trend-panel.js";
import { useWeights } from "./weight-context.js";

/** The weight trend of the owner: the button that adds or changes the weight of the day in view, and its form. */
export function EditableWeightTrendPanel({
  trendDates,
  trendWeights,
  trendRange,
  weightAllTime,
  onTrendRangeChange,
  onAllTime,
  selectedDate,
  weight,
  busy,
  openFormRequest,
}: WeightSlotProps) {
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
  const saving = state.saveState === "running";
  return (
    <WeightTrendPanel
      trendDates={trendDates}
      trendWeights={trendWeights}
      trendRange={trendRange}
      allTime={weightAllTime}
      onTrendRangeChange={onTrendRangeChange}
      onAllTime={onAllTime}
      selectedDate={selectedDate}
      action={
        selectedDate !== null && (
          <button
            className="primary-button"
            type="button"
            disabled={busy || saving}
            aria-busy={saving}
            onClick={() =>
              logic.openForm({ current: weight?.weightKg ?? null })
            }
          >
            {saving ? "Saving…" : weight ? "Edit weight" : "Add weight"}
          </button>
        )
      }
      form={
        selectedDate !== null &&
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
