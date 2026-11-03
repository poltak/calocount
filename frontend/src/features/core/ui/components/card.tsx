import { Fragment, type ReactNode, type Ref } from "react";
import { cva } from "class-variance-authority";
import "./components.css";

const cardVariants = cva("ui-card", {
  variants: {
    tone: {
      default: "bg-card text-card-foreground",
      inset: "bg-inset text-foreground",
      raised: "bg-raised text-foreground",
    },
  },
  defaultVariants: { tone: "default" },
});

/**
 * A surface for one part of a page. Do not put a card in a card: inside a
 * card, use a `List` or a `SectionHeader` with `level={3}`.
 */
export function Card({
  as: Element = "section",
  padding = "md",
  tone = "default",
  label,
  id,
  stack = false,
  revealActions = false,
  children,
}: {
  /** Space between the parts of the card, such as a header, a notice, and a list. */
  stack?: boolean | undefined;
  /**
   * The actions of the card's header show only on hover or on focus, such as
   * an Add button. A screen with no hover shows them always.
   */
  revealActions?: boolean | undefined;
  /** `section` when the card has a heading, else `div`. */
  as?: "section" | "div" | "article" | undefined;
  /** `none` for a card that holds a table or a list from edge to edge. */
  padding?: "md" | "sm" | "none" | undefined;
  tone?: "default" | "inset" | "raised" | undefined;
  /** The accessible name of a section with no heading. */
  label?: string | undefined;
  id?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Element
      className={cardVariants({ tone })}
      data-slot="card"
      data-tone={tone}
      data-padding={padding}
      data-stack={stack ? "" : undefined}
      data-reveal-actions={revealActions ? "" : undefined}
      aria-label={label}
      id={id}
    >
      {children}
    </Element>
  );
}

/** A list of records with a line between them, or each in its own block. */
export function List({
  label,
  variant = "lines",
  grid = false,
  children,
}: {
  label?: string | undefined;
  /**
   * `blocks` puts each record on its own surface. In a card or in another
   * block, the surface takes the darker background by itself. `tinted` has
   * that background everywhere, with less padding.
   */
  variant?: "lines" | "blocks" | "tinted" | undefined;
  /** With `blocks`: as many columns of blocks as the width holds. */
  grid?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <ul
      className="ui-list"
      data-variant={variant}
      data-grid={grid ? "" : undefined}
      aria-label={label}
    >
      {children}
    </ul>
  );
}

/**
 * One record: its title with badges, its actions on the right, and its
 * details under it.
 */
