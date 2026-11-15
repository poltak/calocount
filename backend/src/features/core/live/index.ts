import type { PhotoBucket } from "../../entries/storage/types.js";
import { SimpleWebAuthnService } from "../../auth/services/simple-webauthn-service.js";
import { composeApp } from "../compose-app.js";
import type { D1Binding } from "../database/d1-binding.js";
import { createDatabase } from "../database/database.js";
import {
  CloudflareImagesService,
  type ImagesBinding,
} from "../services/cloudflare-images-service.js";
import { FetchPhotoDownloadService } from "../services/fetch-photo-download-service.js";
import { JsonLoggerService } from "../services/json-logger-service.js";
import { SystemClockService } from "../services/system-clock-service.js";
import type { App } from "../types.js";
import { readLiveConfig, readLogLevel, type WorkerVars } from "./config.js";

/** What the Worker receives from its config and its secrets. */
export interface WorkerEnvironment extends WorkerVars {
  DB: D1Binding;
  /** The R2 bucket of the entry photos. */
  PHOTOS: PhotoBucket;
  /** The Images binding. A plain `wrangler dev` may not have it, and then HEIC photos are refused. */
  IMAGES?: ImagesBinding | undefined;
}

/**
 * The App of one isolate. It holds bindings and plain values, and it opens
 * nothing. Workers forbid an I/O object that outlives its request, so no class
 * may keep a stream, a socket, or a response between requests.
 */
export function createApp({
  env,
  writeLogLine,
}: {
  env: WorkerEnvironment;
  /** The Worker entry gives `console.log`, the one place that may name it. */
  writeLogLine: (line: string) => void;
}): App {
  const binding = env.DB;
  return composeApp({
    binding,
    db: createDatabase({ binding }),
    photoBucket: env.PHOTOS,
    config: readLiveConfig(env),
    services: {
      logger: new JsonLoggerService({
        minLevel: readLogLevel(env),
        write: writeLogLine,
      }),
      clock: new SystemClockService(),
      passkeys: new SimpleWebAuthnService(),
      images: new CloudflareImagesService(env.IMAGES),
      photoDownload: new FetchPhotoDownloadService(),
    },
  });
}
