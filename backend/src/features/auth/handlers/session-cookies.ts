import type { Context } from "hono";

export function applySessionCookies(context: Context, headers: Headers): void {
  for (const cookie of headers.getSetCookie()) {
    context.header("set-cookie", cookie, { append: true });
  }
}
