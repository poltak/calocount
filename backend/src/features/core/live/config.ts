import type { LogLevel } from "@app/common/features/core/services/types";
import { LOG_LEVELS } from "@app/common/features/core/utils/log-level";
import type { AppConfig } from "../types.js";

/** The vars of the Worker and its secrets. All are text. */
export type WorkerVars = Partial<Record<WorkerVarName, string>>;

type WorkerVarName =
  | "CALOCOUNT_OWNER_KEY"
  | "CALOCOUNT_SETUP_CODE"
  | "CALOCOUNT_BLACK_BOX"
  | "LOG_LEVEL";

/** The key of the owner's rows when the Worker sets none, as in the old app. */
const DEFAULT_OWNER_KEY = "default";

function nonEmpty(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

/** Read the vars and secrets of the Worker, and apply the defaults. */
export function readLiveConfig(vars: WorkerVars): AppConfig {
  return {
    ownerKey: nonEmpty(vars.CALOCOUNT_OWNER_KEY) ?? DEFAULT_OWNER_KEY,
    setupCode: nonEmpty(vars.CALOCOUNT_SETUP_CODE) ?? "",
    trustedOrigins: [],
    blackBox: vars.CALOCOUNT_BLACK_BOX === "true",
  };
}

export function readLogLevel(vars: WorkerVars): LogLevel {
  const level = vars.LOG_LEVEL as LogLevel | undefined;
  return level && LOG_LEVELS.includes(level) ? level : "info";
}
