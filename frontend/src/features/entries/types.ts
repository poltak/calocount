import type { EventEmitter } from "@app/common/features/core/events/event-emitter";
import type { TrendRange } from "../core/utils/trend-range.js";

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
  /** The days of the weight trend, oldest first: the last 7 or 30 days. */
  trendDates: string[];
  trendWeights: { logicalDate: string; weightKg: number }[];
  trendRange: TrendRange;
  onTrendRangeChange: (range: TrendRange) => void;
}

/**
 * What the dashboard gives the calendar of the history feature: the day in
 * view, and a key that changes when the entries may have changed.
 */
export interface CalendarSlotProps {
  /** Today, in the timezone of the device. */
  today: string;
  /** The month to show first. It stays the same while the calendar is open. */
  initialMonth: string;
  selectedDate: string;
  /** Changes when entries can be different, so the calendar reads its month again. */
  reloadKey: number;
  /** True while a change or a read runs. */
  disabled: boolean;
  onSelectDate: (date: string) => void;
  onClose: () => void;
  /** Whose days the calendar reads. The default is the owner's. */
  source?: "owner" | "public";
}
