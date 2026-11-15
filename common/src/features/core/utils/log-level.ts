import type { LogLevel } from "../services/types.js";

/** Every log level, from least to most severe. */
export const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
] as const satisfies readonly LogLevel[];

export function isLogLevelEnabled({
  level,
  minLevel,
}: {
  level: LogLevel;
  minLevel: LogLevel;
}): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minLevel);
}
