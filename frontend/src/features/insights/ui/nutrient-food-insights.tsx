import { FoodScenarioPanel } from "./food-scenario-panel.js";
import { NutrientSourcePanel } from "./nutrient-source-panel.js";

/** The two food panels. */
export function NutrientFoodInsights() {
  return (
    <section
      className="panel nutrient-food-scenarios"
      id="nutrient-food-scenarios"
      aria-labelledby="nutrient-food-scenarios-title"
    >
      <div className="nutrient-food-scenarios__title">
        <h2 id="nutrient-food-scenarios-title">Nutrition food insights</h2>
        <p>
          Use recorded food portions to explore practical nutrient changes and
          see which foods supply the nutrients you track.
        </p>
      </div>
      <div className="nutrient-food-scenarios__panels">
        <FoodScenarioPanel />
        <NutrientSourcePanel />
      </div>
    </section>
  );
}
