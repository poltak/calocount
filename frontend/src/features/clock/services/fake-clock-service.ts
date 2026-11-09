import type { ClockServiceInterface } from "./types.js";

/**
 * Follows the real clock, plus each `advance`, in the UTC timezone unless a
 * test picks another. The test backend follows the real clock too, so both
 * sides name the same day.
 */
export class FakeClockService implements ClockServiceInterface {
  private offsetMs = 0;
  private zone = "UTC";

  now(): number {
    return Date.now() + this.offsetMs;
  }

  timeZone(): string {
    return this.zone;
  }

  useTimeZone(timeZone: string): void {
    this.zone = timeZone;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }
}
