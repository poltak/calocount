import { isLogLevelEnabled } from "../utils/log-level.js";
import type {
  LogEntry,
  LogFields,
  LoggerServiceInterface,
  LogLevel,
} from "./types.js";

interface ConsoleLoggerServiceDeps {
  minLevel: LogLevel;
}

/** Readable lines on the console, for development and for the browser. */
export class ConsoleLoggerService implements LoggerServiceInterface {
  constructor(private readonly deps: ConsoleLoggerServiceDeps) {}

  debug(message: string, fields?: LogFields): void {
    this.write({ level: "debug", message, fields });
  }

  info(message: string, fields?: LogFields): void {
    this.write({ level: "info", message, fields });
  }

  warn(message: string, fields?: LogFields): void {
    this.write({ level: "warn", message, fields });
  }

  error(message: string, fields?: LogFields): void {
    this.write({ level: "error", message, fields });
  }

  private write({ level, message, fields }: LogEntry): void {
    if (!isLogLevelEnabled({ level, minLevel: this.deps.minLevel })) {
      return;
    }

    // Plain values go on the line itself, as `key=value`. Objects and errors go
    // to the console as they are, because it prints them in a readable form.
    const words = [level.toUpperCase(), message];
    const objects: LogFields = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (value !== null && typeof value === "object") {
        objects[key] = value;
      } else {
        words.push(`${key}=${String(value)}`);
      }
    }

    if (Object.keys(objects).length > 0) {
      console[level](words.join(" "), objects);
    } else {
      console[level](words.join(" "));
    }
  }
}
