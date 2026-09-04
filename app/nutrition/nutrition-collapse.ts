export const NUTRITION_COLLAPSED_STORAGE_KEY = "calocount:nutrition-collapsed";

type NutritionCollapseStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function readNutritionCollapsed(storage: NutritionCollapseStorage): boolean {
  try {
    return storage.getItem(NUTRITION_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeNutritionCollapsed(storage: NutritionCollapseStorage, collapsed: boolean): void {
  try {
    storage.setItem(NUTRITION_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Keep the dashboard usable when browser storage is unavailable.
  }
}
