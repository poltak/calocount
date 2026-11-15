import { useEffect, useRef } from "react";
import { entryKindLabels } from "@app/common/features/entries/utils/entry-kind";
import { formatNumber } from "../../core/utils/dashboard-format.js";
import {
  pendingLabels,
  type EntryView,
  type PendingKind,
} from "../utils/entry-view.js";
import { useDashboard } from "./dashboard-context.js";
import { EntryEditor } from "./entry-editor.js";
import { EntryNutritionDetails } from "./entry-nutrition-details.js";
import { PhotoThumbnail } from "./photo-thumbnail.js";

function Stat({
  className,
  label,
  value,
  unit,
}: {
  className: string;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className={`meal-stat ${className}`}>
      <span className="meal-stat-label">{label}</span>
      <span>
        {`${formatNumber(value)} `}
        <small>{unit}</small>
      </span>
    </div>
  );
}

/** One entry of the day: its values, the nutrition details, the buttons, and its editor. */
export function EntryRow({
  entry,
  pending,
}: {
  entry: EntryView;
  /** Set for a row that stands for an entry that is still saving. */
  pending?: PendingKind;
}) {
  const { dashboard, form, actions, photos, busy, audience } = useDashboard();
  const readOnly = audience === "public";
  const { savedEntries, today, selectedDate, openDetailIds } = dashboard.state;
  const saved = savedEntries.some(
    (candidate) =>
      candidate.sourceEntryId === entry.id ||
      candidate.id === entry.savedEntryId,
  );
  const editing = form.state.draft?.original.id === entry.id;
  const { runningAction } = actions.state;
  const runningHere = (kind: NonNullable<typeof runningAction>["kind"]) =>
    runningAction?.kind === kind && runningAction.entryId === entry.id;
  const copying = runningHere("copy");
  const duplicating = runningHere("duplicate");
  const deleting = runningHere("delete");
  const inspected = dashboard.state.inspectedEntryId === entry.id;
  const articleRef = useRef<HTMLElement>(null);
  // An insight sent the owner here: bring the editor into view and focus it.
  useEffect(() => {
    if (!inspected || !editing) {
      return;
    }
    const article = articleRef.current;
    article?.scrollIntoView({ behavior: "smooth", block: "start" });
    article?.querySelector<HTMLInputElement>(".inline-editor input")?.focus({
      preventScroll: true,
    });
    dashboard.logic.finishInspect();
  }, [inspected, editing, dashboard.logic]);
  const detailsOpen = openDetailIds.includes(entry.id);
  const photoUrl = photos.logic.shownPhotoUrl({ entry });
  const withoutPhoto = photoUrl === null ? " without-photo" : "";
  return (
    <article ref={articleRef} className="meal-group" aria-label={entry.name}>
      <div
        className={`meal-row${withoutPhoto}${pending ? " is-pending" : ""}`}
        aria-busy={pending ? true : undefined}
      >
        <div className={`meal-row-content${withoutPhoto}`}>
          {photoUrl !== null && (
            <PhotoThumbnail entry={entry} photoUrl={photoUrl} />
          )}
          <div className="meal-info">
            <div className="meal-name-line">
              <strong>{entry.name}</strong>
              <time>{entry.time}</time>
              {entry.kind && (
                <span className="meal-kind" data-kind={entry.kind}>
                  {entryKindLabels[entry.kind]}
                </span>
              )}
              {pending && (
                <output className="pending-indicator">
                  {pendingLabels[pending]}
                </output>
              )}
            </div>
            {entry.description.trim().toLocaleLowerCase() !==
              entry.name.trim().toLocaleLowerCase() && (
              <span>{entry.description}</span>
            )}
          </div>
          <div className="meal-macros" aria-label="Entry macros">
            <Stat
              className="calories-stat"
              label="Energy"
              value={entry.calories}
              unit="kcal"
            />
            <Stat
              className="protein-stat"
              label="Protein"
              value={entry.protein}
              unit="g"
            />
            <Stat
              className="carbs-stat"
              label="Carbs"
              value={entry.carbs}
              unit="g"
            />
            <Stat className="fat-stat" label="Fat" value={entry.fat} unit="g" />
          </div>
        </div>
        <div className="meal-row-footer">
          <div className="meal-nutrition-details">
            <button
              type="button"
              className="nutrition-details-button"
              aria-expanded={detailsOpen}
              onClick={() =>
                dashboard.logic.toggleNutritionDetails({ entryId: entry.id })
              }
            >
              {detailsOpen ? "Hide nutrition details" : "Nutrition details"}
            </button>
            {detailsOpen && <EntryNutritionDetails entry={entry} />}
          </div>
          {!readOnly && !pending && (
            <div className="meal-actions" id={`meal-actions-${entry.id}`}>
              <button
                className="save-entry-button"
                type="button"
                disabled={busy || saved}
                aria-label={`Add ${entry.name} to saved entries`}
                onClick={() => void actions.logic.saveForLater({ entry })}
              >
                {saved ? "Saved" : "Add to saved entries"}
              </button>
              {selectedDate !== today && (
                <button
                  className="copy-button"
                  type="button"
                  disabled={busy}
                  aria-label={`Copy ${entry.name} to today`}
                  aria-busy={copying}
                  onClick={() =>
                    today &&
                    void actions.logic.copyEntryToToday({ entry, today })
                  }
                >
                  {copying ? "Copying…" : "Copy to today"}
                </button>
              )}
              <button
                className="duplicate-button"
                type="button"
                disabled={busy}
                aria-label={`Duplicate ${entry.name}`}
                aria-busy={duplicating}
                onClick={() => void actions.logic.duplicateEntry({ entry })}
              >
                {duplicating ? "Duplicating…" : "Duplicate"}
              </button>
              <button
                className="edit-button"
                type="button"
                disabled={busy}
                aria-expanded={editing}
                aria-label={`Edit ${entry.name}`}
                onClick={() =>
                  editing
                    ? form.logic.cancelEdit()
                    : form.logic.startEdit({ entry })
                }
              >
                Edit
              </button>
              <button
                className="delete-button"
                type="button"
                disabled={busy}
                aria-label={`Delete ${entry.name}`}
                aria-busy={deleting}
                onClick={() => void actions.logic.deleteEntry({ entry })}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
        </div>
      </div>
      {!readOnly && editing && <EntryEditor />}
    </article>
  );
}
