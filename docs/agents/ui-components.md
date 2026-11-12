# UI components

Read this before you write or change UI in `frontend`. It lists the shared
components. Use them. Do not write a new button, tab, header, field, badge,
card, list, notice, or loading text with a class of your own.

Read [shadcn foundation](ui-shadcn.md) for new UI work. Its Base UI `base-mira`
layers and page rules take priority over the old component API below. The
buttons, badges, button groups, menus, tabs, and form fields use the generated shadcn parts.
The other parts in the component table still use the old component API.

The page `/components` in the app shows each component with its variants. The
page is available without sign-in. Its black box tests are in
`frontend/src/features/component-library/black-box-tests/`.

## Design direction

The UI is neutral, compact, and calm. Color carries meaning, and the content
gets the attention. The accent marks the primary action, the focus ring, and
links. Green, amber, and red are for status. The shell is a left sidebar with
neutral text and quiet surfaces. The light theme uses the colors of the T3 Code
theme, with a blue accent. The dark theme uses the dark colors of the T3 Chat
theme, with a magenta accent. A project that wants another palette changes the
values in `shadcn.css` and `worldbrain.css`, and no component.

Depth comes from small steps of background and thin soft lines, not from large
shadows. A card and a block have the faint `--shadow-soft` edge. Generated
controls keep the base-mira look without size or color overrides.
Only a popover and a dialog have a large shadow. A popover is translucent glass
over a blur, with `--popover-glass` and `--blur-popover`.

## Component system

The shared controls use Base UI, Tailwind CSS 4, and `class-variance-authority`.
Base UI supplies control behavior and accessibility. Tailwind CSS 4 supplies
the utilities for `cva` variants. Lucide supplies the icons. These packages give
a project a complete accessible component set and light and dark themes.
Pages use the shadcn props directly. Import a generated part from its file in
`core/ui/shadcn/`. Product parts in `core/ui/components/` keep their own props.

| To find or change                    | Look in                               |
| ------------------------------------ | ------------------------------------- |
| Theme files and their token map      | [shadcn foundation](ui-shadcn.md)     |
| A generated control and its variants | `core/ui/shadcn/`, read only          |
| The look of an old shared component  | `core/ui/components/components-*.css` |
| The live result of each component    | The `/components` page                |
| Base element styles and page layouts | `core/ui/app.css`                     |

`main.tsx` imports `app.css` first, because `theme.css` declares the order of
the CSS layers there. When `components.css` loads first, the base layer
overrides each component. The theme uses the device color scheme unless
`data-theme` on `html` selects `light` or `dark`. It defines each color once
with `light-dark()`, so a component needs no dark variant for a token.
The imported rules are in the components layer, and Tailwind utilities can
override that layer. Tailwind Preflight loads in the base layer before the
WorldBrain base rules. Keep the layer order in `theme.css`.

A page composes components. It does not use Tailwind utilities for color,
border, or type, and it does not use the `ui-*` classes of a component to
change its look. A style that a page needs goes into a prop or a variant of the
shared component. Merge class names with `cn` from `core/utils/class-names.ts`,
so that the last Tailwind class wins.

## Colors and surfaces

Each color has a role. Choose the token by its role, not by how it looks.

| Role                                    | Token                               |
| --------------------------------------- | ----------------------------------- |
| The page                                | `background`, `foreground`          |
| A standard panel                        | `card`, `card-foreground`           |
| A recessed area                         | `inset`                             |
| A raised area                           | `raised`                            |
| A menu, a list of options, or a tooltip | `popover`, `popover-foreground`     |
| Secondary text                          | `muted-foreground`                  |
| The sidebar                             | `sidebar`                           |
| A line between parts                    | `border`                            |
| The edge of a card or a block           | `border-soft`                       |
| The edge of a control                   | `input`                             |
| The fill of a form control              | `input`, through the shadcn part    |
| The chosen item of a list               | `selected-fill`                     |
| A group of settings                     | `setting-group`                     |
| The edge of a popover                   | `border-popover`                    |
| A hover fill or a selected fill         | `accent`, `accent-foreground`       |
| A quiet fill                            | `muted`, `secondary`                |
| The primary action                      | `primary`, `primary-foreground`     |
| Focus                                   | `ring`                              |
| A status                                | `success`, `warning`, `destructive` |
| A search match                          | `color-search-hit`                  |

