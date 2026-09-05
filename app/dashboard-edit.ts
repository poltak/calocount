import type { NutritionItem } from "./nutrition/meal-nutrition-details";
import { updateMealItemTotals } from "./meal-item-totals";

export type EditableMeal = {
  id: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs?: number;
  fat?: number;
  items: NutritionItem[];
};

export type MealDraftChanges = Partial<Pick<EditableMeal, "name" | "description" | "calories" | "protein" | "carbs" | "fat">>;

export type MealEditState<T extends EditableMeal> = {
  editingMealId: string | null;
  drafts: Record<string, T>;
};

function copyMeal<T extends EditableMeal>(meal: T): T {
  return {
    ...meal,
    items: meal.items.map((item) => ({
      ...item,
      nutrients: item.nutrients ? { ...item.nutrients } : item.nutrients,
    })),
  } as T;
}

export function emptyMealEditState<T extends EditableMeal>(): MealEditState<T> {
  return { editingMealId: null, drafts: {} };
}

export function beginMealEdit<T extends EditableMeal>(meal: T): MealEditState<T> {
  return {
    editingMealId: meal.id,
    drafts: { [meal.id]: copyMeal(meal) },
  };
}

export function mealDraftFor<T extends EditableMeal>(state: MealEditState<T>, meal: T): T {
  return state.drafts[meal.id] ?? meal;
}

export function updateMealDraft<T extends EditableMeal>(
  state: MealEditState<T>,
  mealId: string,
  changes: MealDraftChanges,
): MealEditState<T> {
  const draft = state.drafts[mealId];
  if (!draft) return state;
  const nextMeal = { ...draft, ...changes } as T;
  const items = draft.items.length === 0
    ? draft.items
    : updateMealItemTotals({ items: draft.items, changes });
  return {
    ...state,
    drafts: { ...state.drafts, [mealId]: { ...nextMeal, items } },
  };
}

export function updateMealDraftItem<T extends EditableMeal>(
  state: MealEditState<T>,
  {
    mealId,
    itemId,
    itemIndex,
    key,
    value,
  }: {
    mealId: string;
    itemId: string | undefined;
    itemIndex: number;
    key: string;
    value: number | null;
  },
): MealEditState<T> {
  const draft = state.drafts[mealId];
  if (!draft) return state;
  const items = draft.items.map((item, index) => {
    if ((itemId && item.id !== itemId) || (!itemId && index !== itemIndex)) return item;
    return { ...item, nutrients: { ...(item.nutrients ?? {}), [key]: value } };
  });
  return {
    ...state,
    drafts: { ...state.drafts, [mealId]: { ...draft, items } },
  };
}

export function discardMealEdit<T extends EditableMeal>(state: MealEditState<T>, mealId?: string): MealEditState<T> {
  const drafts = { ...state.drafts };
  if (mealId) delete drafts[mealId];
  else return emptyMealEditState<T>();
  return {
    editingMealId: state.editingMealId === mealId ? null : state.editingMealId,
    drafts,
  };
}

export function commitMealEdit<T extends EditableMeal>(state: MealEditState<T>, mealId: string): MealEditState<T> {
  return discardMealEdit(state, mealId);
}
