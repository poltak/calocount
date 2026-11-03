import { Menu as BaseMenu } from "@base-ui/react/menu";
import "./components.css";
import { Icon, type IconName } from "./icon.js";
import { cn } from "../../utils/class-names.js";
import {
  buttonVariants,
  iconButtonVariants,
  type ButtonSize,
  type ButtonVariant,
} from "./button.js";

export type MenuItem = {
  key: string;
  label: string;
  disabled?: boolean | undefined;
  /** An item that removes or discards something. */
  danger?: boolean | undefined;
  /**
   * Set on each item of a menu that picks one choice, such as a sort order.
   * The chosen item shows a check.
   */
  checked?: boolean | undefined;
} & (
  | { onSelect: () => void; newTabHref?: undefined }
  | { newTabHref: string; onSelect?: undefined }
);

/**
 * A click outside and Escape close the menu without selecting an action.
 */
export function Menu({
  label,
  icon,
  align = "start",
  items,
  variant = "secondary",
  size = "md",
  disabled = false,
}: {
  label: string;
  /** Shows only this icon on the button. `label` is its name and tooltip. */
  icon?: IconName | undefined;
  /** The edge of the button that the list lines up with. */
  align?: "start" | "end" | undefined;
  /** Such as while the action that the menu starts runs. */
  disabled?: boolean | undefined;
  items: readonly MenuItem[];
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
}) {
  const checkedValue = items.find((item) => item.checked)?.key ?? null;
  return (
    <BaseMenu.Root modal={false}>
      <BaseMenu.Trigger
        className={cn(
          buttonVariants({ variant, size }),
          icon && iconButtonVariants({ size }),
        )}
        aria-label={icon && label}
        title={icon && label}
        data-slot="menu-trigger"
        data-variant={variant}
        data-size={size}
        disabled={disabled}
      >
        {icon ? (
          <Icon name={icon} />
        ) : (
          <>
            {label}
            <Icon name="chevron-down" />
          </>
        )}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className="ui-menu-positioner"
          data-slot="menu-positioner"
          align={align}
        >
          <BaseMenu.Popup
            className="ui-menu-items"
            data-slot="menu-content"
            aria-label={label}
          >
            <BaseMenu.RadioGroup
              value={checkedValue}
              className="ui-menu-group"
              data-slot="menu-radio-group"
            >
              {items.map((item) =>
                item.newTabHref !== undefined ? (
                  <BaseMenu.LinkItem
                    key={item.key}
                    href={item.newTabHref}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-menu-item"
                    data-slot="menu-link-item"
                    label={item.label}
                    closeOnClick
                  >
                    {item.label}
                    <Icon name="external" />
                  </BaseMenu.LinkItem>
                ) : item.checked === undefined ? (
                  <BaseMenu.Item
                    key={item.key}
                    render={<button type="button" aria-label={item.label} />}
                    nativeButton
                    className="ui-menu-item"
                    data-slot="menu-item"
                    data-danger={item.danger ? "" : undefined}
                    disabled={item.disabled}
                    label={item.label}
                    onClick={item.onSelect}
                  >
                    {item.label}
                  </BaseMenu.Item>
                ) : (
                  <BaseMenu.RadioItem
                    key={item.key}
                    value={item.key}
                    render={<button type="button" aria-label={item.label} />}
                    nativeButton
                    className="ui-menu-item"
                    data-slot="menu-radio-item"
                    data-danger={item.danger ? "" : undefined}
                    disabled={item.disabled}
                    label={item.label}
                    closeOnClick
                    onClick={item.onSelect}
                  >
                    <Icon name="check" />
                    {item.label}
                  </BaseMenu.RadioItem>
                ),
              )}
            </BaseMenu.RadioGroup>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