In Tailwind, these are `bg-card`, `text-muted-foreground`, `border-input`, and
so on. In CSS, they are `var(--card)`. The `--color-*` variables at the end of
the color list in `worldbrain.css` give the same roles a second name, such as
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
  a `SectionHeader`, or a line. Choose its level from the page outline.
  Do not make each DOM nesting level a
  new color.

Check a surface change in the light theme and in the dark theme. The dark
surfaces are close to each other, so a border must keep the parts apart.

The theme applies the Contrast setting of T3 Code at 120%, in both themes.
Text moves 20% to black or white, and a line moves 5% to the text color. A
palette color goes in through `--foreground-base`, `--border`, or `--input`, not
around them. The dark `--card` is 40% of the T3 Chat surface over its canvas: at
the full surface, the color of a control border has no contrast. `--shadow-soft`
has no top highlight in the dark theme, because a highlight in the box reads as
a thicker top border.

## Rules

- Import each component from its defining file. There is no index file.
- Find parts and choose their layer in the order in `ui-shadcn.md`. Show a new
  product part on `/components` and add it to the table in the same change.
- The components show state. A component gets its values and callbacks from the
  page, and the page gets them from its UI Logic.
- No component uses `useState`. All state goes in a UI Logic. A reusable
  component with product state gets a small Logic of its own with `useLogic`.
- The frontend has no React Compiler, so `useLogic` needs a `deps` object that
  stays the same between renders. A page makes it with `useMemo`. A component
  with no changing input uses a constant at module level.
- A busy shadcn `Button` uses `disabled`, `aria-busy`, and a `Spinner` child.
  Use the task's busy label when it has one. A form composes these parts
  directly. Do not add a wrapper that only renames the shadcn props.
- Use a plain `form` with a `FieldGroup` inside. The submit handler calls
  `preventDefault()` before the Logic method. Put the action buttons in
  `Field orientation="horizontal"`. A cancel button has `type="button"`.
  Disable the submit button and fields while the task runs. Disable Cancel
  too when the task runs. Keep general task errors in a `Notice` only when
  there are no field errors.
- A `Field` composes `FieldLabel`, the control, `FieldDescription` when
  needed, and `FieldError`. Give each control an `id`, connect its label with
  `htmlFor`, and use `aria-describedby` for its description and error.
  Pass each `<name>FieldErrors` message as the children of `FieldError`.
  Set `data-invalid` on the `Field` and `aria-invalid` on the control.
  A form title follows the page outline. Below the page `h1`, use a
  `SectionHeader` with its default `h2`, not a fixed `h3`.
- Use the tokens of `core/ui/theme.css` for each color, size, space, radius, and
  shadow. Do not write a literal value. When a value is missing, add a token.
  Define a new color for both themes.
- Each page is built from these components. `app.css` keeps only the base
  element styles and the layout of a few parts that no component covers. Do not
  add a class there for a pattern that a component covers.
- Each interactive part works with the keyboard, shows the focus ring, and has
  a name that a screen reader can read.

## Components

