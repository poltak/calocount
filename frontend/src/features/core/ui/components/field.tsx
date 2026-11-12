import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Field as BaseField } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Select as BaseSelect } from "@base-ui/react/select";
import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import "./components.css";
import { Icon } from "./icon.js";

/** The attributes that tie a control to its label, hint, and error. */
interface FieldControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
}

interface FieldText {
  label: ReactNode;
  /** A short help text under the control. */
  hint?: ReactNode;
  /** The message of a failed rule. A Logic task's `<name>FieldErrors` gives it. */
  error?: string | null | undefined;
  /** Hide the label and keep it for screen readers, such as in a table row. */
  hideLabel?: boolean | undefined;
}

/**
 * A label, a control, a hint, and an error, in this order. `children` gets
 * the attributes that the control must take. Export it when a control is
 * missing in this folder, and show the new control on the component library page.
 */
function Field({
  label,
  hint,
  error,
  hideLabel = false,
  below,
  children,
}: FieldText & {
  /** Under the error, such as a Notice about the control. */
  below?: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <BaseField.Root className="ui-field" invalid={Boolean(error)}>
      <BaseField.Label
        className={
          hideLabel ? "ui-field-label ui-visually-hidden" : "ui-field-label"
        }
        htmlFor={id}
      >
        {label}
      </BaseField.Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && (
        <p className="ui-field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ui-field-error" id={errorId} role="alert">
          <Icon name="error" />
          {error}
        </p>
      )}
      {below}
    </BaseField.Root>
  );
}

type NativeInput = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "style" | "id" | "value" | "onChange" | "type"
>;

export function TextInput({
  label,
  hint,
  error,
  hideLabel,
  value,
  onChange,
  type = "text",
  ref,
  ...rest
}: FieldText &
  NativeInput & {
    value: string;
    onChange: (value: string) => void;
    type?:
      "text" | "email" | "password" | "number" | "date" | "url" | undefined;
    /** Such as for a form that focuses its first field when it opens. */
    ref?: Ref<HTMLInputElement> | undefined;
  }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(control) => (
        <Input
          {...rest}
          {...control}
          ref={ref}
          className="ui-input"
          type={type}
          value={value}
          onValueChange={onChange}
        />
      )}
    </Field>
  );
}

/** A text field of several lines. */
export function TextArea({
  label,
  hint,
  error,
  hideLabel,
  value,
  onChange,
  rows = 3,
  header,
  footer,
  ref,
  ...rest
}: FieldText &
  Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "className" | "style" | "id" | "value" | "onChange"
  > & {
    value: string;
    onChange: (value: string) => void;
    /** Inside the box, above the text, such as the part of a file that a note is about. */
    header?: ReactNode;
    /** Small buttons inside the box, under the text, such as Save. */
    footer?: ReactNode;
    ref?: Ref<HTMLTextAreaElement> | undefined;
  }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(control) => {
        const textarea = (
          <BaseField.Control
            {...control}
            className="ui-input"
            value={value}
            onValueChange={onChange}
            render={<textarea {...rest} ref={ref} rows={rows} />}
          />
        );
        if (!header && !footer) {
          return textarea;
        }
        return (
          <div className="ui-textarea-box">
            {header && <div className="ui-textarea-header">{header}</div>}
            {textarea}
            {footer && <div className="ui-textarea-footer">{footer}</div>}
          </div>
        );
      }}
    </Field>
  );
}

/**
 * The search of a list. Name what it searches in the label, such as "Search
 * notes by title", and keep the placeholder for an example.
 */
export function SearchInput({
  label,
  hint,
  hideLabel,
  value,
  onChange,
  ...rest
}: Omit<FieldText, "error"> &
  NativeInput & {
    value: string;
    onChange: (value: string) => void;
  }) {
  return (
    <Field label={label} hint={hint} hideLabel={hideLabel}>
      {(control) => (
        <div className="ui-search">
          <Icon name="search" />
          <Input
            {...rest}
            {...control}
            className="ui-input"
            type="search"
            value={value}
            onValueChange={onChange}
          />
        </div>
      )}
    </Field>
  );
}

export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean | undefined;
}

