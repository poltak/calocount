import type {
  LogEntry,
  LogFields,
  LoggerServiceInterface,
  LogLevel,
} from "@app/common/features/core/services/types";
import { isLogLevelEnabled } from "@app/common/features/core/utils/log-level";

interface JsonLoggerServiceDeps {
  minLevel: LogLevel;
}

/**
 * One JSON object on each line of standard output, for hosts that collect and
 * search logs.
 */
export class JsonLoggerService implements LoggerServiceInterface {
  constructor(private readonly deps: JsonLoggerServiceDeps) {}

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

    // The fixed keys come first in the line and win over fields of the same name.
    const fixed = { time: new Date().toISOString(), level, message };
    let line: string;
    try {
      line = JSON.stringify({ ...fixed, ...fields, ...fixed }, serializeValue);
    } catch (error) {
      // A logger must not throw. Fields with a circular reference cannot be written.
      line = JSON.stringify({ ...fixed, fieldsError: String(error) });
    }
    process.stdout.write(`${line}\n`);
  }
}

/** `JSON.stringify` writes an `Error` as `{}` and throws on a `bigint`. */
function serializeValue(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause,
      ...(value instanceof AggregateError ? { errors: value.errors } : {}),
    };
  }
  return value;
}
