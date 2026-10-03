import { useMemo } from "react";
import { Link } from "react-router";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useSignedInUser } from "../../core/ui/signed-in-user.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { NoteFormFields } from "./note-form-fields.js";
import { NotesLogic } from "./notes-logic.js";

export function NotesPage() {
  const app = useFrontendApp();
  const user = useSignedInUser();
  const deps = useMemo(
    () => ({
      storage: app.storage,
      services: app.services,
      api: { notes: app.api.notes },
      userId: user.id,
    }),
    [app, user.id],
  );
  const { logic, state } = useLogic({ LogicClass: NotesLogic, deps });
  const loading =
    state.loadState === "pristine" || state.loadState === "running";
  const creating = state.createState === "running";
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
        <NoteFormFields
          draft={logic.plugins.draft}
          fieldErrors={state.createFieldErrors}
          disabled={creating}
        />
        {state.createError && !state.createFieldErrors && (
          <p role="alert">{state.createError}</p>
        )}
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
        {state.notes.map((note) => (
          <li key={note.id}>
            <h2>{note.title}</h2>
            <p>{note.body}</p>
            <div className="actions">
              <Link to={`/notes/${note.id}`}>Edit</Link>
              <button
                disabled={removing}
                onClick={() => void logic.remove(note.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
