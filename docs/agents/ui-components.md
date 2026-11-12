# UI components

Read this before you write or change UI in `frontend`. It lists the shared
components. Use them. Do not write a new button, tab, header, field, badge,
card, list, notice, or loading text with a class of your own.

Read [shadcn foundation](ui-shadcn.md) for new UI work. Its Base UI `base-mira`
layers and page rules take priority over the old component API below. The
controls, fields, containers, alerts, empty states, loading states, and app
sidebar use the generated shadcn parts. `Page`, `PageHeader`, and `AppLayout`
are WorldBrain parts in `core/`. `components/` is for project-specific parts.

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

Generated controls and containers keep the base-mira look without size or
color overrides. Cards use the shadcn card surface. Dialogs, tooltips, and
popovers use their generated surfaces, borders, and shadows.

## Component system

The shared controls use Base UI, Tailwind CSS 4, and `class-variance-authority`.
Base UI supplies control behavior and accessibility. Tailwind CSS 4 supplies
the utilities for `cva` variants. Lucide supplies the icons. These packages give
a project a complete accessible component set and light and dark themes.
Pages use the shadcn props directly. Import a generated part from its file in
`core/ui/shadcn/`. WorldBrain parts in `core/ui/core/` and project parts in
`core/ui/components/` keep only the props that callers need.

| To find or change                    | Look in                           |
| ------------------------------------ | --------------------------------- |
| Theme files and their token map      | [shadcn foundation](ui-shadcn.md) |
| A generated control and its variants | `core/ui/shadcn/`, read only      |
| A WorldBrain page or app frame       | `core/ui/core/`                   |
| A project-specific part              | `core/ui/components/`             |
| The live result of each component    | The `/components` page            |
| Base element styles and page layouts | `core/ui/app.css`                 |

`main.tsx` imports `app.css` first, because `theme.css` declares the order of
the CSS layers there. The theme uses the device color scheme unless
`data-theme` on `html` selects `light` or `dark`. It defines each color once
with `light-dark()`, so a component needs no dark variant for a token.
The imported rules are in the components layer, and Tailwind utilities can
override that layer. Tailwind Preflight loads in the base layer before the
WorldBrain base rules. Keep the layer order in `theme.css`.

Pages may use theme typography and text-color utilities on native text
elements. Do not use utilities or internal component classes to restyle
generated controls. Use their props or a registry fork for a different
appearance. Merge class names with `cn` from the `cn` package, so that the
last Tailwind class wins.

## Colors and surfaces

Each color has a role. Choose the token by its role, not by how it looks.

| Role                                    | Token                               |
| --------------------------------------- | ----------------------------------- |
| The page                                | `background`, `foreground`          |
| A standard panel                        | `card`, `card-foreground`           |
| A menu, a list of options, or a popover | `popover`, `popover-foreground`     |
| A tooltip                               | `foreground`, `background`          |
| Secondary text                          | `muted-foreground`                  |
| The sidebar                             | `sidebar`                           |
| A line between parts                    | `border`                            |
| The edge of a card or a block           | `border`                            |
| The edge of a control                   | `input`                             |
| The fill of a form control              | `input`, through the shadcn part    |
| The chosen item of a list               | `selected-fill`                     |
| A group of settings                     | Field parts on the card surface     |
| The edge of a popover                   | `border-popover`                    |
| A hover fill or a selected fill         | `accent`, `accent-foreground`       |
| A quiet fill                            | `muted`, `secondary`                |
| The primary action                      | `primary`, `primary-foreground`     |
| Focus                                   | `ring`                              |
| A status                                | `success`, `warning`, `destructive` |
| A search match                          | `accent`, `accent-foreground`       |

In Tailwind, these are `bg-card`, `text-muted-foreground`, `border-input`, and
so on. In CSS, they are `var(--card)`. The `--color-*` variables at the end of
the color list in `worldbrain.css` give the same roles a second name, such as
`--color-muted`. Note that `--color-muted` is a text
color, and `bg-muted` is a fill.

