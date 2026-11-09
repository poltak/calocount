import type { LogEntry, LogFields, LoggerServiceInterface } from "./types.js";

/**
 * Keeps every entry in memory. Tests use it to assert on what the application
 * logged, and to keep the test output free of log lines.
 */
export class MemoryLoggerService implements LoggerServiceInterface {
  readonly entries: LogEntry[] = [];

  debug(message: string, fields?: LogFields): void {
    this.entries.push({ level: "debug", message, fields });
  }

  info(message: string, fields?: LogFields): void {
    this.entries.push({ level: "info", message, fields });
  }

  warn(message: string, fields?: LogFields): void {
    this.entries.push({ level: "warn", message, fields });
  }

  error(message: string, fields?: LogFields): void {
    this.entries.push({ level: "error", message, fields });
  }
}
