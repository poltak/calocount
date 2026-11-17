import type { BrowserKeyValueStore } from "../../core/storage/types.js";

/**
 * A new key. The old app stored "collapsed", and the details were open by
 * default. They are closed by default now, so an old value must not count.
 */
const NUTRITION_DETAILS_OPEN_KEY = "calocount:nutrition-details-open";

interface EntriesStorageProps {
  store: BrowserKeyValueStore;
}

/** What the dashboard remembers in the browser. */
export class EntriesStorage {
  constructor(private readonly deps: EntriesStorageProps) {}

  readNutritionOpen(): boolean {
    try {
      return this.deps.store.getItem(NUTRITION_DETAILS_OPEN_KEY) === "true";
    } catch {
      // The dashboard stays usable when the browser blocks its storage.
      return false;
    }
  }

  writeNutritionOpen({ open }: { open: boolean }): void {
    try {
      this.deps.store.setItem(NUTRITION_DETAILS_OPEN_KEY, String(open));
    } catch {
      // As above: the choice lasts until the page closes.
    }
  }
}
