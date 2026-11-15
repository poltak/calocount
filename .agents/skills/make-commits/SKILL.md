---
name: make-commits
description: Create atomic Git commits with plain-English messages and concise bullet-point bodies. Use when asked to stage changes, split work into commits, commit completed features or fixes, or prepare a branch's commit history for review.
---

# Make Commits

Create one commit for each discrete feature, fix, or improvement.

## Workflow

1. Inspect the complete working-tree diff and identify independent pieces of work (if not already well understood from context).
2. Group implementation, tests, migrations, generated files, and documentation that belong to the same behavior.
3. Keep unrelated changes in separate commits. Preserve user-owned changes that are outside the requested scope.
4. Stage only the files or hunks for the current group. Do not blindly stage the whole working tree.
5. Review the staged diff before committing. Confirm it is complete, focused, and independently understandable.
6. Repeat until every intended change has an appropriate commit.

Do not split a single behavior merely by file type. Its implementation and relevant tests usually belong together. Split changes when they can be reviewed, reverted, or explained independently.

## Commit messages

- Write the subject as a plain-English sentence summarizing the outcome.
- Do not prefix subjects with `fix:`, `feat:`, `chore:`, or similar labels.
- Use a short bullet-point body describing the important changes.
- Describe the behavior and intent, not a list of filenames.
- Keep the wording natural and specific.

## Gotchas

- Do not encode body line breaks as `\n` inside a quoted `git commit -m` argument.
- Use `git commit -F <message-file>` for multi-line bodies, then verify with `git log -1 --format=%B`.

## Examples

```text
Prevent duplicate results across search pages

- Fixes a bug where different search pages could contain the same results.
- Core functional change is making pagination deterministic.
```

```text
Report reduced search quality after provider failures

- Preserve usable results when rewrite or rerank providers fail.
- Show a temporary quality warning in the search interface.
- Keep degraded pages retryable instead of persisting fallback order.
```

```text
Cache deterministic search rewrites

- Scope cached rewrites to the user and planner configuration.
- Reuse only validated provider responses.
- Invalidate entries when rewrite pipeline versions change.
```

Avoid vague or mixed commits such as:

```text
Update search and clean up some tests
```
