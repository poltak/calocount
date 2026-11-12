# shadcn foundation

Use shadcn on Base UI, with `base-mira` as shadcn ships it. Do not change
its sizes. Do not use Radix or another component registry as a library.
The exact CLI version is in the root `package.json`. The configuration is
`frontend/components.json`. Read the [CLI guide](https://ui.shadcn.com/docs/cli)
and [configuration guide](https://ui.shadcn.com/docs/components-json).

## Files and layers

All paths below start at `frontend/src/features/core/ui/`.

- `shadcn/` has only CLI output. Never edit it by hand. Its files have the
  `linguist-generated` attribute. The size hook skips generated files, and
  Prettier leaves their bytes unchanged. `pnpm run check:shadcn` generates
  each installed part again with the pinned CLI and compares every file.
- `core/` has WorldBrain parts that each project gets: `Page`, `PageHeader`,
  and `AppLayout`.
- `registry/` has forks and new Base UI controls in shadcn registry format.
- `components/` is the project layer. The template keeps only its README.
- `shadcn.css` has the shadcn variables, Tailwind imports, and dark variant.
  `components.json` names it. `shadcn apply` may rewrite it.
- `worldbrain.css` has only tokens and base rules that shadcn does not supply.
- `project.css` is empty in the template. A template sync does not change it.
- `theme.css` imports these files and fixes the order `theme, base,
components, utilities`. Preflight is on in `base`. Keep `app.css` before
  feature imports in `main.tsx`, so this order takes effect first.

The alias `@/` means `frontend/src/`. It lets the CLI write imports within
the feature tree. Architecture lint resolves it with the same boundaries as
relative imports.

## Find and change a part

Look in this order: a shadcn component, a shadcn block, a WorldBrain core
part, a project part, then a feature-local part. Read the
[base-mira registry](https://ui.shadcn.com/r/styles/base-mira/registry.json)
and `https://ui.shadcn.com/r/styles/base-mira/<name>.json`. Check each item's
`dependencies` and `registryDependencies` before installation. Only `shadcn`,
`cn`, and `tw-animate-css` are approved additions for this move. Other new
packages need the person's approval. The named `mira` preset also adds a
font and Hugeicons. Do not install those packages for this foundation.

Pages use shadcn props directly. For product behavior, compose its parts in
`core/` or `components/`. Fork a different look into `registry/`. For a
control that shadcn lacks, first find its Base UI behavior. For example, a
segmented control uses ToggleGroup. Write the control with `cva`, `data-slot`,
theme variables, and shadcn parts. Do not copy size classes from those parts.

Pages import icons directly from the `iconLibrary` in `components.json`,
which is `lucide`. Pass icons as children. Do not add an icon-name prop or
another icon set. `simple-icons` is only for brand logos and still needs
package approval if a project does not have it.

Outside `shadcn/`, `core/`, and `registry/`, lint stops Base UI imports,
other icon libraries, and Tailwind bracket values. For gap, space, and
padding, use only `0`, `0.5`, `1`, `1.5`, `2`, `2.5`, `3`, `3.5`, `4`, `6`,
or `8`. These are the small base-mira steps and the current page scale.
The sidebar's internal `7.5` and `18` are not page spacing values. Use `flex`
and `gap-*` for page layout. Do not add Stack, Actions, Columns, Toolbar,
or PageTop wrappers.

The controls, fields, containers, text feedback, and sidebar use shadcn directly. The last
legacy lint exceptions and `lint/ui-legacy.mjs` are gone. Generated files alone are
exempt from local-state, browser-global, and conflicting markup lint rules.
The byte comparison, not a hand edit, controls that directory.

## Theme token map

All names in this section start with `--`. No color token was renamed.
The following tokens moved from `theme.css` to `shadcn.css`:

`background`, `foreground`, `card`, `card-foreground`, `popover`,
`popover-foreground`, `primary`, `primary-foreground`, `secondary`,
`secondary-foreground`, `muted`, `muted-foreground`, `accent`,
`accent-foreground`, `destructive`, `border`, `input`, `ring`, and `sidebar`.

They keep their old light and dark values, except for dark `destructive`.
It uses shadcn's neutral value, `oklch(0.704 0.191 22.216)`. Base-mira uses
this token for destructive text as well as fills. The old dark red was a
fill color and made the new button and badge labels hard to read. Alerts now use the generated default and destructive variants. Their old
text and fill aliases are gone.
The form migration removed the temporary `legacy-destructive` token with
the old Select border styles. Generated form controls use `destructive`.

`radius` also moved. Its base-mira value is `0.625rem`, not the old `0.5rem`.
The `radius-sm`, `radius-md`, `radius-lg`, and `radius-xl` utilities now use
base-mira's factors `0.6`, `0.8`, `1`, and `1.4`. New sizes are `radius-2xl`,
`radius-3xl`, and `radius-4xl`, with factors `1.8`, `2.2`, and `2.6`.
`font-heading` is new and uses `font-sans`. The system font stays unchanged.

New colors use base-mira's neutral defaults in both themes:
`chart-1`, `chart-2`, `chart-3`, `chart-4`, `chart-5`, `sidebar-foreground`,
`sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`,
`sidebar-accent-foreground`, `sidebar-border`, and `sidebar-ring`.
The matching `color-*` utility mappings are new too.

All remaining tokens moved unchanged to `worldbrain.css`. They are the
contrast helpers, `foreground-base`, `setting-group`, `selected-fill`,
`destructive-foreground`, `border-soft`, `sidebar-row-inset`,
`popover-glass`, `border-popover`, `success`,
`warning`, the existing `color-*` aliases, `text-*`, `space-*`, `control-sm`,
`shadow-*`, `blur-popover`, `z-*`, `width-*`,
and their utility mappings. The existing
`font-sans` and `font-mono` mappings moved there too. The old duplicate
`radius-sm` through `radius-xl` declarations were removed so they cannot
override the style sizes. The controls migration removed the old button
shadows, segmented fills and shadow, badge radius, sidebar row colors, and
sidebar row radius. No remaining component uses those tokens.
The form migration also removed `control`, `control-hover`, their utility
mappings, and `control-md`. Only the deleted form styles used them.
The container migration removed `inset`, the `color-inset` and `color-raised`
utility mappings, `block-min-width`, `shadow-dialog`, and `z-dialog`.
No remaining container needs a raised, inset, or nested-block variant.
The text and layout migration removed `raised`, `color-surface-raised`,
`setting-group`, `border-soft`, the old notice and search-match colors,
`control-sm`, `shadow-soft`, the old sidebar and settings width tokens,
and `sidebar-row-inset`. No remaining part uses those tokens.
`Skeleton` uses its generated muted fill. Native search marks use the
accent tokens. Global heading, paragraph, link, and alert styles are gone.
Each part sets its own type and colors.

## WorldBrain core parts

Import these parts from their defining files in `core/ui/core/`.

- `Page` (type D) owns the page width, padding, and block gap. Signed-in pages
  use the sidebar inset width and phone padding. Signed-out pages use the
  standalone width. Auth routes wrap their panel in `Page`; do not add a
  second `Page` inside the panel. Use flex and gap utilities for inner layout.
- `PageHeader` (type A) composes `CardHeader` and `CardDescription` with the
  page's one `h1`. Use `title`, optional `subtitle`, and optional `actions`.
  No caller used its old `leading` or `search` props, so they are gone. The
  gallery search still uses `InputGroup` directly. Use card header parts or
  an `h2` with theme utilities instead of the deleted `SectionHeader`.
- `AppLayout` composes the generated sidebar parts for the signed-in frame.

For compact notes, `Item size="xs"` sets the row density. `CardContent`
supplies the inset; the Item removes only its duplicate horizontal inset and
transparent border. Do not copy generated size values to a page.

`Markdown` (type D) is blocked: the frontend has neither `react-markdown` nor
`remark-gfm`. Do not add a substitute parser or packages without approval.
When both packages are approved, add the core part with GFM, `skipHtml`,
theme-styled elements, and links with `target="_blank" rel="noreferrer"`.

The sidebar is a product composition of the installed generated parts, based
on `sidebar-07`. It needs no avatar, breadcrumb, or new package. Its mobile
sheet and keyboard behavior come from the generated sidebar. Router links
close the sheet on activation. No mobile-header portal exists in this
template revision. `PageHeader` renders inside the inset.

## Commands

Run from the repository root:

```sh
pnpm exec shadcn add --cwd frontend <component>
pnpm exec shadcn apply --cwd frontend --preset <code>
pnpm exec shadcn migrate icons "frontend/src/**" --cwd frontend --from lucide --to <library>
pnpm exec shadcn build --cwd frontend --output ../public/r
pnpm run check:shadcn
pnpm run build
```

After adding a component, add its name to `scripts/shadcn-components.json`.
The check also compares helper files that its registry dependencies produce.
The check uses the live registry. Its tests use a local generator and need no
network. `pnpm run check` and CI's `pnpm run ci:checks` both run it.
After `apply`, check both themes and widths with `pnpm run ui:screens`.
Keep the device theme and `data-theme` overrides working. Review with the
`ui-review` skill before delivery.
