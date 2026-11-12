import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useLogic } from "../../logic/use-logic.js";
import "./components.css";
import { Count } from "./badge.js";
import { IconButton } from "./button.js";
import { Icon, type IconName } from "./icon.js";
import { TabsScrollLogic } from "./tabs-scroll-logic.js";

/**
 * - `page`: the parts of a page, such as Overview and Activity.
 * - `segmented`: a filter or a view mode inside a section, such as Open
 *   and Closed, or Table and List.
 * - `pills`: links in a row.
 * - `sidebar`: the rows of the app's sidebar.
 */
export type TabsVariant = "page" | "segmented" | "pills" | "sidebar";

export type TabItem<Value extends string> = {
  value: Value;
  count?: number | undefined;
  /** How many of `count` a search finds. */
  found?: number | undefined;
  disabled?: boolean | undefined;
  /** Says why a disabled tab is disabled. */
  title?: string | undefined;
} & (
  | { label: ReactNode; icon?: IconName | undefined; iconLabel?: undefined }
  /** Only the icon shows. `iconLabel` is its accessible name and its tooltip. */
  | { label?: undefined; icon: IconName; iconLabel: string }
);

// A stable object: without React Compiler, a new object at each render would
// make a new Logic at each render.
const SCROLL_LOGIC_DEPS = { storage: {}, services: {}, api: {} };

/** The part of the visible width that one click on an arrow scrolls. */
const ARROW_SCROLL_SHARE = 0.75;

/**
 * One choice of several. The owner keeps the value: in the URL or in its Logic's state.
 */
export function Tabs<Value extends string>({
  label,
  items,
  value,
  onChange,
  variant = "page",
  fullWidth = false,
}: {
  /** The accessible name of the list, such as "Parts of the account page". */
  label: string;
  items: readonly TabItem<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  variant?: TabsVariant | undefined;
  /** The list fills its parent, and the tabs share the width. */
  fullWidth?: boolean | undefined;
}) {
  const { logic, state } = useLogic({
    LogicClass: TabsScrollLogic,
    deps: SCROLL_LOGIC_DEPS,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const scrollable = variant === "page";

  useEffect(() => {
    const list = listRef.current;
    if (!list || !scrollable) {
      return;
    }
    const measure = () => logic.measure(list);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    // A count that arrives makes a tab wider, and the list keeps its width.
    const observeTabs = () => {
      for (const tab of list.children) {
        observer.observe(tab);
      }
    };
    observeTabs();
    // A tab that arrives later does not resize the list, so it is not measured otherwise.
    const tabsObserver = new MutationObserver(() => {
      observeTabs();
      measure();
    });
    tabsObserver.observe(list, { childList: true });
    list.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      tabsObserver.disconnect();
      list.removeEventListener("scroll", measure);
    };
  }, [logic, scrollable]);

  const scrollByArrow = (direction: 1 | -1) => {
    const list = listRef.current;
    list?.scrollBy({ left: direction * list.clientWidth * ARROW_SCROLL_SHARE });
  };

  return (
    <BaseTabs.Root
      className="ui-tabs-root"
      data-slot="tabs"
      orientation={variant === "sidebar" ? "vertical" : "horizontal"}
      value={value}
      onValueChange={(nextValue) => {
        const next = items.find((item) => item.value === nextValue);
        if (next) {
          onChange(next.value);
        }
      }}
    >
      <div className="ui-tabs-scroll">
        <BaseTabs.List
          ref={listRef}
          className="ui-tabs"
          data-slot="tabs-list"
          data-variant={variant}
          data-full-width={fullWidth ? "" : undefined}
          aria-label={label}
          activateOnFocus
          loopFocus
        >
          {items.map((item) => (
            <BaseTabs.Tab
              key={item.value}
              value={item.value}
              className="ui-tab"
              data-slot="tabs-trigger"
              data-selected={item.value === value ? "" : undefined}
              disabled={item.disabled}
              title={item.title}
              aria-label={item.iconLabel}
              data-tooltip={item.iconLabel}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
              {item.count !== undefined && (
                <Count value={item.count} found={item.found} />
              )}
            </BaseTabs.Tab>
          ))}
        </BaseTabs.List>
        {scrollable && state.hiddenBefore && (
          <div className="ui-tabs-scroll-edge" data-side="start">
            <IconButton
              icon="chevron-left"
              label="Show earlier tabs"
              size="sm"
              onClick={() => scrollByArrow(-1)}
            />
          </div>
        )}
        {scrollable && state.hiddenAfter && (
          <div className="ui-tabs-scroll-edge" data-side="end">
            <IconButton
              icon="chevron-right"
              label="Show later tabs"
              size="sm"
              onClick={() => scrollByArrow(1)}
            />
          </div>
        )}
      </div>
    </BaseTabs.Root>
  );
}

/**
 * Tabs that go to pages of the app. The router sets `aria-current` on the
 * link of the current page, and that link looks selected.
 */
export type NavTabItem = {
  label: ReactNode;
  icon?: IconName | undefined;
  count?: number | undefined;
} & (
  | {
      to: string;
      /** A link that keeps the current page, so the router does not mark it. */
      plain?: boolean | undefined;
    }
  /** A button in the row, for an action that opens no page. */
  | { id: string; onSelect: () => void }
);

export function NavTabs({
  label,
  items,
  variant = "pills",
}: {
  label: string;
  items: readonly NavTabItem[];
  variant?: TabsVariant | undefined;
}) {
  return (
    <nav
      className="ui-tabs"
      data-slot="nav-tabs"
      data-variant={variant}
      aria-label={label}
    >
      {items.map((item) => {
        const content = (
          <>
            {item.icon && <Icon name={item.icon} />}
            {item.label}
            {item.count !== undefined && <Count value={item.count} />}
          </>
        );
        if ("onSelect" in item) {
          return (
            <button
              key={item.id}
              type="button"
              className="ui-tab"
              data-slot="nav-tab"
              onClick={item.onSelect}
            >
              {content}
            </button>
          );
        }
        const Anchor = item.plain ? Link : NavLink;
        return (
          <Anchor
            key={item.to}
            to={item.to}
            className="ui-tab"
            data-slot="nav-tab"
          >
            {content}
          </Anchor>
        );
      })}
    </nav>
  );
}
