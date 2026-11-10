import type { EventEmitter } from "@app/common/features/core/events/event-emitter";

/**
 * Sent after the owner changed the entries or the saved entries, so that the
 * dashboard reads them again. `message` is the confirmation for the owner, and
 * `date` is the day to show next.
 */
export type EntryEvent =
  | { type: "entriesChanged"; message: string; date?: string }
  | { type: "savedEntriesChanged"; message: string };

export type EntryEvents = Pick<EventEmitter<EntryEvent>, "listen">;

/**
 * What the dashboard gives the weight panels of the weights feature: the days
 * in view, the weights of those days, and the weight of the selected day.
 */
export interface WeightSlotProps {
  /** The recent days, oldest first. */
  dates: string[];
  weights: { logicalDate: string; weightKg: number }[];
  selectedDate: string | null;
  weight: { weightKg: number; recordedAt: number } | null;
  timeZone: string;
  /** True while a change or a read runs. */
  busy: boolean;
}
