/** The API routes of the Worker. A route file loads when the first request for it arrives. */

type RouteParams = Record<string, string | string[]>;
type RouteHandler = (request: Request, context: { params: RouteParams }) => Response | Promise<Response>;
type RouteModule = Partial<Record<string, RouteHandler>>;

type Route = {
  pattern: RegExp;
  /** The parameter names, in order. A name that starts with `*` takes the remaining segments. */
  names: string[];
  load: () => Promise<RouteModule>;
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/** Describe a path such as `/api/meals/:id` or `/api/photos/*key`. */
function route(path: string, load: () => Promise<unknown>): Route {
  const names: string[] = [];
  const pattern = path.replace(/\./g, "\\.").replace(/[:*]([A-Za-z]+)/g, (match, name: string) => {
    names.push(match[0] === "*" ? `*${name}` : name);
    return match[0] === "*" ? "(.+)" : "([^/]+)";
  });
  return { pattern: new RegExp(`^${pattern}$`), names, load: load as () => Promise<RouteModule> };
}

const routes: Route[] = [
  route("/.well-known/oauth-authorization-server", () => import("../app/oauth/authorization-server/route")),
  route("/.well-known/oauth-protected-resource", () => import("../app/oauth/protected-resource/route")),
  route("/.well-known/oauth-protected-resource/mcp", () => import("../app/oauth/protected-resource/route")),
  route("/api/add-meal", () => import("../app/api/add-meal/route")),
  route("/api/auth/connections", () => import("../app/api/auth/connections/route")),
  route("/api/auth/connections/:id", () => import("../app/api/auth/connections/[id]/route")),
  route("/api/auth/login/options", () => import("../app/api/auth/login/options/route")),
  route("/api/auth/login/verify", () => import("../app/api/auth/login/verify/route")),
  route("/api/auth/logout", () => import("../app/api/auth/logout/route")),
  route("/api/auth/passkeys", () => import("../app/api/auth/passkeys/route")),
  route("/api/auth/passkeys/:id", () => import("../app/api/auth/passkeys/[id]/route")),
  route("/api/auth/register/options", () => import("../app/api/auth/register/options/route")),
  route("/api/auth/register/verify", () => import("../app/api/auth/register/verify/route")),
  route("/api/auth/status", () => import("../app/api/auth/status/route")),
  route("/api/dashboard/summary", () => import("../app/api/dashboard/summary/route")),
  route("/api/days", () => import("../app/api/days/route")),
  route("/api/days/:date", () => import("../app/api/days/[date]/route")),
  route("/api/export", () => import("../app/api/export/route")),
  route("/api/meals", () => import("../app/api/meals/route")),
  route("/api/meals/:id", () => import("../app/api/meals/[id]/route")),
  route("/api/meals/:id/copy", () => import("../app/api/meals/[id]/copy/route")),
  route("/api/meals/:id/corrections", () => import("../app/api/meals/[id]/corrections/route")),
  route("/api/photos/*key", () => import("../app/api/photos/[...key]/route")),
  route("/api/public/summary", () => import("../app/api/public/summary/route")),
  route("/api/saved-entries", () => import("../app/api/saved-entries/route")),
  route("/api/saved-entries/:id", () => import("../app/api/saved-entries/[id]/route")),
  route("/api/saved-entries/:id/track", () => import("../app/api/saved-entries/[id]/track/route")),
  route("/api/settings", () => import("../app/api/settings/route")),
  route("/api/weights", () => import("../app/api/weights/route")),
  route("/mcp", () => import("../app/mcp/route")),
  route("/meal-photos/:id", () => import("../app/meal-photos/[id]/route")),
  route("/oauth/authorize", () => import("../app/oauth/authorize/route")),
  route("/oauth/register", () => import("../app/oauth/register/route")),
  route("/oauth/token", () => import("../app/oauth/token/route")),
];

function readParams(names: string[], values: string[]): RouteParams | null {
  const params: RouteParams = {};
  try {
    names.forEach((name, index) => {
      if (name.startsWith("*")) params[name.slice(1)] = values[index].split("/").map(decodeURIComponent);
      else params[name] = decodeURIComponent(values[index]);
    });
  } catch {
    return null;
  }
  return params;
}

/** Answer a request for an API route. Returns null when no route has the path. */
export async function handleRoute(request: Request, pathname: string): Promise<Response | null> {
  for (const { pattern, names, load } of routes) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    const params = readParams(names, match.slice(1));
    if (!params) return new Response("Bad Request", { status: 400 });
    const handlers = await load();
    const method = request.method === "HEAD" ? "GET" : request.method;
    const handler = (METHODS as readonly string[]).includes(method) ? handlers[method] : undefined;
    if (!handler) {
      const allow = [...METHODS.filter((name) => name !== "OPTIONS" && handlers[name]), ...(handlers.GET ? ["HEAD"] : []), "OPTIONS"].join(", ");
      const options = request.method === "OPTIONS";
      return new Response(options ? null : "Method Not Allowed", { status: options ? 204 : 405, headers: { allow } });
    }
    const response = await handler(request, { params });
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
  return null;
}
