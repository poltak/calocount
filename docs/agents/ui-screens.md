# Screens for the UI review

The `ui-review` skill compares pages from their screenshots and measurements.
`pnpm run ui:screens` takes them on the black box fixture, so each picture
shows only fake rows, never a real database. Its options are in
`scripts/ui-screens.mjs`:

- `--route <pattern>` takes only that route, such as `/notes/:noteId`.
- `--ref <commit>` takes the screens of another commit, such as a baseline,
  in a temporary worktree. That commit must have the script.
- `--name <name>` names the output folder.

The files go to `frontend/.browser-test/screens/<name>/`, which Git ignores.
`swamp workflow run ui-screens` runs the same command.

## Review workflow

The [UI design skill](../../.agents/skills/ui-design/SKILL.md) ends with a
fresh subagent that runs the [UI review skill](../../.agents/skills/ui-review/SKILL.md).
It receives only the person's verbatim request, a Git base ref, and changed
route patterns. It reads the diff itself and takes the changed routes and
their sibling pages with `--name current` and `--ref <base> --name base`.
Repeat `--route` for each route. The base commit must have `ui:screens`.

The reviewer reads each PNG and its JSON in both themes at both widths. It
checks scope, component use, sibling pages, and visual craft, then reports
findings without changing code. The author fixes them or reports why not.
The person must agree before the author applies a proposed document or skill
fix. These captures never use a real database or real user data.

## A screens file for each feature

Each feature with a page has a `<feature>.screens.ts` file in its
`black-box-tests/` directory. It seeds fake rows with `seedThroughApi()`,
then calls `captureScreens()` from `core/tests/browser/screens.ts` with each
route pattern of the route table and the address to open. A screen with a
`state`, such as `empty`, is one more picture of the same route.

When you add a route, add its screen in the same change. Seed rows that fill
the page as a person's data would: a long title, an empty field, and enough
rows to show the list.

A screens file checks nothing, so `pnpm run test:browser` does not run it.
Because it checks nothing, it may seed rows through the API, which a black
box test may not do. The `testing/black-box-tests` lint rule lets only a
screens file import the screens helper, and keeps the other rules of a black
box test: it takes `test` from the fixture and finds no element.

## What each screen gives

Each screen gives a PNG at a width of 1280 and 390, in the light and the dark
theme, and one JSON file with the measurements of each picture:

| Field                | What it is                                                            |
| -------------------- | --------------------------------------------------------------------- |
| `headings`           | Each visible heading: level, text, font size, weight, and position.   |
| `main`, `column`     | The box of `main`, and of the first element in it with many children. |
| `blocks`, `gaps`     | The children of the column, and the vertical space between them.      |
| `leftEdges`          | How many text and control elements start at each x.                   |
| `horizontalOverflow` | Whether the page is wider than the window.                            |
