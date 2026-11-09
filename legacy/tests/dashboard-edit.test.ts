import assert from "node:assert/strict";
import test from "node:test";

import {
  beginMealEdit,
  commitMealEdit,
  discardMealEdit,
  mealDraftFor,
  updateMealDraft,
  updateMealDraftItem,
  type EditableMeal,
} from "../app/dashboard-edit";

function meal(): EditableMeal {
  return {
    id: "meal-1",
    name: "Rice",
    description: "Lunch",
    calories: 500,
    protein: 30,
    carbs: 60,
    fat: 10,
    items: [{ id: "item-1", name: "Rice", calories: 500, proteinG: 30, carbsG: 60, fatG: 10, nutrients: { sodiumMg: 2 } }],
  };
}

test("meal changes stay in a draft and do not change canonical meal totals", () => {
  const canonical = meal();
  const editing = beginMealEdit(canonical);
  const changed = updateMealDraft(editing, canonical.id, { name: "Chicken rice", calories: 650, protein: 40 });

  assert.equal(canonical.name, "Rice");
  assert.equal(canonical.calories, 500);
  assert.equal(changed.drafts[canonical.id]?.name, "Chicken rice");
  assert.equal(changed.drafts[canonical.id]?.calories, 650);
  assert.equal(changed.drafts[canonical.id]?.items[0]?.calories, 650);
  assert.equal(mealDraftFor(changed, canonical).name, "Chicken rice");
});

test("cancel and date change discard drafts while canonical data stays unchanged", () => {
  const canonical = meal();
  const editing = beginMealEdit(canonical);
  const changed = updateMealDraft(editing, canonical.id, { calories: 1 });
  const cancelled = discardMealEdit(changed, canonical.id);

  assert.equal(cancelled.editingMealId, null);
  assert.deepEqual(cancelled.drafts, {});
  assert.equal(canonical.calories, 500);

  const dateChanged = discardMealEdit(updateMealDraft(editing, canonical.id, { calories: 2 }));
  assert.equal(dateChanged.editingMealId, null);
  assert.deepEqual(dateChanged.drafts, {});
});

test("switching editors cancels the previous draft", () => {
  const first = meal();
  const second = { ...meal(), id: "meal-2", name: "Soup", calories: 300 };
  const editingFirst = updateMealDraft(
    beginMealEdit(first),
    first.id,
    { calories: 700 },
  );
  const editingSecond = beginMealEdit(second);

  assert.equal(editingSecond.editingMealId, second.id);
  assert.deepEqual(Object.keys(editingSecond.drafts), [second.id]);
  assert.equal(first.calories, 500);
  assert.equal(editingFirst.drafts[first.id]?.calories, 700);
});

test("draft completion cleanup leaves canonical data unchanged until commit", () => {
  const canonical = meal();
  const editing = updateMealDraft(
    beginMealEdit(canonical),
    canonical.id,
    { description: "Saved lunch", calories: 700 },
  );

  // A failed request does not call commitMealEdit, so the canonical meal and draft remain available for retry.
  assert.equal(canonical.calories, 500);
  assert.equal(editing.drafts[canonical.id]?.calories, 700);
  const afterCommit = commitMealEdit(editing, canonical.id);
  assert.equal(afterCommit.editingMealId, null);
  assert.deepEqual(afterCommit.drafts, {});
});

test("item nutrition changes stay in the draft and preserve canonical item values", () => {
  const canonical = meal();
  const editing = beginMealEdit(canonical);
  const changed = updateMealDraftItem(editing, {
    mealId: canonical.id,
    itemId: "item-1",
    itemIndex: 0,
    key: "sodiumMg",
    value: 90,
  });

  assert.equal(canonical.items[0]?.nutrients?.sodiumMg, 2);
  assert.equal(changed.drafts[canonical.id]?.items[0]?.nutrients?.sodiumMg, 90);
});