/** A choice from a short, fixed list. */
export function Select<Value extends string>({
  label,
  hint,
  error,
  hideLabel,
  value,
  options,
  onChange,
  name,
  form,
  required,
  disabled,
  autoComplete,
  ref,
  ...rest
}: FieldText &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "style" | "id" | "value" | "onChange" | "children" | "type"
  > & {
    value: Value;
    options: readonly SelectOption<Value>[];
    onChange: (value: Value) => void;
    required?: boolean | undefined;
    autoComplete?: string | undefined;
    ref?: Ref<HTMLButtonElement> | undefined;
  }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(control) => (
        <BaseSelect.Root
          id={control.id}
          items={options}
          value={value}
          onValueChange={(nextValue) => {
            if (nextValue !== null) {
              onChange(nextValue);
            }
          }}
          name={name}
          form={form}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
        >
          <span
            className="ui-select"
            data-disabled={disabled ? "" : undefined}
            data-invalid={error ? "" : undefined}
          >
            <BaseSelect.Trigger
              {...rest}
              {...control}
              ref={ref}
              className="ui-select-trigger"
              value={value}
            >
              <BaseSelect.Value className="ui-select-value" />
              <BaseSelect.Icon className="ui-select-icon">
                <Icon name="chevron-down" />
              </BaseSelect.Icon>
            </BaseSelect.Trigger>
          </span>
          <BaseSelect.Portal>
            <BaseSelect.Positioner
              className="ui-select-positioner"
              align="start"
              sideOffset={4}
              alignItemWithTrigger={false}
            >
              <BaseSelect.Popup className="ui-select-popup">
                {options.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    className="ui-select-item"
                    value={option.value}
                    label={option.label}
                    disabled={option.disabled}
                  >
                    <BaseSelect.ItemText className="ui-select-item-text">
                      {option.label}
                    </BaseSelect.ItemText>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.Popup>
            </BaseSelect.Positioner>
          </BaseSelect.Portal>
        </BaseSelect.Root>
      )}
    </Field>
  );
}

/**
 * A group of fields under one name, such as the parts of an address. `note` is a
 * short text under the name.
 */
export function FieldGroup({
  legend,
  note,
  large = false,
  action,
  children,
}: {
  legend: ReactNode;
  note?: ReactNode;
  /** The legend is a title over fields that have labels of their own. */
  large?: boolean | undefined;
  /** Buttons on the row of the title, after it. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="ui-field-group" data-large={large ? "" : undefined}>
      <legend className="ui-field-label">
        <span>{legend}</span>
        {action}
      </legend>
      {note && <p className="ui-field-hint ui-field-group-note">{note}</p>}
      {children}
    </fieldset>
  );
}

/** One yes-or-no choice. The label is the text beside the box. */
export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
}) {
  const labelId = useId();
  const hintId = hint ? `${labelId}-hint` : undefined;
  return (
    <label
      className="ui-check"
      data-checked={checked ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
    >
      <BaseCheckbox.Root
        className="ui-check-control"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-labelledby={labelId}
        aria-describedby={hintId}
      >
        <BaseCheckbox.Indicator className="ui-check-indicator">
          <Icon name="check" />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>
        <span id={labelId}>{label}</span>
        {hint && (
          <span className="ui-check-hint" id={hintId}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/** One choice of a few options that all show at once. */
export function RadioGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: ReactNode;
  value: Value;
  options: readonly {
    value: Value;
    label: ReactNode;
    hint?: ReactNode;
  }[];
  onChange: (value: Value) => void;
  disabled?: boolean | undefined;
}) {
  const name = useId();
  const labelId = `${name}-label`;
  return (
    <BaseRadioGroup
      className="ui-radio-group"
      render={<fieldset disabled={disabled} />}
      aria-labelledby={labelId}
      name={name}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <legend className="ui-field-label" id={labelId}>
        {label}
      </legend>
      {options.map((option, index) => (
        <label
          key={option.value}
          className="ui-check"
          data-checked={option.value === value ? "" : undefined}
          data-disabled={disabled ? "" : undefined}
        >
          <Radio.Root
            className="ui-radio-control"
            value={option.value}
            aria-labelledby={`${name}-${index}-label`}
            aria-describedby={option.hint ? `${name}-${index}-hint` : undefined}
          >
            <Radio.Indicator className="ui-radio-indicator" />
          </Radio.Root>
          <span>
            <span id={`${name}-${index}-label`}>{option.label}</span>
            {option.hint && (
              <span className="ui-check-hint" id={`${name}-${index}-hint`}>
                {option.hint}
              </span>
            )}
          </span>
        </label>
      ))}
    </BaseRadioGroup>
  );
}
