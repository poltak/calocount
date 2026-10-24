/** Cloudflare Worker entry point for the Calocount app. */
import type { CleanupBucket } from "./photo-cleanup";
import { renderNotFound, renderPage } from "./pages";
import { handleRoute } from "./routes";
import { runScheduledPhotoCleanup } from "./scheduled";

/**
 * The public view setting of the configured owner. Null when the owner key or
 * the database is missing; the public data routes fail closed then. One plain
 * query, so the pages do not load the repository code.
 */
async function readPublicView(env: Env): Promise<boolean | null> {
  const ownerKey = env.CALOCOUNT_OWNER_KEY?.trim();
  if (!ownerKey || !env.DB) return null;
  try {
    const row = await env.DB.prepare("SELECT public_view_enabled FROM settings WHERE owner_key = ? LIMIT 1")
      .bind(ownerKey).first<{ public_view_enabled: number }>();
    return row?.public_view_enabled === 1;
  } catch {
    return null;
  }
}

/**
 * `/` and `/llms.txt` exist for the public view, so they answer only while the
 * owner shows it. Returns null when the page renders as usual.
 */
async function gatePublicPage(request: Request, pathname: string, env: Env): Promise<Response | null> {
  if (pathname !== "/" && pathname !== "/llms.txt") return null;
  const enabled = await readPublicView(env);
  if (pathname === "/llms.txt") return enabled ? env.ASSETS.fetch(request) : renderNotFound(request);
  // When the setting cannot be read, the public page shows the error of its data route.
  if (enabled !== false) return null;
  return new Response(null, { status: 302, headers: { location: "/owner", "cache-control": "no-store" } });
}

const worker = {
  /** API routes first, then the pages. Static files are served before a request reaches the Worker. */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") || "/" : url.pathname;
    const routed = await handleRoute(request, pathname);
    if (routed) return routed;
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const page = await gatePublicPage(request, pathname, env) ?? renderPage(request, pathname) ?? renderNotFound(request);
    return request.method === "HEAD" ? new Response(null, page) : page;
  },

  /** The hourly cron trigger removes unlinked meal photos. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await runScheduledPhotoCleanup({ DB: env.DB, PHOTOS: env.PHOTOS as unknown as CleanupBucket });
  },
} satisfies ExportedHandler<Env>;

export default worker;
