# Nutrient Tracking Implementation Plan

## Goal

Add 24 optional nutrient values to every meal creation path. Keep the current calorie and macro experience unchanged. Add detailed daily, trend, meal-detail, and edit views that use the existing dashboard style.

The feature must work with all existing meals. A missing value means that the nutrient is unknown. It must not mean zero.

## Final nutrient fields

### Carbohydrates

- `fiberG`
- `totalSugarsG`

### Fats and lipids

- `saturatedFatG`
- `monounsaturatedFatG`
- `polyunsaturatedFatG`
- `omega3G`
- `cholesterolMg`

### Vitamins

- `vitaminAMcgRae`
- `vitaminCMg`
- `vitaminDMcg`
- `vitaminEMg`
- `vitaminKMcg`
- `vitaminB6Mg`
- `folateMcgDfe`
- `vitaminB12Mcg`

### Minerals

- `sodiumMg`
- `potassiumMg`
- `calciumMg`
- `ironMg`
- `magnesiumMg`
- `phosphorusMg`
- `zincMg`
- `seleniumMcg`

### Other

- `caffeineMg`

## Product rules

1. Every new value is nullable. `NULL` means unknown. `0` means known to be zero.
2. Keep calories, protein, carbohydrates, fat, and the current macro charts unchanged.
3. Store nutrient source values on meal items. Do not make the meal log another source of truth.
4. Do not add 24 cached total columns to `meal_logs`. Calculate detailed totals from the meal items when the app reads them.
5. A total is partial when at least one included item has an unknown value. The UI must show this state.
6. `omega3G` is part of `polyunsaturatedFatG`. Do not add it again when calculating total fat.
7. Do not add generic daily targets in the first release. Nutrient targets depend on user and product decisions that are outside this change.
8. Do not expose the new values through the public dashboard by accident. Public support must be an explicit later step.

## Proposed data model

### Meal item columns

Add the 24 fields as nullable `REAL` columns on `meal_items` in `db/schema.ts` and a generated Drizzle migration.

Use direct columns instead of JSON or an entity-attribute-value table because the field list is now fixed, the app needs typed validation, and SQL will need to aggregate individual nutrients. Add no default values. Existing rows will therefore contain `NULL` without a backfill.

Keep the four existing non-null macro columns and four cached meal totals unchanged.

### Shared nutrient catalogue

Add one shared metadata module, such as `domain/nutrients.ts`, with:

- the 24 valid keys;
- database and API types;
- group, label, unit, display precision, and display order;
- safe minimum and maximum validation values;
- value formatting helpers;
- helpers that preserve `null` instead of converting it to zero.

All parsers, forms, summary functions, and AI schemas should use this catalogue. Do not copy the 24-name list into many independent files.

### Aggregate shape

Represent an aggregate value as:

```ts
type NutrientAggregate = {
  amount: number | null;
  knownItemCount: number;
  totalItemCount: number;
  complete: boolean;
};
```

Aggregation rules:

- No known values: `amount` is `null`.
- All values known: return the sum with `complete: true`.
- Some values known: return the known sum with `complete: false`.
- Preserve an explicit zero as a known value.

The UI can show a partial value as `650 mg known` and explain, for example, `2 of 3 items estimated`.

## Data and API work

### Repository

Update `db/repository.ts` to:

- extend `MealItemInput` with the nullable nutrient fields;
- preserve them in `normaliseItem`;
- write them in normal meal creation;
- write them in the ChatGPT external-request path;
- preserve them in meal updates and corrections;
- copy them in `copyMeal`;
- calculate per-meal, per-day, and seven-day nutrient aggregates;
- keep the existing macro total calculation unchanged.

Do not change `calculateTotals` into a mixed macro and micronutrient function. Add a separate nutrient aggregation helper.

### Private meal API

Update `app/api/_lib/meal-input.ts` so every field is accepted in each `items[]` entry.

The parser must support three states:

- property omitted: no supplied value;
- property set to `null`: clear or mark unknown;
- property set to a finite non-negative number: known value.

The current `optionalNumber` helper maps `null` to `undefined`. Add a nutrient-specific nullable parser instead of changing the behavior of every existing API field.

`serialiseMeal` already returns meal-item database fields after it removes `ownerKey`. Add focused contract tests so this behavior cannot expose a private field later.

### Dashboard summary API

Extend the private dashboard summary with:

```ts
nutrition: {
  today: NutrientAggregateMap;
  sevenDay: NutrientAggregateMap;
  byDate: Array<{ date: string; nutrients: NutrientAggregateMap }>;
}
```

Use the same browser timezone and logical-date rules as the existing calorie and macro summary. Do not calculate these totals on the client from only the visible meal subset.

### ChatGPT Action

Keep all current required request fields unchanged. Add an optional `nutrients` object that uses the same 24 keys with `number | null` values.

This keeps old GPT Action calls valid and keeps the top-level request readable. Update the action OpenAPI schema, parser, response tests, and idempotent repository mapping. A retry with the same request ID must still return the original meal without rewriting it.