export function ListItem({
  title,
  badges,
  badgesBelow = false,
  aside,
  actions,
  primaryAction,
  muted = false,
  revealActions = false,
  overlayActions = false,
  stretchLink = false,
  variant = "default",
  current = false,
  onSelect,
  expanded,
  ref,
  children,
}: {
  title: ReactNode;
  badges?: ReactNode;
  /**
   * The badges go in a row of their own under the title, as a narrow column
   * needs. By default they follow the title.
   */
  badgesBelow?: boolean | undefined;
  /**
   * A short fact on the right, such as the date of the latest note. With
   * `revealActions`, the actions take its place on hover.
   */
  aside?: ReactNode;
  /** Small buttons. */
  actions?: ReactNode;
  /** The main button of the record. `revealActions` does not hide it. */
  primaryAction?: ReactNode;
  /** A record that ended, such as a resolved task. */
  muted?: boolean | undefined;
  /**
   * The actions show only while the pointer is on the record or the keyboard
   * focus is in it. A screen with no hover, such as a tablet, always shows them.
   * Hidden actions take no width. A default record keeps its title on one line
   * and cuts it with an ellipsis when the actions need the space.
   */
  revealActions?: boolean | undefined;
  /**
   * On hover or on keyboard focus, the actions show over the top right corner
   * of the record, so the text keeps its full width. A screen with no hover
   * shows them always, in the row.
   */
  overlayActions?: boolean | undefined;
  /**
   * The link in the title covers the whole record, so a click anywhere on it
   * opens the link. The actions stay buttons of their own.
   */
  stretchLink?: boolean | undefined;
  /** `plain` has a title of normal weight, for a line of a log or a history. */
  variant?: "default" | "plain" | undefined;
  /** The record that the page shows now, such as the open thread. */
  current?: boolean | undefined;
  /** Makes the whole row a button that opens the record. */
  onSelect?: (() => void) | undefined;
  /** With `onSelect`: the select opens and closes the details of the record. */
  expanded?: boolean | undefined;
  /** Such as for a row that saves when the focus leaves it. */
  ref?: Ref<HTMLLIElement> | undefined;
  children?: ReactNode;
}) {
  const name = (
    <span
      className="ui-list-item-name"
      title={typeof title === "string" ? title : undefined}
    >
      {title}
    </span>
  );
  return (
    <li
      ref={ref}
      className="ui-list-item"
      data-muted={muted ? "" : undefined}
      data-reveal-actions={revealActions ? "" : undefined}
      data-overlay-actions={overlayActions ? "" : undefined}
      data-stretch-link={stretchLink ? "" : undefined}
      data-variant={variant}
      aria-current={current ? "true" : undefined}
      data-selectable={onSelect ? "" : undefined}
    >
      <div className="ui-list-item-head">
        <span className="ui-list-item-title">
          {onSelect ? (
            <button
              type="button"
              className="ui-list-item-select"
              aria-expanded={expanded}
              onClick={onSelect}
            >
              {name}
            </button>
          ) : (
            name
          )}
          {!badgesBelow && badges}
        </span>
        {(aside || actions) && (
          <span className="ui-list-item-side">
            {aside && <span className="ui-list-item-aside">{aside}</span>}
            {actions && <span className="ui-actions">{actions}</span>}
          </span>
        )}
        {primaryAction && (
          <span className="ui-list-item-primary">{primaryAction}</span>
        )}
      </div>
      {badgesBelow && badges && (
        <div className="ui-list-item-badges">{badges}</div>
      )}
      {children && <div className="ui-list-item-body">{children}</div>}
    </li>
  );
}

/** Pairs of a name and a value, such as the facts of a file. */
export function KeyValueList({
  items,
}: {
  items: readonly { key: string; label: ReactNode; value: ReactNode }[];
}) {
  return (
    <dl className="ui-key-values">
      {items.map((item) => (
        <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  /** `end` for numbers, so the digits line up. */
  align?: "start" | "end" | undefined;
  /** Bold, and red in a row of tone `danger`, such as the amount of an invoice. */
  emphasis?: boolean | undefined;
  /** Whether the cell shows only on hover and on focus, such as a row's Edit button. */
  revealOnHover?: ((row: Row) => boolean) | undefined;
  render: (row: Row) => ReactNode;
}

/** Rows with the same columns, such as the invoices of a month. */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  rowTone,
  expandedRow,
}: {
  /** The accessible name of the table. */
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** `danger` for a row that needs attention, such as an overdue invoice. */
  rowTone?: ((row: Row) => "danger" | undefined) | undefined;
  /** Content in a full-width row under a row, such as its edit form. */
  expandedRow?: ((row: Row) => ReactNode) | undefined;
}) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table" aria-label={caption}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" data-align={column.align}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expansion = expandedRow?.(row);
            return (
              <Fragment key={rowKey(row)}>
                <tr
                  data-tone={rowTone?.(row)}
                  data-expanded={expansion ? "" : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-align={column.align}
                      data-emphasis={column.emphasis ? "" : undefined}
                      data-reveal={column.revealOnHover?.(row) ? "" : undefined}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
                {expansion && (
                  <tr className="ui-table-expansion">
                    <td colSpan={columns.length}>{expansion}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
