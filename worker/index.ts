/** Cloudflare Worker entry point for the Calocount app. */
import type { CleanupBucket } from "./photo-cleanup";
import { renderNotFound, renderPage } from "./pages";
import { handleRoute } from "./routes";
import { runScheduledPhotoCleanup } from "./scheduled";

const worker = {
  /** API routes first, then the pages. Static files are served before a request reaches the Worker. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") || "/" : url.pathname;
    const routed = await handleRoute(request, pathname);
    if (routed) return routed;
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const page = renderPage(request, pathname) ?? renderNotFound(request);
    return request.method === "HEAD" ? new Response(null, page) : page;
  },

  /** The hourly cron trigger removes unlinked meal photos. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runScheduledPhotoCleanup({ DB: env.DB, PHOTOS: env.PHOTOS as unknown as CleanupBucket });
  },
} satisfies ExportedHandler<Env>;

export default worker;
