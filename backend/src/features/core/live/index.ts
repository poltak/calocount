import { ConsoleLoggerService } from "@app/common/features/core/services/console-logger-service";
import { composeApp } from "../compose-app.js";
import { createDatabase } from "../database/postgres-database.js";
import { BetterAuthService } from "../../auth/services/better-auth-service.js";
import { JsonLoggerService } from "../services/json-logger-service.js";
import type { App } from "../types.js";
import { readDatabaseUrl, readLiveConfig, type LiveConfig } from "./config.js";

export function createApp({
  config = readLiveConfig(),
  databaseUrl = readDatabaseUrl(),
}: { config?: LiveConfig; databaseUrl?: string } = {}): App {
  const logger =
    config.log.format === "json"
      ? new JsonLoggerService({ minLevel: config.log.level })
      : new ConsoleLoggerService({ minLevel: config.log.level });
  const db = createDatabase({ connectionString: databaseUrl, logger });
  return composeApp({
    db,
    accountPolicy: config.accountPolicy,
    services: {
      logger,
      auth: new BetterAuthService({ db, logger, ...config.auth }),
    },
  });
}
