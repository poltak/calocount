import type { FormEvent, ReactNode } from "react";
import "./components.css";
import { Button } from "./button.js";

/**
 * A form. `panel` sets it apart from the page, as an add or edit form inside
 * a list does. It calls `onSubmit` without the browser's page load.
 */
export function Form({
  id,
  title,
  panel = false,
  label,
  onSubmit,
  children,
}: {
  /** For a submit button outside the form. */
  id?: string | undefined;
  /** A heading in the panel, such as "Edit 10,000 steps a day". */
  title?: ReactNode;
  panel?: boolean | undefined;
  /** The accessible name when the form has no title. */
  label?: string | undefined;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      id={id}
      className="ui-form"
      data-panel={panel ? "" : undefined}
      aria-label={label}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {title && <h3 className="ui-form-title">{title}</h3>}
      {children}
    </form>
  );
}

/** Fields side by side on a wide screen, one under the other on a narrow one. */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="ui-form-row">{children}</div>;
}

/**
 * The buttons at the end of a form: the submit button first, then Cancel.
 * Pass the Logic task's state as `busy`, so the form cannot send twice.
 */
export function FormActions({
  submitLabel,
  busyLabel,
  busy = false,
  submitVariant = "primary",
  onCancel,
  cancelLabel = "Cancel",
  disabled = false,
  children,
}: {
  submitLabel: string;
  /** Such as "Saving…". */
  busyLabel?: string | undefined;
  busy?: boolean | undefined;
  /** `danger-solid` for a form that removes something. */
  submitVariant?: "primary" | "danger-solid" | undefined;
  onCancel?: (() => void) | undefined;
  cancelLabel?: string | undefined;
  disabled?: boolean | undefined;
  /** Other buttons, after Cancel. */
  children?: ReactNode;
}) {
  return (
    <div className="ui-form-actions">
      <Button
        type="submit"
        variant={submitVariant}
        busy={busy}
        busyLabel={busyLabel}
        disabled={disabled}
      >
        {submitLabel}
      </Button>
      {onCancel && (
        <Button onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