### JSON and CSV export

The JSON export will receive the item columns through normal serialization. Add a version or contract test for them.

Do not silently append ambiguous partial meal totals to the current CSV. Either:

1. add a separate item-level CSV format with one row per meal item; or
2. add meal-level nutrient columns together with completeness columns.

The first option is recommended because it preserves the source data and supports multi-item AI meals.

### Public read-only dashboard

Keep the new fields out of `public-summary-projection.ts` during the first release. This gives the owner UI time to validate the values and avoids an accidental public contract expansion.

If public nutrient views are wanted later, explicitly add a safe allowlist, update the privacy copy, and add projection tests. Never pass the private serialized meal object through directly.

## AI ingestion work

### Structured output

Bump the meal analysis prompt and schema versions. Add a `nutrients` object to every AI item in `workers/ingest/schema.ts` and the matching types in `workers/ingest/types.ts`.

For strict structured output, make all 24 keys present but nullable:

```json
{
  "nutrients": {
    "fiberG": 4.2,
    "vitaminB12Mcg": null
  }
}
```

The prompt must say:

- use `null` when the image or description does not support an estimate;
- use zero only when the value is known to be zero;
- do not invent precision;
- treat omega-3 as part of polyunsaturated fat;
- estimate each food item before any meal aggregation.

Do not ask the model to return meal-level nutrient totals. Calculate them from the validated items.

### Validation and persistence

Validate finite, non-negative values with field-specific safe upper bounds. Reject unknown keys because the provider schema can be bypassed by fallback models.

Do not hard-reject a meal only because subtype estimates do not reconcile exactly with total carbs or fat. Record the values and mark the aggregate as estimated. LLM estimates and food databases can have small inconsistencies.

Update `workers/ingest/jobs.ts` to write `NULL` for unknown new nutrients. Do not repeat the current carbs/fat fallback that converts unknown values to database zero.

Both OpenRouter and direct xAI adapters must use the same schema, validation, and mapping.

## UI architecture

### Preserve the current overview

Keep these areas unchanged:

- the three top summary cards;
- the calorie chart;
- the seven-day macro trend;
- the macro donut;
- the compact meal rows on desktop and mobile.

Add `nutrition` to `DashboardSection` and to the existing jump navigation. The detailed feature should use the existing `.panel`, `.panel-heading`, `.summary-card`, chart, type, spacing, and colour conventions in `app/globals.css`.

### Required meal model refactor

The current dashboard `mealPayload` replaces every saved meal with one synthetic item. Before nutrient editing is added:

- retain the real serialized `items` in the client `Meal` model;
- preserve item IDs and all unchanged fields;
- edit the real items instead of rebuilding one aggregate item;
- keep manual meals as a simple one-item case;
- verify that editing or copying an AI meal does not remove its food breakdown.

This is a prerequisite. Without it, a nutrient edit can destroy valid AI item data.

### New views

#### 1. Daily nutrition overview

Add a `Nutrition overview` panel for the selected day. Use a small row of high-signal values:

- Fibre
- Total sugars
- Saturated fat
- Sodium
- Potassium
- Caffeine

Show absolute amounts only. A missing value displays `—`, not zero. A partial value displays a visible `Partial` state.

#### 2. Carbohydrate and fat details

Use two compact panels:

- `Carbohydrate details`: total carbohydrates, fibre, and total sugars.
- `Fat profile`: total fat, saturated, monounsaturated, and polyunsaturated fat, with omega-3 shown as a nested part of polyunsaturated fat.

Keep the main macro donut unchanged. Do not make omega-3 another top-level donut segment. If a stacked fat bar is used, show unclassified fat as a remainder and never show a negative remainder.

#### 3. Vitamins view

Show the eight vitamin values in a responsive stat grid. Each stat uses the shared name, unit, precision, and missing-value formatter.

#### 4. Minerals view

Show the eight mineral values in the same stat grid pattern.

#### 5. Nutrient trend explorer

Add one seven-day chart with a nutrient selector. Do not render 24 series in one chart.

The selector should group the fields by category. The chart should reuse the current bar and axis style. Missing days must be gaps or marked as unknown, not zero-height bars. Show the seven-day known average and coverage next to the chart.

#### 6. Meal nutrition details

Add a details disclosure or dialog for each meal. It should show:

- existing photo and meal metadata;
- meal macro totals;
- meal nutrient totals and completeness;
- each food item separately;
- item confidence and nutrient values.

Keep the compact meal row unchanged. On mobile, use a full-width stacked view instead of adding 24 columns to the row.

#### 7. Advanced nutrition editor

Keep the current fast create fields visible. Add one collapsed `Advanced nutrition` section that uses the shared nutrient groups.

The same editor must be used for:

- dashboard meal creation;
- dashboard meal editing and corrections;
- individual AI meal items.

