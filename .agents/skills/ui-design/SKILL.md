---
name: ui-design
description: Follow the design system for each UI change in frontend. Use, with no request from the person, when you add, change, style, or review a page, a component, a dialog, a form, a list, a theme token, a color, or any .tsx or .css file in frontend, and again before you say that the UI work is done.
---

# UI design

`docs/agents/ui-components.md` has the design direction, the theme, the color
and surface rules, and each shared component. Read it before you start. This
skill is the order of work.

## Before you write markup

1. Open the page on `/components` or read the table in the document, and find
   the component that does the job. Read its prop type before use.
2. When no component fits, look for a prop or a variant that makes one fit.
3. When none does, add the component or the variant in
   `frontend/src/features/core/ui/components/`. Show it on the `/components`
   page, and add it to the document in the same change.

## While you style

Use the first of these that does the job:

1. The props and variants of a shared component.
2. The `cva` variants of the shared component, for a new look that other pages
   can use.
3. A rule in `components.css` that uses tokens, for a look that a variant
   cannot give.
4. A new role in `theme.css`, for a value that has no token. Define it for
   both themes.

Choose a color by its role. Use a nested surface as the document says: at most
two steps of surface, then space, a header, or a line.

## Before you say that the work is done

Check each of these against the diff:

- A new page has no handmade button, tab, header, field, badge, card, list,
  notice, empty state, or loading text.
- A product page has no import from Base UI or Lucide, no fixed color, and no
  literal size, space, radius, or shadow.
- Each new color works in the light theme and in the dark theme. Look at the
  change in both when a surface, a border, or a fill changed.
- Each new interactive part works with the keyboard, shows the focus ring, and
  has a name that a screen reader can read.
- A new component or variant is on `/components` and in the document.
- A fact in the document that the change made wrong is correct again.

Then run the checks that `AGENTS.md` names for the change. Run
`pnpm run test:browser` also when a change touches a shared component, because
the component library has black box tests.

## Last step: independent UI review

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
