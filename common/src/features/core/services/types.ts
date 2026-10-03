/** Severity of a log entry, from least to most severe. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Details of a log entry. Pass an `Error` as a value to keep its stack. */
export type LogFields = Record<string, unknown>;

export interface LogEntry {
  level: LogLevel;
  message: string;
  fields?: LogFields;
}

/**
 * Core Service for diagnostic output. A caller describes what happened. The
 * implementation decides where the entry goes and in which format.
 */
export interface LoggerServiceInterface {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}
