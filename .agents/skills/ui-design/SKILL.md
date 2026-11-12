---
name: ui-design
description: Follow the design system for each UI change in frontend. Use, with no request from the person, when you add, change, style, or review a page, a component, a dialog, a form, a list, a theme token, a color, or any .tsx or .css file in frontend, and again before you say that the UI work is done.
---

# UI design

`docs/agents/ui-components.md` has the design direction, the theme, the color
and surface rules, and each shared component. Read it before you start. This
skill is the order of work.

Read `docs/agents/ui-shadcn.md` too. It owns the rules for generated files,
the theme split, direct icon imports, page spacing, and custom controls.

## Before you write markup

1. Find a fitting shadcn component, then a shadcn block, a WorldBrain core
   part, a project part, and only then a feature-local part. Read the
   base-mira registry JSON and its package requirements before installation.
2. When no component fits, look for a prop or a variant that makes one fit.
3. When none fits, use the custom-control choices in `ui-shadcn.md`.
   Never change CLI output by hand or copy its size classes. Show a new
   composed part on `/components` and document it in the same change.

## While you style

Use the first of these that does the job:

1. The props and variants of a shared component.
2. The `cva` variants of the shared component, for a new look that other pages
   can use.
3. A fork in `core/ui/registry/` for a different component look.
4. A WorldBrain or project token for a role that shadcn does not supply.
   Define it for both themes. Keep it out of the CLI-owned variables file.

Choose a color by its role. Use a nested surface as the document says: at most
two steps of surface, then space, a header, or a line.

## Before you say that the work is done

Check each of these against the diff:

- A new page has no handmade button, tab, header, field, badge, card, list,
  notice, empty state, or loading text.
- A product page imports no Base UI package. Icons come from the configured
  library, currently Lucide. There are no bracket values. Gap, space, and
  padding use only the small scale in `ui-shadcn.md`.
- Each new color works in the light theme and in the dark theme. Look at the
  change in both when a surface, a border, or a fill changed.
- Before changing a shared theme token, inspect every consumer and state.
  During a partial migration, preserve the appearance of controls outside
  the requested group.
- Each new interactive part works with the keyboard, shows the focus ring, and
  has a name that a screen reader can read.
- When replacing navigation, preserve router matching. Check a child path,
  a similar prefix, and letter case.
- When replacing a link control, preserve its destination, target, rel,
  download behavior, and icons that explain its action. A style migration
  does not remove the new-tab indicator.
- Compare each Button variant rendered as an anchor with the same variant
  rendered as a button. Remove conflicting global anchor styles.
- After deleting a control, search every stylesheet for its old class names.
  Remove unused selectors, including selectors in shared lists and media queries.
- When a variant is removed, remove or rename its gallery example. Gallery
  labels must describe the variants that remain.
- A new component or variant is on `/components` and in the document.
- A fact in the document that the change made wrong is correct again.

Then run the checks that `AGENTS.md` names for the change. Run
`pnpm run test:browser` also when a change touches a shared component, because
the component library has black box tests.

## Last step: independent UI review

Before replacing an existing interactive control, establish its open and
focused screen states on the review base. If the fixed base lacks those
states, report the missing pairs as a coverage finding. Do not rewrite the base.

Run typecheck before handoff. Commit the UI change before review, so the diff
and captures match. Start a fresh subagent with the `ui-review` skill.
Never review your own UI change.
Give it exactly these three inputs, with no author summary or reasons:

1. The person's request, in their own words, verbatim.
2. The base ref for `git diff <base>...HEAD` and for the base captures.
3. The changed route patterns from `frontend/src/features/core/ui/routes.tsx`.

The reviewer takes current and base screens of these routes and their sibling
pages with `pnpm run ui:screens`, then reports findings without changing code.
Fix each finding or report why you did not. Apply proposed document or skill
fixes when the person agrees. After a UI fix, commit it and start a fresh
reviewer with the same three inputs. If no fresh subagent is available, report
that limit. Do not claim an independent pass from a self-review.
