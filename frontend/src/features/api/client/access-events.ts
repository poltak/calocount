import type { EventEmitter } from "@app/common/features/core/events/event-emitter";
export type ApiAccessEvent = { type: "sessionRejected" };
export type ApiAccessEvents = Pick<EventEmitter<ApiAccessEvent>, "listen">;
