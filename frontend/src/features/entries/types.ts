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
