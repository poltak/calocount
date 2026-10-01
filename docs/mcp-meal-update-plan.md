# MCP meal update plan

## Goal

Let the signed-in owner edit a saved meal through MCP with its existing
`request_id`. Keep the same meal record and request ID.

## Contract

- Add `update_meal` with the saved UUID `request_id` and a partial `patch`.
  Use the same UUID and strict time validators as meal creation.
- Allow corrections to the meal name, meal time, macros, and nutrient data using
  the existing meal validation and item storage rules.
- Preserve fields omitted from the patch, including photos.
- Reject an empty patch, invalid values, and a request ID that does not identify
  a completed meal in the signed-in account.
- Use the existing item update rules so saved meal totals match saved items.
  Meal macro corrections adjust the full stored item list. Item corrections use
  existing item IDs and merge into that list; they do not remove other items.
- Merge partial nutrient corrections with existing nutrient values. Accept
  meal-level nutrient patches only for single-item meals. For multi-item meals,
  require item patches. Reject combined meal and item macro corrections, and
  reject a patch that changes the same nutrient at both levels.
- Keep the original `add_meals` retry behavior. An edit must not create a meal.
- Return the updated meal and its request ID.
- Add nullable `request_id` and existing item IDs to nutrition history. Meals
  without an external request ID cannot be edited with this tool.

## Implementation

1. Add the tool schema, validation, owner-scoped lookup, and update handler.
2. Reuse current storage and item total calculation code. Add no dependencies
   or database migrations.
3. Add tests for successful edits, unchanged fields and photos, item totals,
   nutrient corrections, invalid input, missing IDs, account isolation, and
   repeated requests.
4. Update MCP setup and meal workflow documentation.
5. Review the diff and run the full repository check command.

## Validation boundary

Validate the local implementation. Deployment and live account changes require
a separate request.

## Result

Implemented the tool, history IDs, integration tests, and documentation. The
primary agent reviewed all worker changes and corrected UUID compatibility,
strict time validation, write instructions, and conflicting nutrient patches.

`pnpm run check` passed: type checking, linting, build, 336 unit tests, and 30
browser tests. No dependency or schema changes were needed. The change has not
been deployed.
