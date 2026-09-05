export const NUTRITION_COLLAPSED_STORAGE_KEY = "calocount:nutrition-collapsed";

type NutritionCollapseStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type StorageSource = NutritionCollapseStorage | (() => NutritionCollapseStorage);

export function readNutritionCollapsed(storage: StorageSource): boolean {
  try {
    const resolved = typeof storage === "function" ? storage() : storage;
    return resolved.getItem(NUTRITION_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeNutritionCollapsed(storage: StorageSource, collapsed: boolean): void {
  try {
    const resolved = typeof storage === "function" ? storage() : storage;
    resolved.setItem(NUTRITION_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Keep the dashboard usable when browser storage is unavailable.
  }
}
