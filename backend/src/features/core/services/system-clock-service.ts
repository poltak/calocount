import type { ClockServiceInterface } from "./types.js";

export class SystemClockService implements ClockServiceInterface {
  now(): number {
    return Date.now();
  }
}
