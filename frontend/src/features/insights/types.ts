import type { Audience } from "../core/logic/types.js";
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
  /** A visitor reads the public mirror of the insights. */
  audience: Audience;
  /**
   * Open an entry of the insights in the editor of the dashboard. The owner
   * dashboard gives it. Without it, the panels show no "Inspect entry" button.
   */
  onInspectEntry?: (input: { entryId: string; date: string }) => void;
}
