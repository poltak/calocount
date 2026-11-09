import type { TaskFieldErrors } from "@app/common/features/core/logic/logic";
import { useLogicInstance } from "../../core/logic/use-logic.js";
import type { NoteDraftPlugin } from "./note-draft-plugin.js";

interface NoteFormFieldsProps {
  /** The draft that holds the fields. The form's Logic owns it. */
  draft: NoteDraftPlugin;
  fieldErrors: TaskFieldErrors | null;
  disabled: boolean;
}

export function NoteFormFields({
  draft,
  fieldErrors,
  disabled,
}: NoteFormFieldsProps) {
  const state = useLogicInstance(draft);

  return (
    <>
      {state.isRestored && <p>Your unsaved text is back.</p>}
      <label htmlFor="note-title">Title</label>
      <input
        id="note-title"
        aria-invalid={fieldErrors?.title ? true : undefined}
        aria-describedby={fieldErrors?.title ? "note-title-error" : undefined}
        required
        value={state.title}
        onChange={(event) => draft.setTitle(event.target.value)}
        disabled={disabled}
      />
      {fieldErrors?.title && (
        <p id="note-title-error" role="alert">
          {fieldErrors.title}
        </p>
      )}
      <label htmlFor="note-body">Note</label>
      <textarea
        id="note-body"
        aria-invalid={fieldErrors?.body ? true : undefined}
        aria-describedby={fieldErrors?.body ? "note-body-error" : undefined}
        rows={3}
        value={state.body}
        onChange={(event) => draft.setBody(event.target.value)}
        disabled={disabled}
      />
      {fieldErrors?.body && (
        <p id="note-body-error" role="alert">
          {fieldErrors.body}
        </p>
      )}
    </>
  );
}
