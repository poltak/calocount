/** The session cookie of a passkey sign-in. */

/** Browsers keep a cookie for at most 400 days. The server ends an unused session earlier. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** The `__Host-` prefix needs HTTPS. Local development on http://localhost uses a plain name. */
export function sessionCookieName(url: URL): string {
  return url.protocol === "https:" ? "__Host-calocount_session" : "calocount_session";
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    // A session token is base64url. Anything else is not a token of this app.
    return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
  }
  return null;
}

export function readSessionCookie(request: Request): string | null {
  return readCookie(request, sessionCookieName(new URL(request.url)));
}

export function sessionCookie({ url, token }: { url: URL; token: string }): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}${secure}`;
}

export function clearedSessionCookie(url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(url)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A request that changes data with the session cookie must come from a page of
 * this site. SameSite=Lax already stops most cross-site requests; this check
 * also stops the ones that a browser sends from a sibling subdomain.
 */
export function isSameOriginWrite(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
