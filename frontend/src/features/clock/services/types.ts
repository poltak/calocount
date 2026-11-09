/** The time and the timezone of the device. A test root gives a clock that it can move. */
export interface ClockServiceInterface {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  /** The IANA timezone of the device, such as `Europe/Berlin`. */
  timeZone(): string;
}
