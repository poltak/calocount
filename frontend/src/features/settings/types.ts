import type { EventEmitter } from "@app/common/features/core/events/event-emitter";

/** Sent after the owner saved the targets, so that the dashboard reads them again. */
export type SettingsEvent = { type: "settingsSaved"; message: string };

export type SettingsEvents = Pick<EventEmitter<SettingsEvent>, "listen">;
