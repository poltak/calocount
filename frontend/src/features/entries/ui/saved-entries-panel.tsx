import { formatKcal, formatNumber } from "../../core/utils/dashboard-format.js";
import { useDashboard } from "./dashboard-context.js";

/** The entries that the owner keeps to log again. */
export function SavedEntriesPanel() {
  const { dashboard, actions, busy } = useDashboard();
  const { savedEntries, today, loadSavedEntriesError } = dashboard.state;
  const { runningAction } = actions.state;
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
      {loadSavedEntriesError !== null && (
        <p className="saved-entries-error" role="alert">
          {`Saved entries could not be loaded. ${loadSavedEntriesError}`}
        </p>
      )}
      {savedEntries.length === 0 ? (
        <div className="saved-entries-empty">
          <strong>No saved entries yet</strong>
          <span>
            Use “Add to saved entries” on any entry to keep it handy here.
          </span>
        </div>
      ) : (
        <div className="saved-entry-list">
          {savedEntries.map((saved) => {
            const tracking =
              runningAction?.kind === "track" &&
              runningAction.entryId === saved.id;
            const removing =
              runningAction?.kind === "remove" &&
              runningAction.entryId === saved.id;
            return (
              <div
                className="saved-entry-row"
                key={saved.id}
                aria-busy={tracking || removing}
              >
                <div>
                  <strong>
                    {saved.items[0]?.name || saved.caption || "Saved entry"}
                  </strong>
                  <span>
                    {`${formatKcal(saved.totalCalories)} kcal · ${formatNumber(saved.totalProteinG)}g protein`}
                  </span>
                </div>
                <div className="saved-entry-actions">
                  <button
                    className="track-button"
                    type="button"
                    disabled={busy}
                    aria-busy={tracking}
                    onClick={() =>
                      today && void actions.logic.trackSaved({ saved, today })
                    }
                  >
                    {tracking ? "Tracking…" : "Track now"}
                  </button>
                  <button
                    className="remove-saved-entry-button"
                    type="button"
                    disabled={busy}
                    aria-busy={removing}
                    onClick={() => void actions.logic.removeSaved({ saved })}
                  >
                    {removing ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
