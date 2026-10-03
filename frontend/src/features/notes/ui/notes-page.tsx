import { useMemo } from "react";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { NotesLogic } from "./notes-logic.js";

export function NotesPage() {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: app.storage,
      services: app.services,
      api: { notes: app.api.notes },
    }),
    [app],
  );
  const { logic, state } = useLogic({ LogicClass: NotesLogic, deps });
  const loading =
    state.loadState === "pristine" || state.loadState === "running";
  const creating = state.createState === "running";
  const saving = state.saveState === "running";
  const removing = state.removeState === "running";

  return (
    <section>
      <h1>Notes</h1>

      <form
        className="note-form"
        onSubmit={(event) => {
          event.preventDefault();
          void logic.create();
        }}
      >
        <label htmlFor="new-note-title">Title</label>
        <input
          id="new-note-title"
          required
          value={state.newTitle}
          onChange={(event) => logic.setNewTitle(event.target.value)}
          disabled={creating}
        />
        <label htmlFor="new-note-body">Note</label>
        <textarea
          id="new-note-body"
          rows={3}
          value={state.newBody}
          onChange={(event) => logic.setNewBody(event.target.value)}
          disabled={creating}
        />
        {state.createError && <p role="alert">{state.createError}</p>}
        <button type="submit" disabled={creating}>
          {creating ? "Adding…" : "Add note"}
        </button>
      </form>

      {loading && <output>Loading your notes…</output>}
      {state.loadError && (
        <>
          <p role="alert">{state.loadError}</p>
          <button onClick={() => void logic.load()}>Try again</button>
        </>
      )}
      {state.removeError && <p role="alert">{state.removeError}</p>}
      {state.loadState === "success" && state.notes.length === 0 && (
        <p>You have no notes yet.</p>
      )}

      <ul className="note-list">
        {state.notes.map((note) =>
          note.id === state.editingNoteId ? (
            <li key={note.id}>
              <form
                className="note-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void logic.save();
                }}
              >
                <label htmlFor="edit-note-title">Title</label>
                <input
                  id="edit-note-title"
                  required
                  value={state.editTitle}
                  onChange={(event) => logic.setEditTitle(event.target.value)}
                  disabled={saving}
                />
                <label htmlFor="edit-note-body">Note</label>
                <textarea
                  id="edit-note-body"
                  rows={3}
                  value={state.editBody}
                  onChange={(event) => logic.setEditBody(event.target.value)}
                  disabled={saving}
                />
                {state.saveError && <p role="alert">{state.saveError}</p>}
                <div className="actions">
                  <button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => logic.cancelEditing()}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={note.id}>
              <h2>{note.title}</h2>
              <p>{note.body}</p>
              <div className="actions">
                <button onClick={() => logic.startEditing(note.id)}>
                  Edit
                </button>
                <button
                  disabled={removing}
                  onClick={() => void logic.remove(note.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
