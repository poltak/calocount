import type { EventEmitter } from "@app/common/features/core/events/event-emitter";
import type { Audience } from "../core/logic/types.js";
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
 * What the dashboard gives the weight trend of the weights feature: the days
 * of the chart, the weight of the day in view, and the owner's form request.
 */
export interface WeightSlotProps {
  selectedDate: string | null;
  /** The weight of the day in view. */
  weight: { weightKg: number; recordedAt: number } | null;
  /** True while a change or a read runs. */
  busy: boolean;
  /** The days of the weight trend, oldest first: the last 7 or 30 days, or every day from the first weight. */
  trendDates: string[];
  trendWeights: { logicalDate: string; weightKg: number }[];
  trendRange: TrendRange;
  /** True when the trend shows every day from the first weight. */
  weightAllTime: boolean;
  onTrendRangeChange: (range: TrendRange) => void;
  onAllTime: () => void;
  /** A visitor reads the weights and changes none. */
  audience: Audience;
  /** Changes each time the owner asks for the weight form, such as with "Record weight". */
  openFormRequest: number;
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
  /** Whose days the calendar reads. A visitor reads the public mirror, in the owner's saved timezone. */
  audience: Audience;
}
