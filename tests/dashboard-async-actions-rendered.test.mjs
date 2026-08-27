import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard async actions use independent pending state and synchronous guards", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /type PendingActionKind/);
  assert.match(page, /const \[pendingAction, setPendingAction\] = useState<PendingAction \| null>\(null\)/);
  assert.match(page, /const \[actionStatus, setActionStatus\] = useState<string \| null>\(null\)/);
  assert.doesNotMatch(page, /actionState/);
  assert.match(page, /const pendingActionRef = useRef<PendingAction \| null>\(null\)/);
  assert.match(page, /function beginAction\(kind: PendingActionKind, id\?: string\): PendingAction \| null/);
  assert.match(page, /function finishAction\(action: PendingAction\)/);
  assert.match(page, /const actionInProgress = pendingAction !== null/);

  assert.match(page, /const mealCreateInFlight = useRef\(false\)/);
  assert.match(page, /if \(mealCreateInFlight\.current\) return;/);
  assert.match(page, /const mealSaveInFlight = useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(page, /mealSaveInFlight\.current\.has\(mealId\)/);
  assert.match(page, /const action = beginAction\("meal-save", mealId\)/);
  assert.match(page, /const action = beginAction\("meal-create"\)/);
  assert.match(page, /const action = beginAction\("meal-delete", mealId\)/);
  assert.match(page, /const action = beginAction\("meal-copy", mealId\)/);
  assert.match(page, /const action = beginAction\("weight-save", logicalDate\)/);
  assert.match(page, /const action = beginAction\("settings-save"\)/);
});

test("meal and weight mutations render optimistic state and reconcile or roll back", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function dayWithMeals\(day: Day, meals: Meal\[\]\): Day/);
  assert.match(page, /function addMealToDate\(logicalDate: string, meal: Meal\)/);
  assert.match(page, /function reconcileMeal\(optimisticId: string, remoteMeal: SerializedMeal\)/);
  assert.match(page, /id: `optimistic-meal-\$\{action\.token\}`/);
  assert.match(page, /pending: "creating"/);
  assert.match(page, /addMealToDate\(selectedDay\.date, nextMeal\)/);
  assert.match(page, /reconcileMeal\(nextMeal\.id, parsedMeal\)/);
  assert.match(page, /removeMealFromDays\(nextMeal\.id\)/);
  assert.match(page, /id: `optimistic-copy-\$\{action\.token\}`/);
  assert.match(page, /pending: "copying"/);
  assert.match(page, /reconcileMeal\(optimisticMeal\.id, parsedMeal\)/);
  assert.match(page, /removeMealFromDays\(optimisticMeal\.id\)/);
  assert.match(page, /const previousWeight = selectedWeight/);
  assert.match(page, /setWeightForDate\(logicalDate, optimisticWeight\)/);
  assert.match(page, /setWeightForDate\(logicalDate, savedWeight\)/);
  assert.match(page, /setWeightForDate\(logicalDate, previousWeight\)/);
});

test("dashboard controls expose pending labels, disabled states, and busy status", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /pendingActionLabel/);
  assert.match(page, /case "meal-create": return "Saving meal…"/);
  assert.match(page, /case "meal-save": return "Saving changes…"/);
  assert.match(page, /case "meal-delete": return "Deleting meal…"/);
  assert.match(page, /case "meal-copy": return "Copying meal to today…"/);
  assert.match(page, /case "weight-save": return "Saving weight…"/);
  assert.match(page, /case "settings-load": return "Loading saved targets…"/);
  assert.match(page, /aria-live="polite" aria-busy=\{actionInProgress\}/);
  assert.match(page, /disabled=\{actionInProgress\} aria-busy=\{pendingAction\?\.kind === "meal-create"\}/);
  assert.match(page, /disabled=\{actionInProgress\} aria-busy=\{pendingAction\?\.kind === "meal-save" && pendingAction\.id === meal\.id\}/);
  assert.match(page, /disabled=\{weightSaving \|\| actionInProgress\} aria-busy=\{weightActionPending\}/);
  assert.match(page, /className=\{`weight-reading\$\{selectedWeight \? "" : " empty"\}\$\{weightActionPending \? " is-pending" : ""\}`\}/);
  assert.match(page, /className=\{`meal-row\$\{openMealId === meal\.id/);
  assert.match(css, /button:disabled \{/);
  assert.match(css, /\.weight-reading\.is-pending/);
  assert.match(css, /\.meal-row\.is-pending/);
  assert.match(css, /\.pending-indicator/);
});

test("dashboard retry and settings requests ignore stale responses", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const dashboardLoadVersion = useRef\(0\)/);
  assert.match(page, /const requestVersion = dashboardLoadVersion\.current \+ 1/);
  assert.match(page, /dashboardLoadVersion\.current !== requestVersion/);
  assert.match(page, /function retryDashboard\(\)/);
  assert.match(page, /disabled=\{dashboardLoading\} aria-busy=\{dashboardLoading\}/);
  assert.match(page, /settingsReadVersion\.current !== readVersion/);
  assert.match(page, /if \(!isCurrentAction\(action\)\) return;/);
});
