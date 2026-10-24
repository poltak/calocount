import { OAuthError } from "../auth/oauth";
import { readBoundedBytes } from "../api/_lib/bounded-read";
import { ApiError, isPasskeyAuth } from "../api/_lib/http";

const MAX_FORM_BYTES = 20_000;

/** Read a small request body as text, or null when it is larger than `maxBytes`. Nothing larger reaches memory. */
export async function readSmallText(request: Request, maxBytes = MAX_FORM_BYTES): Promise<string | null> {
  if (!request.body) return "";
  const bytes = await readBoundedBytes(request.body, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

// OAuth endpoints answer in the format of RFC 6749 and allow requests from any
// origin. They use no cookies, so browser-based MCP tools can call them.

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function oauthJson(body: unknown, { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache", ...CORS_HEADERS, ...headers },
  });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** The OAuth endpoints exist only when passkeys protect this instance. Access mode uses Access for MCP sign-in. */
export function requireOAuth(): void {
  if (!isPasskeyAuth()) throw new OAuthError(404, "not_found", "OAuth is off for this instance.");
}

export async function withOAuthErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof OAuthError) {
      const headers: Record<string, string> = error.error === "invalid_client" && error.status === 401
        ? { "www-authenticate": 'Basic realm="calocount"' }
        : {};
      return oauthJson({ error: error.error, error_description: error.description }, { status: error.status, headers });
    }
    if (error instanceof ApiError) {
      return oauthJson({ error: error.status >= 500 ? "temporarily_unavailable" : "invalid_request", error_description: error.message }, { status: error.status });
    }
    console.error("calocount oauth error", error);
    return oauthJson({ error: "server_error", error_description: "The request could not be completed." }, { status: 500 });
  }
}

/** Read a small form body. The token endpoint also accepts JSON, which some clients send. */
export async function readFormBody(request: Request): Promise<URLSearchParams> {
  const text = await readSmallText(request);
  if (text === null) throw new OAuthError(413, "invalid_request", "The request is too large.");
  if (request.headers.get("content-type")?.includes("application/json")) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new OAuthError(400, "invalid_request", "The request body is not valid JSON.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new OAuthError(400, "invalid_request", "The request body must be an object.");
    return new URLSearchParams(Object.entries(value).filter(([, item]) => typeof item === "string") as [string, string][]);
  }
  return new URLSearchParams(text);
}