| Component                                                                                     | Use it for                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Button` from `shadcn/button`                                                                 | An action. Use `variant="outline"` for a framed secondary action, `destructive` to remove something, and `ghost` for a quiet action. |
| `ButtonGroup` from `shadcn/button-group`                                                      | Related buttons that touch. Give the group an `aria-label`.                                                                          |
| `DropdownMenu` parts from `shadcn/dropdown-menu`                                              | A list of actions behind a `DropdownMenuTrigger` that renders a `Button`.                                                            |
| `Dialog`                                                                                      | A modal question or a short form. The owner keeps `open` in its Logic.                                                               |
| `Tabs`, `TabsList`, `TabsTrigger` from `shadcn/tabs`                                          | One choice of several. `TabsList` has `default` and `line` variants. Use `orientation="vertical"` for sidebar tabs.                  |
| `AppLayout`                                                                                   | The frame of each signed-in page: the sidebar and the page beside it.                                                                |
| `Page`, `Columns`, `Stack`, `Actions`, `Toolbar`                                              | Layout: the parts of a page, two columns, spaced parts, a row of buttons, a row of controls.                                         |
| `PageHeader`, `SectionHeader`                                                                 | The one `h1` of a page, and the title of each section with its tools.                                                                |
| `Card`, `List`, `ListItem`                                                                    | A surface, and a list of records with a title, badges, actions, and details.                                                         |
| `KeyValueList`, `DataTable`                                                                   | Facts as pairs, and rows with the same columns.                                                                                      |
| `Disclosure`                                                                                  | A part that opens and closes.                                                                                                        |
| `SettingGroup`, `SettingRow`                                                                  | A settings screen: groups of rows with a name, a meaning, and a control.                                                             |
| `Field`, `FieldLabel`, `FieldDescription`, `FieldError` from `shadcn/field`                   | A labeled control, its help text, and its validation message.                                                                        |
| `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldContent`, `FieldSeparator` from `shadcn/field` | A set of fields, a named group, text beside a control, and a separator.                                                              |
| `Input`, `Textarea` from `shadcn/input` and `shadcn/textarea`                                 | Text controls. Use their native `onChange` event and compose them in a `Field`.                                                      |
| `InputGroup`, `InputGroupInput`, `InputGroupAddon` from `shadcn/input-group`                  | A search field with a Lucide `SearchIcon` child in the addon.                                                                        |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `shadcn/select`  | A choice from a short list. Pass `items`, `value`, and `onValueChange` to `Select`.                                                  |
| `Checkbox`, `Switch`, `RadioGroup`, `RadioGroupItem` from their `shadcn/` files               | A yes-or-no choice or one of a few choices. Compose labels and descriptions with `Field` parts.                                      |
| `Badge` from `shadcn/badge`                                                                   | A short label or an item count. Use `default`, `secondary`, `outline`, or `destructive`.                                             |
| `Notice`, `EmptyState`, `Loading`                                                             | A message in the flow, what a list shows when it is empty, and what shows while data loads.                                          |
| `Text`, `Highlight`                                                                           | Text with a role of the type scale, and the matches of a search in a mark.                                                           |
| `InfoTip`                                                                                     | An "i" icon with a short help text on hover and on focus.                                                                            |
| `Icon`                                                                                        | A line icon by name. `ICONS` in `icon.tsx` gives each name its one meaning.                                                          |

Use `Button` with `nativeButton={false}` and its `render` callback for
a router link that looks like a button. The callback drops the generated
button role and returns `<Link {...props} to="…" />`, so the anchor keeps its
link role. Use an anchor in `render` for a site
or file. An icon-only button uses `size="icon"`, `icon-sm`, or `icon-xs`, an
`aria-label`, and a Lucide icon child. Do not add an icon-name prop.

Navigation links render router links in `TabsTrigger` with `nativeButton={false}`
and `aria-selected={undefined}`. Its render callback drops the generated tab
role, as for button links. Their `TabsList` uses
`role="presentation"`; the surrounding `nav` supplies the accessible name.
This keeps link semantics while shadcn supplies the look. The router controls
the selected value and `aria-current`.
`AppLayout` takes composed navigation children, not an item list.

`Notice` tones are `info`, `warning`, `error`, and `success`. An error is
announced at once.

Do not put a card in a card. Inside a card, use a `List` or a `SectionHeader`.
Choose heading levels from the page outline, not from the card boundary.
Use level 2 below the page title. Use level 3 only below a level 2 heading.
Apply the same rule to form titles.

## Icons

New UI imports Lucide icons directly, as `components.json` specifies. Pass
them as children. The old `Icon` component and its `ICONS` map remain only
until the page migration. Do not extend them.

## Choices

- Base UI gives the behavior and accessibility through the generated shadcn
  parts. A page never imports Base UI directly.
- Tailwind CSS 4 gives the utilities in `cva` variants. The CSS of a component
  that variants cannot say is in `components.css`, in the components layer.
- The theme follows the device color scheme. The template has no theme switch.
  A project that wants one sets `data-theme` on `html`, and keeps the choice in
  a Storage class.

`components.css` imports the rules in their cascade order.
`components-base.css` holds old icons, loading states, headers, text, and notices.
`components-forms.css` holds page layouts, the app shell, and settings.
`components-layout.css` holds cards, lists, tables, disclosures, and dialogs.
Never edit a generated control to change its look. Use `ui-shadcn.md` to
choose between composition, a theme token, and a registry fork.
