import { serve } from "@hono/node-server";
import { readLiveConfig } from "../live/config.js";
import { createApp } from "../live/index.js";
import { createHttpApp } from "./http-app.js";
import { initializeLogic } from "../logic/lifecycle.js";

const config = readLiveConfig();
const app = createApp({ config });
const { logger } = app.services;

try {
  await initializeLogic({ logic: app.logic });
} catch (error) {
  await app.close();
  throw error;
}

const httpApp = createHttpApp({ app });
const server = serve(
  {
    fetch: httpApp.fetch,
    hostname: config.server.host,
    port: config.server.port,
  },
  (info) => {
    logger.info("Server listening", {
      url: `http://${info.address}:${info.port}`,
    });
  },
);

let closing: Promise<void> | undefined;
function shutdown() {
  closing ??= new Promise<void>((resolve) => {
    server.close(() => resolve());
  }).then(() => app.close());
  void closing.catch((error) => {
    logger.error("Shutdown failed", { error });
    process.exitCode = 1;
  });
}

server.once("error", (error) => {
  logger.error("Server failed", { error });
  process.exitCode = 1;
  shutdown();
});
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
