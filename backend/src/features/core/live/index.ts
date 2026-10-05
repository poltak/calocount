import { ConsoleLoggerService } from "@app/common/features/core/services/console-logger-service";
import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import { JsonLoggerService } from "../services/json-logger-service.js";
import type { App } from "../types.js";
import { readLiveConfig, type LiveConfig } from "./config.js";

export function createApp({
  config = readLiveConfig(),
}: { config?: LiveConfig } = {}): App {
  const logger =
    config.log.format === "json"
      ? new JsonLoggerService({ minLevel: config.log.level })
      : new ConsoleLoggerService({ minLevel: config.log.level });
  const db = createDatabase({ connectionString: config.databaseUrl, logger });
  return composeApp({
    db,
    accountPolicy: config.accountPolicy,
    services: {
      logger,
      auth: new BetterAuthService({ db, logger, ...config.auth }),
    },
  });
}
