# UI components

Read this before you write or change UI in `frontend`. It lists the shared
components. Use them. Do not write a new button, tab, header, field, badge,
card, list, notice, or loading text with a class of your own.

The page `/components` in the app shows each component with its variants. The
sidebar links to it. Its black box tests are in
`frontend/src/features/component-library/black-box-tests/`.

## Design direction

The UI is neutral, compact, and calm. Color carries meaning, and the content
gets the attention. The accent marks the primary action, the focus ring, and
links. Green, amber, and red are for status. The shell is a left sidebar with
neutral text and quiet surfaces. The light theme uses the colors of the T3 Code
theme, with a blue accent. The dark theme uses the dark colors of the T3 Chat
theme, with a magenta accent. A project that wants another palette changes the
values in `theme.css`, and no component.

Depth comes from small steps of background and thin soft lines, not from large
shadows. A card, a block, and a control have the faint `--shadow-soft` edge.
Only a popover and a dialog have a large shadow. A popover is translucent glass
over a blur, with `--popover-glass` and `--blur-popover`.

## Component system

The shared controls use Base UI, Tailwind CSS 4, and `class-variance-authority`.
Lucide supplies the icons. A page imports from the shared component files, not
directly from Base UI or Lucide.

| To find or change                         | Look in                             |
| ----------------------------------------- | ----------------------------------- |
| Colors, sizes, spaces, radii, and shadows | `core/ui/theme.css`                 |
| The look of a shared component            | `core/ui/components/components.css` |
| The variants of a shared component        | The `cva` call in its `.tsx` file   |
| The live result of each component         | The `/components` page              |
| Base element styles and page layouts      | `core/ui/app.css`                   |

`main.tsx` imports `app.css` first, because `theme.css` declares the order of
the CSS layers there. When `components.css` loads first, the base layer
overrides each component. `theme.css` uses the device color scheme unless
`data-theme` on `html` selects `light` or `dark`. It defines each color once
with `light-dark()`, so a component needs no dark variant for a token.
`components.css` is in the components layer, and Tailwind utilities can
override that layer. Preflight is not loaded.

A page composes components. It does not use Tailwind utilities for color,
border, or type, and it does not use the `ui-*` classes of a component to
change its look. A style that a page needs goes into a prop or a variant of the
shared component. Merge class names with `cn` from `core/utils/class-names.ts`,
so that the last Tailwind class wins.

## Colors and surfaces

Each color has a role. Choose the token by its role, not by how it looks.

| Role                                    | Token                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The page                                | `background`, `foreground`                                                                           |
| A standard panel                        | `card`, `card-foreground`                                                                            |
| A recessed area                         | `inset`                                                                                              |
| A raised area                           | `raised`                                                                                             |
| A menu, a list of options, or a tooltip | `popover`, `popover-foreground`                                                                      |
| Secondary text                          | `muted-foreground`                                                                                   |
| The sidebar and its rows                | `sidebar`, `sidebar-row-foreground`, `sidebar-row-icon`, `sidebar-row-hover`, `sidebar-row-selected` |
| A line between parts                    | `border`                                                                                             |
| The edge of a card or a block           | `border-soft`                                                                                        |
| The edge of a control                   | `input`                                                                                              |
| The fill of a button or a field         | `control`, `control-hover`                                                                           |
| The chosen item of a list               | `selected-fill`                                                                                      |
| A group of settings                     | `setting-group`                                                                                      |
| The edge of a popover                   | `border-popover`                                                                                     |
| A hover fill or a selected fill         | `accent`, `accent-foreground`                                                                        |
| A quiet fill                            | `muted`, `secondary`                                                                                 |
| The primary action                      | `primary`, `primary-foreground`                                                                      |
| Focus                                   | `ring`                                                                                               |
| A status                                | `success`, `warning`, `destructive`                                                                  |
| A search match                          | `color-search-hit`                                                                                   |

In Tailwind, these are `bg-card`, `text-muted-foreground`, `border-input`, and
so on. In CSS, they are `var(--card)`. The `--color-*` variables at the end of
the color list in `theme.css` give the same roles a second name, such as
`--color-alert` and `--color-danger-soft`. Note that `--color-muted` is a text
color, and `bg-muted` is a fill.

Do not put fixed neutral colors into a page. A status color means the same on
each surface.

A nested structure uses the surface steps, not a new color for each level:

- Use `Card tone="inset"` for a recessed area and `tone="raised"` for a raised
  area. The default is the standard panel. A card has a border, so it stays
  clear of the page in both themes.
- `List variant="blocks"` inside a card takes `--nested-block-background`. Each
  surface that can contain blocks sets that variable, so a block is always
  different from its parent. A new surface of this kind sets it too.
- Two levels of surface are enough. For one more level of structure, use space,
  a `SectionHeader level={3}`, or a line. Do not make each DOM nesting level a
  new color.

Check a surface change in the light theme and in the dark theme. The dark
surfaces are close to each other, so a border must keep the parts apart.

