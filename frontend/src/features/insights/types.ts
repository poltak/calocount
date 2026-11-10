import type { EntryEvents } from "../entries/types.js";
import type { SettingsEvents } from "../settings/types.js";
import type { WeightEvents } from "../weights/types.js";

/**
 * What the dashboard gives the insight panels: the events after which they
 * read again. The route composes them, because a feature cannot import the
 * private files of another feature.
 */
export interface InsightsSlotProps {
  entryEvents: readonly EntryEvents[];
  settingsEvents: readonly SettingsEvents[];
  weightEvents: readonly WeightEvents[];
}
