import type { EventEmitter } from "@app/common/features/core/events/event-emitter";

/** Sent when the user signs out. A session that the backend ends sends nothing. */
export type AuthEvent = { type: "signedOut" };

export type AuthEvents = Pick<EventEmitter<AuthEvent>, "listen">;
