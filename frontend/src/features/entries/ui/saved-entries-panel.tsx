import { formatNumber } from "../../core/utils/dashboard-format.js";
import { useDashboard } from "./dashboard-context.js";

/** The entries that the owner keeps to log again. */
export function SavedEntriesPanel() {
  const { dashboard, actions, busy } = useDashboard();
  const { savedEntries, today } = dashboard.state;
  return (
    <section
      className="panel saved-entries-panel"
      aria-labelledby="saved-entries-title"
    >
      <div className="panel-heading saved-entry-heading">
        <div>
          <p className="eyebrow">Your go-tos</p>
          <h2 id="saved-entries-title">
            Saved entries <span>{savedEntries.length}</span>
          </h2>
        </div>
      </div>
      {savedEntries.length === 0 ? (
        <div className="saved-entries-empty">
          <strong>No saved entries yet</strong>
          <span>
            Use “Add to saved entries” on any entry to keep it handy here.
          </span>
        </div>
      ) : (
        <div className="saved-entry-list">
          {savedEntries.map((saved) => (
            <div className="saved-entry-row" key={saved.id}>
              <div>
                <strong>
                  {saved.items[0]?.name || saved.caption || "Saved entry"}
                </strong>
                <span>
                  {`${formatNumber(saved.totalCalories)} kcal · ${formatNumber(saved.totalProteinG)}g protein`}
                </span>
              </div>
              <div className="saved-entry-actions">
                <button
                  className="track-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    today && void actions.logic.trackSaved({ saved, today })
                  }
                >
                  Track now
                </button>
                <button
                  className="remove-saved-entry-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void actions.logic.removeSaved({ saved })}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