`theme.css` applies the Contrast setting of T3 Code at 120%, in both themes.
Text moves 20% to black or white, and a line moves 5% to the text color. A
palette color goes in through `--foreground-base`, `--border`, or `--input`, not
around them. The dark `--card` is 40% of the T3 Chat surface over its canvas: at
the full surface, the color of a control border has no contrast. `--shadow-soft`
has no top highlight in the dark theme, because a highlight in the box reads as
a thicker top border.

## Rules

- Import each component from its file in
  `frontend/src/features/core/ui/components/`. There is no index file.
- When no component fits, first look for a prop or a variant that makes one
  fit. When none does, add the component or the variant in that folder, show it
  on the `/components` page, and add it to the table below in the same change.
- The components show state. A component gets its values and callbacks from the
  page, and the page gets them from its UI Logic.
- No component uses `useState`. All state goes in a UI Logic. A reusable
  component gets a small Logic of its own with `useLogic`, as `Tabs` does.
- The frontend has no React Compiler, so `useLogic` needs a `deps` object that
  stays the same between renders. A page makes it with `useMemo`. A component
  with no changing input uses a constant at module level.
- Pass a Logic task's state to the component: `busy={state.saveState ===
"running"}`, and the task's `<name>FieldErrors` to the `error` of each field.
- Use the tokens of `core/ui/theme.css` for each color, size, space, radius, and
  shadow. Do not write a literal value. When a value is missing, add a token.
  Define a new color for both themes.
- Each page is built from these components. `app.css` keeps only the base
  element styles and the layout of a few parts that no component covers. Do not
  add a class there for a pattern that a component covers.
- Each interactive part works with the keyboard, shows the focus ring, and has
  a name that a screen reader can read.

## Components

| Component                                        | Use it for                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `Button`, `LinkButton`, `IconButton`             | An action. `busy` shows a spinner and stops a second click. `LinkButton` opens a page or file. |
| `ButtonGroup`                                    | Related buttons that touch. It needs a label.                                                  |
| `Menu`                                           | A list of actions behind one button.                                                           |
| `Dialog`                                         | A modal question or a short form. The owner keeps `open` in its Logic.                         |
| `Tabs`, `NavTabs`                                | One choice of several, or links to pages. Variants: `page`, `segmented`, `pills`, `sidebar`.   |
| `AppLayout`                                      | The frame of each signed-in page: the sidebar and the page beside it.                          |
| `Page`, `Columns`, `Stack`, `Actions`, `Toolbar` | Layout: the parts of a page, two columns, spaced parts, a row of buttons, a row of controls.   |
| `PageHeader`, `SectionHeader`                    | The one `h1` of a page, and the title of each section with its tools.                          |
| `Card`, `List`, `ListItem`                       | A surface, and a list of records with a title, badges, actions, and details.                   |
| `KeyValueList`, `DataTable`                      | Facts as pairs, and rows with the same columns.                                                |
| `Disclosure`                                     | A part that opens and closes.                                                                  |
| `SettingGroup`, `SettingRow`                     | A settings screen: groups of rows with a name, a meaning, and a control.                       |
| `Form`, `FormRow`, `FormActions`                 | A form with its rows and its submit and cancel buttons.                                        |
| `TextInput`, `TextArea`, `SearchInput`           | Text fields with a label, a hint, and an error.                                                |
| `Select`, `Checkbox`, `RadioGroup`, `FieldGroup` | A choice from a short list, a yes-or-no choice, one of a few options, and a group of fields.   |
| `Badge`, `Count`                                 | A short label for a state or a kind, and a number of items.                                    |
| `Notice`, `EmptyState`, `Loading`                | A message in the flow, what a list shows when it is empty, and what shows while data loads.    |
| `Text`, `Highlight`                              | Text with a role of the type scale, and the matches of a search in a mark.                     |
| `InfoTip`                                        | An "i" icon with a short help text on hover and on focus.                                      |
| `Icon`                                           | A line icon by name. `ICONS` in `icon.tsx` gives each name its one meaning.                    |

`Badge` tones: `neutral` for a kind, `info` for a state that waits, `success`
for a good state, `warning` for a state that needs a look, `danger` for a bad
state. `Notice` tones: `info`, `warning`, `error` (announced at once), and
`success`.

Do not put a card in a card. Inside a card, use a `List` or a `SectionHeader`
with `level={3}`.

## Icons

Each icon has a name and one meaning in `ICONS`. A new icon gets a name and a
meaning there. The `/components` page lists them all.

## Choices

- Base UI gives the behavior and the accessibility of each control. The
  components keep their own props, so a page does not depend on Base UI.
- Tailwind CSS 4 gives the utilities in `cva` variants. The CSS of a component
  that variants cannot say is in `components.css`, in the components layer.
- The theme follows the device color scheme. The template has no theme switch.
  A project that wants one sets `data-theme` on `html`, and keeps the choice in
  a Storage class.