Do not put fixed neutral colors into a page. A status color means the same on
each surface.

Use one card surface for a section. Inside it, use `ItemGroup`, a heading,
space, or `ItemSeparator`, not another card. The old inset settings example
needs no separate recessed surface; it now uses the standard card. There are
no raised or nested-block container callers, so those variants are gone.
`Skeleton` uses its generated muted fill. Its caller sets the placeholder
shape, not a new fill or animation.

Check a surface change in the light theme and in the dark theme. The dark
surfaces are close to each other, so a border must keep the parts apart.

The theme applies the Contrast setting of T3 Code at 120%, in both themes.
Text moves 20% to black or white, and a line moves 5% to the text color. A
palette color goes in through `--foreground-base`, `--border`, or `--input`, not
around them. The dark `--card` is 40% of the T3 Chat surface over its canvas: at
the full surface, the color of a control border has no contrast.

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
  too when the task runs. Keep general task errors in an `Alert variant="destructive"` only when
  there are no field errors.
- A `Field` composes `FieldLabel`, the control, `FieldDescription` when
  needed, and `FieldError`. Give each control an `id`, connect its label with
  `htmlFor`, and use `aria-describedby` for its description and error.
  Pass each `<name>FieldErrors` message as the children of `FieldError`.
  Set `data-invalid` on the `Field` and `aria-invalid` on the control.
  A form title follows the page outline. Below the page `h1`, use an `h2`
  with theme utilities or a `CardTitle` that contains an `h2`.
- Use the tokens of `core/ui/theme.css` for each color, size, space, radius, and
  shadow. Do not write a literal value. When a value is missing, add a token.
  Define a new color for both themes.
- Each page is built from these components. `app.css` keeps only the body base
  styles and the sign-in panel position. `Page` owns the page width and padding.
  Each part sets its typography. Do not
  add a class there for a pattern that a component covers.
- Each interactive part works with the keyboard, shows the focus ring, and has
  a name that a screen reader can read.

## Components

