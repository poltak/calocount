/** Cloudflare Worker entry point for the Calocount app. */
import handler from "vinext/server/app-router-entry";

import type { CleanupBucket } from "./photo-cleanup";
import { runScheduledPhotoCleanup } from "./scheduled";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },

  /** The hourly cron trigger removes unlinked meal photos. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runScheduledPhotoCleanup({ DB: env.DB, PHOTOS: env.PHOTOS as unknown as CleanupBucket });
  },
} satisfies ExportedHandler<Env>;

export default worker;
