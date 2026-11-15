/** The session cookie of a passkey sign-in. */

/** Browsers keep a cookie for at most 400 days. The server ends an unused session earlier. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** The `__Host-` prefix needs HTTPS. Local development on http://localhost uses a plain name. */
function sessionCookieName(url: URL): string {
  return url.protocol === "https:"
    ? "__Host-calocount_session"
    : "calocount_session";
}

/** The token in the cookie, or `null`. Anything that is not base64url is not a token of this app. */
export function readSessionToken({
  request,
}: {
  request: Request;
}): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  const name = sessionCookieName(new URL(request.url));
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
  }
  return null;
}

export function sessionCookie({
  url,
  token,
}: {
  url: URL;
  token: string;
}): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}${secure}`;
}

export function clearedSessionCookie({ url }: { url: URL }): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName(url)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
