import type { ClockServiceInterface } from "./types.js";

/** Follows the real clock, plus each `advance`, so that a test can pass a limit in time. */
export class FakeClockService implements ClockServiceInterface {
  private offsetMs = 0;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }
}
