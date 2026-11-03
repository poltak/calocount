import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Link } from "react-router";
import { cn } from "../../utils/class-names.js";
import "./components.css";
import { Icon, type IconName } from "./icon.js";

/**
 * - `primary`: the one main action of a form, a dialog, or a page.
 * - `secondary`: every other action. It is the default.
 * - `danger`: an action that removes or discards something.
 * - `danger-solid`: the confirm button of a dialog that removes something.
 * - `ghost`: a quiet action with no frame, such as "Show more".
 */
export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

/** `sm` in rows, headers, and toolbars. `md` in forms and page headers. */
export type ButtonSize = NonNullable<
  VariantProps<typeof buttonVariants>["size"]
>;

export const buttonVariants = cva(
  "ui-button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:shadow-none disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-64 aria-disabled:shadow-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground shadow-(--shadow-primary) hover:bg-primary/90",
        secondary:
          "border-input bg-control text-foreground shadow-(--shadow-soft) hover:bg-control-hover",
        danger:
          "border-input bg-control text-(--color-danger) shadow-(--shadow-soft) hover:border-destructive/30 hover:bg-destructive/10",
        "danger-solid":
          "border-destructive bg-destructive text-destructive-foreground shadow-(--shadow-danger) hover:bg-destructive/90",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      },
      size: {
        sm: "h-7 px-2 text-xs",
        md: "h-8 px-2.5",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export const iconButtonVariants = cva("ui-icon-button p-0", {
  variants: {
    size: {
      sm: "size-7",
      md: "size-8",
      inline:
        "size-auto min-h-0 border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-primary",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

interface ButtonLook {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  icon?: IconName | undefined;
  fullWidth?: boolean | undefined;
}

function lookProps({
  variant = "secondary",
  size = "md",
  fullWidth,
}: ButtonLook) {
  return {
    "data-variant": variant,
    "data-size": size,
    "data-full-width": fullWidth ? "" : undefined,
  };
}

/**
 * An action. While `busy`, it shows a spinner and `busyLabel`, and does not
 * take a click, so a Logic task cannot start twice.
 */
export function Button({
  variant,
  size,
  icon,
  fullWidth,
  busy = false,
  busyLabel,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonLook &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
    busy?: boolean | undefined;
    /** Such as "Saving…". Without it, the label stays. */
    busyLabel?: string | undefined;
    /** Such as for a dialog that focuses its confirm button. */
    ref?: Ref<HTMLButtonElement> | undefined;
    children: ReactNode;
  }) {
  return (
    <BaseButton
      {...rest}
      type={type}
      className={cn(buttonVariants({ variant, size, fullWidth }))}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...lookProps({ variant, size, fullWidth })}
    >
      {busy ? (
        <span className="ui-spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} />
      )}
      {busy && busyLabel ? busyLabel : children}
    </BaseButton>
  );
}

/**
 * A link that looks like a button. Use it when the action opens a page or a
 * file. `to` is a page of the app, and `href` is a file or another site.
 */
export function LinkButton({
  variant,
  size,
  icon,
  fullWidth,
  to,
  href,
  newTab = false,
  download,
  disabled = false,
  children,
}: ButtonLook & {
  children: ReactNode;
  disabled?: boolean | undefined;
  newTab?: boolean | undefined;
  /**
   * Save the file in place of opening it, such as a PDF that the server sends
   * inline. The value is the file name. Only for `href`.
   */
  download?: string | undefined;
} & ({ to: string; href?: undefined } | { href: string; to?: undefined })) {
  const props = {
    className: cn(buttonVariants({ variant, size, fullWidth })),
    disabled,
    nativeButton: false,
    role: "link",
    "aria-disabled": disabled || undefined,
    ...lookProps({ variant, size, fullWidth }),
    ...(newTab ? { target: "_blank", rel: "noreferrer" } : {}),
  };
  const content = (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {newTab && <Icon name="external" />}
    </>
  );
  return (
    <BaseButton
      {...props}
      render={
        to === undefined ? (
          <a href={href} download={download}>
            {content}
          </a>
        ) : (
          <Link to={to}>{content}</Link>
        )
      }
    />
  );
}

/**
 * A button that shows only an icon. `label` is its accessible name and its
 * tooltip.
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  shortcut,
  tip,
  ...rest
}: {
  icon: IconName;
  label: string;
  /** The key that does the same, such as "+". The tooltip shows it. */
  shortcut?: string | undefined;
  variant?: ButtonVariant | undefined;
  /** `inline` sits in a line of text, such as a label, with no box. */
  size?: ButtonSize | "inline" | undefined;
  /**
   * Show the tooltip at once, also on keyboard focus, in place of the
   * browser's late tooltip. Use it when the label is a help text to read.
   * The value is the side of the icon where the tooltip starts: a control on
   * the right of a row uses "end", so the tooltip stays on the screen.
   */
  tip?: "start" | "end" | undefined;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "className"
  | "style"
  | "children"
  | "aria-label"
  | "aria-keyshortcuts"
  | "title"
>) {
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <BaseButton
      type="button"
      {...rest}
      className={cn(
        buttonVariants({ variant, size: size === "inline" ? "sm" : size }),
        iconButtonVariants({ size }),
      )}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={tip ? undefined : tooltip}
      data-tip={tip}
      data-tooltip={tip ? tooltip : undefined}
      data-variant={variant}
      data-size={size}
    >
      <Icon name={icon} />
    </BaseButton>
  );
}
