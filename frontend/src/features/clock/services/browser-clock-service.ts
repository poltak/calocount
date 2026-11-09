import type { ClockServiceInterface } from "./types.js";

export class BrowserClockService implements ClockServiceInterface {
  now(): number {
    return Date.now();
  }

  timeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
}
