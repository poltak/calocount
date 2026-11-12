---
name: ui-review
description: Review a completed UI change from its diff, screenshots, and measurements. A fresh subagent runs this at the end of each UI change, never the author. Check scope, component use, sibling pages, and visual craft. Report findings without changing code.
---

# UI review

## Inputs

Start with only these three inputs from the author:

1. The person's request, in their own words, verbatim.
2. A Git base ref. Run `git diff <base>...HEAD` yourself.
3. The changed route patterns from
   `frontend/src/features/core/ui/routes.tsx`, not seeded record addresses.

Do not take the author's summary, reasons, suggested findings, or test results.
Read the repository rules and the `unslop` skill. Do not change application
code, documents, or skills. This review reports what the author must fix.

## Take the screens

1. Read `docs/agents/ui-components.md` and `docs/agents/ui-screens.md`.
   Check `git status --short`. The UI change must be in `HEAD`, so the diff
   and current screens show the same change. If UI edits are not committed,
   report the missing input instead of a pass.
2. Resolve the base to a commit with `git rev-parse <base>`. Read the diff
   and the route table at both refs. Choose sibling pages from the navigation
   and their page pattern, not just their URL prefix. They are pages at the
   same level that share a layout, such as list pages in the main navigation.
   A detail page is not a sibling of its list page. List the chosen siblings.
   If none exist, say so. Do not invent a match.
3. Take the changed routes and all their siblings in one run. Repeat
   `--route` for each pattern. Use the resolved base commit in the second run:

   ```sh
   pnpm run ui:screens --name current --route /notes
   pnpm run ui:screens --ref <base> --name base --route /notes
   ```

   Use only this command for captures. It uses the browser-test fixture,
   fake services, and fake rows. Never connect to a real database or use real
   user data. Do not use a live app as a substitute.

4. Read the PNGs with an image tool, not just their filenames. Read the JSON
   beside them in `frontend/.browser-test/screens/{current,base}/`.
   Inspect every captured state at 1280 and 390 px, in light and dark themes.
   Match route, state, width, and theme across refs. Check that every requested
   route has output. For a new route, say that it has no base screen and use
   its siblings. If a base lacks `ui:screens`, a capture fails, or a state is
   missing, report the coverage gap. Never claim a pass with missing evidence.

## Run four checks

1. **Scope.** Compare the request with the whole diff and current screens.
   Confirm that each requested UI or text change appears in the PNGs.
   Flag extra UI, extra text, changed behavior, or restyled parts outside the
   request. Compare each current picture and its measurements with base.
   A changed sibling or page that the diff did not mean to change is a scope
   finding too. Use the code to check behavior that a picture cannot show.
2. **Components.** Look for a fitting part in this order: a shadcn component,
   a shadcn block, a WorldBrain core part in `core/ui/core/`, a project part in
   `core/ui/components/`, then a local part in one feature. Check the
   [base-mira registry](https://ui.shadcn.com/r/styles/base-mira/registry.json)
   and the candidate's `https://ui.shadcn.com/r/styles/base-mira/<name>.json`.
   Do not accept a handmade control where a shadcn part fits. A page must not
   import `@base-ui/react` or its subpaths, or use fixed values in brackets,
   such as `gap-[13px]`. Icon imports must use the `iconLibrary` in
   `components.json`. Brand logos may use `simple-icons`.
   These are the target rules. Until phase 1 adds the shadcn layers and
   `components.json`, check against the current shared parts and icon rules
   in `docs/agents/ui-components.md`. Do not flag the absent foundation itself
   or demand that a page import a part that does not exist yet.
3. **Sibling pages.** Compare matched states at each width and theme.
   `headings` must show one `h1`, with the same `fontSize` and `fontWeight`
   as its siblings, and the same size for each equivalent heading level.
   Compare `gaps` between equivalent blocks, and `column.width` and `column.x`.
   Allow at most 1 px for rounding of positions and gaps. A larger difference
   needs a reason in the request or the documented page pattern. Confirm in
   the PNG that the measured column is the content column. With no sibling,
   check the shared page pattern and state the comparison limit.
4. **Visual craft.** List the distinct `gaps` and compare them with the small
   set of spacing tokens in the shared pattern. Flag unexplained one-off
   gaps. Read `headings` in visual order. Do not skip a level, such as `h1`
   followed by `h3`. Use `leftEdges` and the PNG to check one main content
   edge. Allow named card insets and action columns, not unexplained extra
   edges. Each empty list needs a visible empty state. At 390 px,
   `horizontalOverflow` must be false and `document.width` must not exceed
   `viewport.width`. Inspect text, controls, borders, and focus indicators
   where visible in both themes for readability. JSON does not measure
   contrast. Do not claim a contrast ratio from a picture.

Report faults already present in base as such. Do not call them regressions
or let them authorize unrelated code changes. Do not treat an intended text
change or the height it needs as an unrelated visual change.

## Report

Start with the resolved base, reviewed routes and siblings, states, widths,
themes, and evidence paths. State any capture or comparison limit.

Give each finding a short Markdown list:

```text
### 1. <short name>
- Check: scope | components | sibling pages | visual craft
- Where: <route>, <state>, <width> px, <theme>; <file:line if in the diff>
- Evidence: <JSON field and values, or what the PNG shows>; <new or in base>
- Cause: <exactly one of missing component, document gap, skill gap>
- Fix: <component to add and its path, or document/skill path and exact text>
```

Choose `missing component` when no shared part can meet the need. Name the
part to add and its layer. Choose `document gap` when the rule or shared
pattern is absent, wrong, or unclear. Choose `skill gap` when the rule is
clear but the work steps did not make the author apply it. For either gap,
quote the exact text to add or replace and name the file. A code fix alone
does not satisfy this field. Keep separate faults as separate findings.

Finish with one line, `Verdict: pass` or `Verdict: N findings`. A coverage
gap is a finding too. Name the failed command or missing screen as evidence
and propose the document or skill instruction that would prevent it.