| Component                                                                                                                                          | Use it for                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` from `shadcn/button`                                                                                                                      | An action. Use `variant="outline"` for a framed secondary action, `destructive` to remove something, and `ghost` for a quiet action.      |
| `ButtonGroup` from `shadcn/button-group`                                                                                                           | Related buttons that touch. Give the group an `aria-label`.                                                                               |
| `DropdownMenu` parts from `shadcn/dropdown-menu`                                                                                                   | A list of actions behind a `DropdownMenuTrigger` that renders a `Button`.                                                                 |
| `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` from `shadcn/dialog` | A modal question or short form. Keep `open` in its Logic and use `onOpenChange`.                                                          |
| `Tabs`, `TabsList`, `TabsTrigger` from `shadcn/tabs`                                                                                               | One choice of several. `TabsList` has `default` and `line` variants. Use `orientation="vertical"` for sidebar tabs.                       |
| `AppLayout`                                                                                                                                        | The frame of each signed-in page: the sidebar and the page beside it.                                                                     |
| `Page`                                                                                                                                             | The content column of a page. Use Tailwind flex or grid and allowed gap utilities inside it.                                              |
| `PageHeader` from `core/page-header`                                                                                                               | The one `h1` of a page, its optional subtitle, and its actions.                                                                           |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` from `shadcn/card`                                 | A section surface. Use native headings inside `CardTitle`; a title part alone is not a heading.                                           |
| `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `shadcn/collapsible`                                                                | A part that opens and closes. A trigger can render a `Button` with Lucide icon children.                                                  |
| `FieldSet`, `FieldLegend`, `FieldDescription`, `Field`, `FieldContent`, `FieldLabel` from `shadcn/field`                                           | Settings groups and horizontal control rows. Use `FieldTitle` for a read-only value and `Item` for a link row.                            |
| `Field`, `FieldLabel`, `FieldDescription`, `FieldError` from `shadcn/field`                                                                        | A labeled control, its help text, and its validation message.                                                                             |
| `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldContent`, `FieldSeparator` from `shadcn/field`                                                      | A set of fields, a named group, text beside a control, and a separator.                                                                   |
| `Input`, `Textarea` from `shadcn/input` and `shadcn/textarea`                                                                                      | Text controls. Use their native `onChange` event and compose them in a `Field`.                                                           |
| `InputGroup`, `InputGroupInput`, `InputGroupAddon` from `shadcn/input-group`                                                                       | A search field with a Lucide `SearchIcon` child in the addon.                                                                             |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `shadcn/select`                                                       | A choice from a short list. Pass `items`, `value`, and `onValueChange` to `Select`.                                                       |
| `Checkbox`, `Switch`, `RadioGroup`, `RadioGroupItem` from their `shadcn/` files                                                                    | A yes-or-no choice or one of a few choices. Compose labels and descriptions with `Field` parts.                                           |
| `Badge` from `shadcn/badge`                                                                                                                        | A short label or an item count. Use `default`, `secondary`, `outline`, or `destructive`.                                                  |
| `Alert`, `AlertTitle`, `AlertDescription` from `shadcn/alert`                                                                                      | An in-flow message with a Lucide icon child. Errors keep the alert role.                                                                  |
| `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` from `shadcn/empty`                                         | An empty list, its icon and explanation, and an optional action.                                                                          |
| `Spinner`, `Skeleton` from `shadcn/spinner` and `shadcn/skeleton`                                                                                  | Loading feedback. Put a hidden spinner in a named status output. Use skeleton shapes for a loading list.                                  |
| Native text elements                                                                                                                               | Apply theme utilities such as `text-sm`, `text-muted-foreground`, or `text-base leading-relaxed`. Use a native `mark` for search matches. |
| `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` from `shadcn/tooltip`                                                             | Short help on hover and keyboard focus. Render an icon-only `Button` in the trigger and name it.                                          |

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

Read [text and page layout](ui-text-layout.md) for message roles, settings
rows, and the app sidebar.

Do not put a card in a card. Inside a card, use `ItemGroup`, card header parts,
or a semantic heading with theme utilities.
Choose heading levels from the page outline, not from the card boundary.
Use level 2 below the page title. Use level 3 only below a level 2 heading.
Apply the same rule to form titles.

Use `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverHeader`,
`PopoverTitle`, and `PopoverDescription` from `shadcn/popover` for details
beside a trigger. No old popover component has callers. The gallery shows
the generated parts.

Wrap a named card in a native `section aria-label="…"` to keep its region
role. `Card` itself renders a `div`. Use a native `h2` inside `CardTitle`.
There are no global heading rules. Generated title styles and header gaps
control their appearance without added heading margins. No generated size is copied to the
page. Notes retain the complete title and body; their item title and
description remove the default line clamp. This is a content requirement,
not a size override.

The confirm example uses `Dialog`, because `alert-dialog` is not installed.
It keeps the dialog role, its name, initial focus on Close, focus containment,
and return focus to its trigger. Its content ref selects the generated Close
button for `initialFocus`; the generated file stays unchanged.

## Icons

Import Lucide icons directly, as `components.json` specifies. Pass them as
children. The gallery shows Lucide children. The old `Icon` component and
its name map are gone. Do not add another icon-name API.

## Choices

- Base UI gives the behavior and accessibility through the generated shadcn
  parts. A page never imports Base UI directly.
- Tailwind CSS 4 gives the utilities in `cva` variants. Use theme utilities
  for a composed part's layout.
- The theme follows the device color scheme. The template has no theme switch.
  A project that wants one sets `data-theme` on `html`, and keeps the choice in
  a Storage class.

The old component stylesheets and `SectionHeader` are gone. `components/`
has only a README that reserves the project layer. `Page` and `PageHeader`
set their layout with theme utilities. See [WorldBrain core parts](ui-shadcn.md#worldbrain-core-parts)
for their use and the blocked Markdown part.
Never edit a generated control to change its look. Use `ui-shadcn.md` to
choose between composition, a theme token, and a registry fork.
