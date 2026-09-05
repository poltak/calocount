import {
  cleanupUnlinkedMealPhotos,
  type CleanupBucket,
} from "./photo-cleanup";

export type IngestEnvironment = Pick<IngestEnv, "DB"> & {
  readonly MEAL_PHOTOS: CleanupBucket;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function handleScheduled(env: IngestEnvironment): Promise<void> {
  try {
    const cleanup = await cleanupUnlinkedMealPhotos({
      bucket: env.MEAL_PHOTOS,
      db: env.DB,
    });
    console.log(JSON.stringify({ event: "meal_photo_cleanup", ...cleanup }));
  } catch {
    console.error(JSON.stringify({ event: "meal_photo_cleanup_error", code: "cleanup_failed" }));
  }
}

export const ingestWorker = {
  async fetch(request: Request, _env: IngestEnvironment, _ctx: ExecutionContext): Promise<Response> {
    void _env;
    void _ctx;
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz" && request.method === "GET") {
      return jsonResponse({ ok: true });
    }
    // Retired webhook and signed-media paths intentionally fall through here.
    return jsonResponse({ error: "not_found" }, 404);
  },

  async scheduled(
    _controller: ScheduledController,
    env: IngestEnvironment,
    _ctx: ExecutionContext,
  ): Promise<void> {
    void _controller;
    void _ctx;
    await handleScheduled(env);
  },
};

export default ingestWorker;
