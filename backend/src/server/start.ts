import { serve } from "@hono/node-server";
import { z } from "zod";
import { createApp } from "../live/index.js";
import { createHttpApp } from "./http-app.js";
import { initializeLogic } from "../logic/lifecycle.js";

const environmentSchema = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
});
const environment = environmentSchema.parse(process.env);
const app = createApp();

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
    hostname: environment.HOST,
    port: environment.PORT,
  },
  (info) => {
    console.log(`Shadow API listening at http://${info.address}:${info.port}`);
  },
);

let closing: Promise<void> | undefined;
function shutdown() {
  closing ??= new Promise<void>((resolve) => {
    server.close(() => resolve());
  }).then(() => app.close());
  void closing.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

server.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
  shutdown();
});
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
