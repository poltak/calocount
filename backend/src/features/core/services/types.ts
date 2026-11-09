/** The time, as a Core Service, so that a test can move it. */
export interface ClockServiceInterface {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}
