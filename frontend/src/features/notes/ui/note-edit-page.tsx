import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import {
  useAuthEvents,
  useSignedInUser,
} from "../../core/ui/signed-in-user.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { NoteEditLogic } from "./note-edit-logic.js";
import { NoteFormFields } from "./note-form-fields.js";

export function NoteEditPage() {
  const app = useFrontendApp();
  const user = useSignedInUser();
  const authEvents = useAuthEvents();
  const { noteId = "" } = useParams();
  const deps = useMemo(
    () => ({
      storage: app.storage,
      services: app.services,
      api: { notes: app.api.notes },
      userId: user.id,
      authEvents,
      noteId,
    }),
    [app, user.id, authEvents, noteId],
  );
  const { logic, state } = useLogic({ LogicClass: NoteEditLogic, deps });
  const saving = state.saveState === "running";

  if (state.isDone) {
    return <Navigate to="/notes" replace />;
  }
  if (state.loadState === "pristine" || state.loadState === "running") {
    return <output>Loading the note…</output>;
  }
  if (state.loadState === "error") {
    return (
      <section>
        <h1>Unable to open the note</h1>
        <p role="alert">{state.loadError}</p>
        <Link to="/notes">Go to your notes</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>Edit note</h1>
      <form
        className="note-form"
        onSubmit={(event) => {
          event.preventDefault();
          void logic.save();
        }}
      >
        <NoteFormFields
          draft={logic.plugins.draft}
          fieldErrors={state.saveFieldErrors}
          disabled={saving}
        />
        {state.saveError && !state.saveFieldErrors && (
          <p role="alert">{state.saveError}</p>
        )}
        <div className="actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => logic.cancel()}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
