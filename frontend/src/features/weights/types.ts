import type { EventEmitter } from "@app/common/features/core/events/event-emitter";

/** Sent after the owner saved a weight, so that the dashboard reads it again. */
export type WeightEvent = { type: "weightSaved"; message: string };

export type WeightEvents = Pick<EventEmitter<WeightEvent>, "listen">;
