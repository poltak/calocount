import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard includes the collapsible detailed nutrition views and navigation", async () => {
  const [page, overview] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/nutrition-overview.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /NutritionOverview/);
  assert.match(page, /NutrientTrendPanel/);
  assert.match(page, /MealNutritionDetails/);
  assert.match(page, /MealNutritionEditor/);
  assert.match(page, /activeSection === "nutrition"/);
  assert.match(page, /href="#nutrition"/);
  assert.match(page, /summary\.nutrition\?\.byDate/);
  assert.doesNotMatch(page, /!publicView \? <a[^>]+href="#nutrition"/);
  assert.doesNotMatch(page, /!publicView \? <MealNutritionDetails/);
  assert.match(page, /<a className=\{activeSection === "nutrition"/);
  assert.match(page, /<MealNutritionDetails/);
  assert.match(page, /goals=\{targets\.nutrients\}/);
  assert.match(page, /requestAnimationFrame\(\(\) => \{/);
  assert.match(page, /readNutritionCollapsed\(window\.localStorage\)/);
  assert.match(page, /writeNutritionCollapsed\(window\.localStorage, next\)/);
  assert.match(page, /collapsed=\{nutritionCollapsed\}/);
  const overviewStart = page.indexOf("<NutritionOverview");
  const trendInsideOverview = page.indexOf("<NutrientTrendPanel", overviewStart);
  const overviewEnd = page.indexOf("</NutritionOverview>", trendInsideOverview);
  assert.ok(overviewStart >= 0 && trendInsideOverview > overviewStart && overviewEnd > trendInsideOverview, "nutrient trend must be inside the collapsible Nutrition section");
  assert.match(overview, /aria-expanded=\{!collapsed\}/);
  assert.match(overview, /aria-controls="nutrition-details-content"/);
  assert.match(overview, /id="nutrition-details-content" hidden=\{collapsed\}/);
});

test("meal saves preserve serialized item breakdowns and nullable nutrients", async () => {
  const [page, editor, details] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/meal-nutrition-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/meal-nutrition-details.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /items: meal\.items\.length > 0 \? meal\.items\.map/);
  assert.match(page, /const nutrients = nutrientValuesFromForm\(form\)/);
  assert.match(page, /nutrients,\n\s+source: "dashboard"/);
  assert.match(editor, /Leave blank if unknown/);
  assert.match(editor, /current === null \|\| current === undefined/);
  assert.match(editor, /step="any"/);
  assert.match(details, /Partial/);
  assert.match(details, /Food items/);
});

test("nutrition trend and mobile layout keep unknown values visible", async () => {
  const [trend, css] = await Promise.all([
    readFile(new URL("../app/nutrition/nutrient-trend-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(trend, /missing days are shown as gaps/);
  assert.match(trend, /coverage\.knownDays/);
  assert.match(trend, /optgroup/);
  assert.match(css, /\.nutrient-trend-column\.missing/);
  assert.match(css, /\.advanced-nutrition-editor/);
  assert.match(css, /\.meal-item-nutrients/);
  assert.match(css, /\.nutrient-stat\.has-goal-progress::before/);
  assert.match(css, /\.nutrient-trend-goal-line/);
  assert.match(css, /\.nutrient-goal-settings/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test("settings separate primary goals from optional nutrition goals", async () => {
  const [page, settings, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nutrition/nutrient-goal-settings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Primary goals/);
  assert.match(page, /daily-calorie-target" type="number" min="10"[^>]+step="10"/);
  assert.match(page, /<NutrientGoalSettings/);
  assert.match(page, /nutrientTargets: nutrientTargetOverrides/);
  assert.match(settings, /<details className="nutrient-goal-settings">/);
  assert.match(settings, /Restore recommended defaults/);
  assert.match(settings, /Blank a field to turn that goal off/);
  assert.match(settings, /min=\{inputStep\}/);
  assert.match(settings, /step=\{inputStep\}/);
  assert.match(route, /nutrientTargets must be an object or null/);
  assert.match(route, /nutrientTargets\.\$\{key\} is not supported/);
  assert.match(route, /must be greater than zero or null/);
});
