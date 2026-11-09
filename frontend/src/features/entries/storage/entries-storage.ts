import type { BrowserKeyValueStore } from "../../core/storage/types.js";

/** Same key as the old app, so a saved choice survives the move. */
const NUTRITION_COLLAPSED_KEY = "calocount:nutrition-collapsed";

interface EntriesStorageProps {
  store: BrowserKeyValueStore;
}

/** What the dashboard remembers in the browser. */
export class EntriesStorage {
  constructor(private readonly deps: EntriesStorageProps) {}

  readNutritionCollapsed(): boolean {
    try {
      return this.deps.store.getItem(NUTRITION_COLLAPSED_KEY) === "true";
    } catch {
      // The dashboard stays usable when the browser blocks its storage.
      return false;
    }
  }

  writeNutritionCollapsed({ collapsed }: { collapsed: boolean }): void {
    try {
      this.deps.store.setItem(NUTRITION_COLLAPSED_KEY, String(collapsed));
    } catch {
      // As above: the choice lasts until the page closes.
    }
  }
}