Every input is optional and has `Leave blank if unknown` guidance. Empty inputs send `null`. Use `step="any"`, non-negative validation, proper labels, and unit suffixes.

### Suggested UI components

Move the nutrient presentation out of the monolithic `app/page.tsx`:

- `app/nutrition/nutrient-meta.ts`
- `app/nutrition/nutrient-value.tsx`
- `app/nutrition/nutrient-group.tsx`
- `app/nutrition/nutrition-overview.tsx`
- `app/nutrition/nutrient-trend-panel.tsx`
- `app/nutrition/meal-nutrition-details.tsx`
- `app/nutrition/meal-nutrition-editor.tsx`

Keep data loading, optimistic actions, and reconciliation in `Dashboard` until a later refactor. The new components should receive plain typed props and should not start their own requests.

## Delivery phases

### Phase 1: Shared contracts and migration

- Add the nutrient catalogue and types.
- Add nullable meal-item columns and the migration.
- Add repository create, update, copy, and aggregate support.
- Add parser and serialization tests.
- Do not show new UI yet.

### Phase 2: AI and external creation paths

- Update AI types, prompt, strict schema, validation, and persistence.
- Update OpenRouter and xAI tests.
- Add the optional ChatGPT Action `nutrients` object.
- Verify unknown values remain `NULL` through every path.

### Phase 3: Correct item-preserving edit flow

- Retain real meal items in dashboard state.
- Add shared item-level create and edit models.
- Verify add, edit, correction, copy, optimistic state, rollback, and reload.

### Phase 4: Meal details and advanced editor

- Add the grouped details view.
- Add the collapsed advanced editor.
- Validate desktop, narrow mobile, keyboard, and screen-reader behavior.

### Phase 5: Daily and trend views

- Add private summary aggregates.
- Add the nutrition overview, carb details, fat profile, vitamins, minerals, and trend explorer.
- Preserve the existing macro overview and its tests.

### Phase 6: Export, documentation, and optional public support

- Add item-level CSV export or documented completeness columns.
- Update API and privacy documentation.
- Decide whether to add the new views to the public dashboard.
- Run the full release checks and real browser flows.

## Test plan

### Data tests

- Migration leaves old rows as `NULL`.
- Create preserves zero, number, omitted, and null correctly.
- Update can set and clear every field.
- Copy preserves all fields and creates new item IDs.
- Corrections preserve unchanged item nutrients.
- Aggregation reports complete, partial, and fully unknown values.
- Timezone day grouping matches the existing dashboard contract.

### AI tests

- Strict schema accepts numbers and nulls for all 24 keys.
- Unknown keys, negative values, non-finite values, and invalid types fail.
- Provider totals are ignored in favour of item calculations.
- OpenRouter and xAI use the same schema.
- Persistence stores unknown values as `NULL`.
- A fallback provider response still receives server validation.

### API tests

- Private create and patch routes accept all fields.
- ChatGPT requests without nutrients remain valid.
- ChatGPT retries remain idempotent.
- JSON export keeps null values.
- Public summaries do not expose new values in the first release.

### UI tests

- Existing macro views remain unchanged.
- Missing values show `—`; explicit zero shows `0`.
- Partial aggregates have a visible explanation.
- Advanced create and edit controls are grouped and accessible.
- Optimistic add and save retain nutrient values through success and rollback.
- Multi-item AI meals keep all items after edit, correction, and copy.
- The trend selector shows one nutrient and does not turn missing days into zeros.
- Mobile meal rows remain compact.

### Real browser flows

Test these flows on desktop and a narrow mobile viewport:

1. Create a manual meal with only macros.
2. Create a manual meal with some nutrient values.
3. Clear a known nutrient and reload.
4. Edit one item in a multi-item AI meal.
5. Copy that meal to today.
6. Confirm the old and copied meals retain their item data.
7. Open every nutrient group and change the selected trend.
8. Load an old meal and confirm unknown values do not appear as zero.
9. Verify keyboard focus, disclosure state, labels, and live save feedback.

## Deployment sequence

1. Run focused data, API, AI, and UI tests.
2. Run `npm run check` and both deployment dry runs.
3. Apply the production D1 migration while the old code is still live. The old code ignores the new nullable columns.
4. Deploy the dashboard and ingest Workers with the new contracts.
5. Verify an old meal, a new manual meal, and one controlled AI fixture. Do not create or edit real production meal data without explicit approval.
6. Verify that the public dashboard contract has not expanded.

## Completion criteria

The feature is complete when:

- every creation and update path accepts the same 24 optional fields;
- existing meals work without a backfill;
- unknown values never silently become zero;
- AI, manual, and ChatGPT meals persist the same field meanings;
- editing and copying preserve multi-item meal data;
- the current macro overview is unchanged;
- detailed nutrient views work on desktop and mobile;
- daily and seven-day aggregates explain partial coverage;
- owner and public data boundaries are explicit and tested;
- focused tests, the full check, dry runs, and real browser flows pass.
