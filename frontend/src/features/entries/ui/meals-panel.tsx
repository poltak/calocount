import { formatNumber, weekdayOf } from "../../core/utils/dashboard-format.js";
import { dayTotals } from "../utils/entry-view.js";
import { AddEntryForm } from "./add-entry-form.js";
import { useDashboard } from "./dashboard-context.js";
import { EntryRow } from "./entry-row.js";

/** The entries of the day in view, the form for a new one, and the total of the day. */
export function MealsPanel() {
  const { dashboard, form, busy } = useDashboard();
  const { entries, selectedDate, loadDayState } = dashboard.state;
  const totals = dayTotals(entries);
  const weekday = weekdayOf(selectedDate ?? "");
  const creating = form.state.addEntryState === "running";
  return (
    <section
      className="panel meals-panel"
      id="meals"
      aria-labelledby="meals-title"
    >
      <div className="panel-heading meal-heading">
        <div>
          <p className="eyebrow">What you consumed</p>
          <h2 id="meals-title">
            Entries <span>{entries.length}</span>
          </h2>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          aria-busy={creating}
          onClick={() =>
            form.state.addFormOpen
              ? form.logic.closeAddForm()
              : form.logic.openAddForm()
          }
        >
          <span aria-hidden="true">＋</span>{" "}
          {creating ? "Saving…" : "Add entry"}
        </button>
      </div>
      {form.state.addFormOpen && <AddEntryForm />}
      {entries.length > 0 ? (
        <div className="meal-list">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        loadDayState === "success" && (
          <div className="empty-meals">
            <span className="empty-icon" aria-hidden="true">
              ＋
            </span>
            <strong>{`No entries logged for ${weekday}`}</strong>
            <span>Tap “Add entry” to record what you consumed.</span>
          </div>
        )
      )}
      <div className="entries-estimate-note" aria-label="Calocount tip">
        <span className="tip-icon" aria-hidden="true">
          i
        </span>
        <p>
          <strong>Estimates are a starting point.</strong> Add a description to
          your photo for a more useful result.
        </p>
      </div>
      <div className="meal-total">
        <span>{`Total for ${weekday}`}</span>
        <strong>
          {`${formatNumber(totals.calories)} `}
          <small>kcal</small> <i />
          {` ${formatNumber(totals.protein)}g `}
          <small>protein</small>
        </strong>
      </div>
    </section>
  );
}
