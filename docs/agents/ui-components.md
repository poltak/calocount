# UI components

Use shadcn on Base UI, with `base-mira` as shadcn ships it. Do not change
its sizes. Do not use Radix or another registry as a component library.
The exact CLI version is in the root `package.json`. Configuration is in
`frontend/components.json`. The public `/components` page shows the installed
parts and product compositions.

## Layers and component choice

These paths start at `frontend/src/features/core/ui/`:

- `shadcn/` contains CLI output. Never edit it by hand. `check:shadcn`
  generates each installed part again and compares its bytes.
- `core/` contains the WorldBrain parts that each project gets.
- `components/` contains project parts. The template keeps only its README.
- `registry/` contains forks and new Base UI controls. It is empty today.

Find a part in this order: a shadcn component, a shadcn block, a WorldBrain
core part, a project part, then a feature-local part. Read the
[base-mira registry](https://ui.shadcn.com/r/styles/base-mira/registry.json)
and `https://ui.shadcn.com/r/styles/base-mira/<name>.json`. Check the package
requirements before installation. New packages need the person's approval.

To add a component in a project, run
`pnpm --filter frontend exec shadcn add <name>`. Add its registry name to
`scripts/shadcn-components.project.json`. A template sync keeps this list.
`check:shadcn` generates the union of this list and
`scripts/shadcn-components.json`, then checks the whole `shadcn/` directory.
Only the template's files in that directory are template-owned. When the
template adds a generated file, list its path in `templateOwned` in
`scripts/template-paths.json`.

For product behavior, compose shadcn parts in `core/` or `components/`.
Fork a different look into `registry/`. Before writing a control that shadcn
lacks, find its Base UI behavior. A segmented control uses ToggleGroup.
Use `cva`, `data-slot`, theme variables, and shadcn parts for that control.
Do not copy size classes from generated parts. Product components also use
shadcn parts and theme variables. Import each part from its defining file.

## WorldBrain core parts

- `Page`, in `core/page.tsx`, owns the page width, padding, and block gap. It uses the sidebar inset width when signed in; `variant="notice"` omits bottom padding.
- `PageHeader`, in `core/page-header.tsx`, supplies the one `h1`, an optional `subtitle`, and optional `actions` through card header parts.
- `AppLayout`, in `core/app-layout.tsx`, composes the `sidebar-07` frame, account actions, shell notice, and phone navigation sheet.

`Markdown` is not installed. It needs approval for `react-markdown` and
`remark-gfm`. Do not add a substitute parser.

## Theme files

- `shadcn.css` contains the shadcn variables, imports, and dark variant.
  `shadcn apply` may rewrite it. Use the CLI for preset changes.
- `worldbrain.css` contains the system font, heading line heights, content
  widths, contrast inputs, and base rules that the generated theme needs.
  Change it for a template-wide role that shadcn does not supply.
- `project.css` contains project tokens and rules. A template sync leaves
  it unchanged. Use it for project-only additions.
- `theme.css` imports these files in that order and sets the layers to
  `theme, base, components, utilities`. Keep this order. Preflight is on.
- `app.css` imports `theme.css` and positions the auth panel. `main.tsx`
  imports it before feature styles.

Use shadcn role variables, such as `background`, `foreground`, `card`,
`muted-foreground`, `border`, and `ring`, not fixed colors. Use `cn` from
the `cn` package to merge classes. Do not add a second name for an existing
shadcn variable. Add a new color in both themes only when no role fits.
The theme follows the device scheme; `data-theme="light"` or `"dark"` on
`html` overrides it. Keep both paths working.

The live composition starts `BrowserColorSchemeService` before React renders.
It keeps the `dark` class on `html` in step with the device preference and the
`data-theme` override. A preset writes its dark variables under `.dark`.
The Tailwind dark variant alone does not select those variables. Do not copy
the preset palette into `worldbrain.css` to compensate for a missing class.

## Page rules

- Use shadcn props directly. Pages do not import `@base-ui/react` or its
  subpaths. Do not add wrappers that only rename props.
- Use `Page` once around a page. Auth routes already supply it. Use flex or
  grid utilities for inner layout. Do not use fixed values in brackets.
  For gap, space, and padding, use only `0`, `0.5`, `1`, `1.5`, `2`, `2.5`,
  `3`, `3.5`, `4`, `6`, or `8`.
- Keep one `h1`. Use `h2` below it, then `h3` only below `h2`. Sibling pages
  use the same title size, weight, content edge, and equivalent gaps.
  Use theme utilities on native text, not to restyle generated controls.
- Do not set font size or line height on an imported shadcn part. This also
  applies in core compositions. `PageHeader` uses native page text for its
  subtitle, which inherits the document font size and line height. It does
  not restyle a card description. The `stack/shadcn-typography` lint rule checks static
  JSX classes, including conditional classes and templates. The native page
  heading and page layout keep the WorldBrain page pattern.
- When a task requires an unchanged base style, preserve its existing
  typography and layout. If generated component defaults differ, obtain
  approval before changing the appearance.
- Do not put a card in a card. Use item parts, headings, space, or a line
  inside it. Wrap a named card in `section aria-label="…"` for a region.
  Use a semantic heading inside `CardTitle`.
- Keep product state in UI Logic. Shared generated controls own only their
  internal behavior. Read [code architecture](code-architecture.md) for state
  and `useLogic` dependencies.
- Use a native form with `FieldGroup`. Prevent default submission before
  calling Logic. Connect control IDs, labels, descriptions, and field errors.
  Mark an invalid field and its control. Disable fields, Submit, and Cancel
  while busy; Cancel has `type="button"`. Keep the general error only when
  no field error exists. A busy button uses `disabled`, `aria-busy`, and a
  `Spinner` child.
- Errors use `Alert variant="destructive"`. A polite message uses native
  `output` around `Alert role="presentation"`, without a second live region.
  Give loading feedback a named status output and each empty list an empty
  state. Settings use field parts; read-only values use `FieldTitle` rather
  than a label with no control.
- Preserve link semantics with shadcn render callbacks. A router-link button
  sets `nativeButton={false}` and drops the supplied button role. Navigation
  tabs also drop the tab role and `aria-selected`; their list uses
  `role="presentation"` inside a named `nav`. The router sets `aria-current`
  and matching. Preserve destinations, targets, download behavior, and icons.
- Import Lucide icons directly, as `iconLibrary` in `components.json` sets.
  Pass icons as children. Icon-only controls need an accessible name.
  `simple-icons` is for brand logos only. Each interactive part must work
  with the keyboard and show focus. Phone navigation closes after a link or
  sign-out; Escape returns focus to its trigger.

## shadcn references

Use these docs for component props, variants, and behavior:

- [Button](https://ui.shadcn.com/docs/components/base/button), [ButtonGroup](https://ui.shadcn.com/docs/components/base/button-group), [Badge](https://ui.shadcn.com/docs/components/base/badge), [DropdownMenu](https://ui.shadcn.com/docs/components/base/dropdown-menu), [Tabs](https://ui.shadcn.com/docs/components/base/tabs), [Toast](https://ui.shadcn.com/docs/components/base/toast).
- [Input](https://ui.shadcn.com/docs/components/base/input), [Textarea](https://ui.shadcn.com/docs/components/base/textarea), [InputGroup](https://ui.shadcn.com/docs/components/base/input-group), [Select](https://ui.shadcn.com/docs/components/base/select), [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox), [Switch](https://ui.shadcn.com/docs/components/base/switch), [RadioGroup](https://ui.shadcn.com/docs/components/base/radio-group), [Combobox](https://ui.shadcn.com/docs/components/base/combobox), [Field](https://ui.shadcn.com/docs/components/base/field), [Label](https://ui.shadcn.com/docs/components/base/label).
- [Card](https://ui.shadcn.com/docs/components/base/card), [Item](https://ui.shadcn.com/docs/components/base/item), [Table](https://ui.shadcn.com/docs/components/base/table), [Separator](https://ui.shadcn.com/docs/components/base/separator), [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar).
- [Dialog](https://ui.shadcn.com/docs/components/base/dialog), [Popover](https://ui.shadcn.com/docs/components/base/popover), [Collapsible](https://ui.shadcn.com/docs/components/base/collapsible), [Sheet](https://ui.shadcn.com/docs/components/base/sheet), [Tooltip](https://ui.shadcn.com/docs/components/base/tooltip).
- [Alert](https://ui.shadcn.com/docs/components/base/alert), [Empty](https://ui.shadcn.com/docs/components/base/empty), [Spinner](https://ui.shadcn.com/docs/components/base/spinner), [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton).

## CLI and template registry

Run these commands from the repository root:

```sh
pnpm exec shadcn add --cwd frontend <component>
pnpm exec shadcn apply --cwd frontend --preset <code>
pnpm exec shadcn migrate icons "frontend/src/**" --cwd frontend --from lucide --to <library>
pnpm run check:shadcn
pnpm run check:registry
```

After adding a shadcn part, add its name to `scripts/shadcn-components.json`.
The byte check uses the live registry and the pinned CLI. Do not install the
named `mira` preset's font or Hugeicons packages without approval. Read the
[CLI](https://ui.shadcn.com/docs/cli) and
[configuration](https://ui.shadcn.com/docs/components-json) docs for options.

The named `vega` preset also requests `@fontsource-variable/inter`. For a
proof without new packages, use a registry preset with `font-inter` removed
from `registryDependencies`, and keep the installed CLI version in its
dependencies. Keep that experiment off the fixes branch. Icon migration has
no dry-run option in CLI 4.23.0. A Tabler migration needs approval to install
`@tabler/icons-react` first. Do not run it while that package is absent.

The root `registry.json` lists each `core/` and `registry/` part in the
[shadcn registry format](https://ui.shadcn.com/docs/registry). Add each new
part there. Its targets use the template's `components.json` aliases and
require the WorldBrain theme. AppLayout includes Page so it needs no hosted
WorldBrain dependency. `check:registry` runs the pinned `shadcn build` and
writes `.cache/registry/`. Git ignores this output because it only validates
the local registry; the template does not publish it. Both `check` and
`ci:checks` run it. The script test also checks source coverage and built bytes.

After a UI or preset change, use the
[UI design skill](../../.agents/skills/ui-design/SKILL.md). It includes the
checks and a fresh [UI review](../../.agents/skills/ui-review/SKILL.md) with
[fixture screenshots](ui-screens.md), never real user data.
