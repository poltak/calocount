import { Hono, type Context } from "hono";
import { resolveSession } from "./resolve-session.js";
import type { BackendLogic, BackendServices } from "../../core/types.js";
import { OAuthError } from "../utils/oauth-error.js";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from "../utils/oauth-urls.js";
import {
  renderConnectionErrorPage,
  renderConsentPage,
} from "./consent-pages.js";
import type { AuthEnvironment } from "./types.js";

/** The size of the largest body that the OAuth endpoints read. */
const MAX_FORM_BYTES = 20_000;

/**
 * The OAuth endpoints answer in the format of RFC 6749 and allow requests from
 * any origin. They use no cookies, so tools that run in a browser can call them.
 */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

interface OAuthHandlerProps {
  logic: Pick<BackendLogic, "authOAuth" | "authOAuthToken" | "authSession">;
  services: Pick<BackendServices, "logger">;
}

function oauthJson(
  body: unknown,
  {
    status = 200,
    headers = {},
  }: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      pragma: "no-cache",
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** A small body as text, or `null` when it is larger than the limit. Nothing larger stays in memory. */
async function readSmallText(request: Request): Promise<string | null> {
  if (!request.body) {
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_FORM_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** The token endpoint reads a form. It also reads JSON, which some clients send. */
async function readFormBody(request: Request): Promise<URLSearchParams> {
  const text = await readSmallText(request);
  if (text === null) {
    throw new OAuthError(413, "invalid_request", "The request is too large.");
  }
  if (request.headers.get("content-type")?.includes("application/json")) {
    const value = parseJsonObject(text);
    if (!value) {
      throw new OAuthError(
        400,
        "invalid_request",
        "The request body must be a JSON object.",
      );
    }
    return new URLSearchParams(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  return new URLSearchParams(text);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The fields that the consent form posts back. The server checks all of them again. */
function consentFields({
  params,
  clientId,
  redirectUri,
  codeChallenge,
}: {
  params: URLSearchParams;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): Record<string, string> {
  const fields: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  };
  for (const name of ["state", "scope", "resource"]) {
    const value = params.get(name);
    if (value !== null) {
      fields[name] = value;
    }
  }
  return fields;
}

/**
 * The routes outside `/api` for apps that connect to the MCP endpoint: the
 * discovery documents, the registration of a client, the consent page, and
 * the token endpoint. They take no session cookie, except the consent page.
 */
export function createOAuthHandlers({ logic, services }: OAuthHandlerProps) {
  async function withOAuthErrors(
    context: Context<AuthEnvironment>,
    run: () => Promise<Response>,
  ): Promise<Response> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof OAuthError) {
        return oauthJson(
          { error: error.error, error_description: error.description },
          {
            status: error.status,
            headers:
              error.error === "invalid_client" && error.status === 401
                ? { "www-authenticate": 'Basic realm="calocount"' }
                : {},
          },
        );
      }
      services.logger.error("OAuth request failed", {
        requestId: context.get("requestId"),
        error,
      });
      return oauthJson(
        {
          error: "server_error",
          error_description: "The request could not be completed.",
        },
        { status: 500 },
      );
    }
  }

  async function authorize({
    context,
    params,
    decision,
  }: {
    context: Context<AuthEnvironment>;
    params: URLSearchParams;
    decision: "allow" | "deny" | null;
  }): Promise<Response> {
    const origin = new URL(context.req.url).origin;
    const check = await logic.authOAuth.checkAuthorizationRequest({
      params,
      origin,
    });
    if (!check.ok) {
      return renderConnectionErrorPage({
        status: 400,
        message: check.description,
      });
    }
    if (!context.get("session")) {
      // After sign-in, the sign-in page loads this request again.
      const returnTo = `/oauth/authorize?${params.toString()}`;
      return context.redirect(
        `/login?returnTo=${encodeURIComponent(returnTo)}`,
        303,
      );
    }
    const { request } = check;
    if (decision === null) {
      return renderConsentPage({
        clientName: request.client.name,
        redirectHost: new URL(request.redirectUri).host,
        fields: consentFields({
          params,
          clientId: request.client.id,
          redirectUri: request.redirectUri,
          codeChallenge: request.codeChallenge,
        }),
      });
    }
    const location =
      decision === "allow"
        ? await logic.authOAuth.approve({ request, origin })
        : logic.authOAuth.deny({ request, origin });
    const response = context.redirect(location, 303);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  async function authorizeSafely(
    context: Context<AuthEnvironment>,
    run: () => Promise<Response>,
  ): Promise<Response> {
    try {
      return await run();
    } catch (error) {
      services.logger.error("OAuth authorization failed", {
        requestId: context.get("requestId"),
        error,
      });
      return renderConnectionErrorPage({
        status: 503,
        message: "Calocount could not check this request.",
      });
    }
  }

  const discovery = (context: Context<AuthEnvironment>, body: unknown) =>
    withOAuthErrors(context, async () => oauthJson(body));

  return new Hono<AuthEnvironment>()
    .get("/.well-known/oauth-authorization-server", (context) =>
      discovery(
        context,
        authorizationServerMetadata(new URL(context.req.url).origin),
      ),
    )
    .options("/.well-known/oauth-authorization-server", preflight)
    .get("/.well-known/oauth-protected-resource", (context) =>
      discovery(
        context,
        protectedResourceMetadata(new URL(context.req.url).origin),
      ),
    )
    .options("/.well-known/oauth-protected-resource", preflight)
    .get("/.well-known/oauth-protected-resource/mcp", (context) =>
      discovery(
        context,
        protectedResourceMetadata(new URL(context.req.url).origin),
      ),
    )
    .options("/.well-known/oauth-protected-resource/mcp", preflight)
    .post("/oauth/register", (context) =>
      withOAuthErrors(context, async () => {
        const text = await readSmallText(context.req.raw);
        const body = text === null ? null : parseJsonObject(text);
        if (!body) {
          throw new OAuthError(
            400,
            "invalid_client_metadata",
            "The request body must be a JSON object.",
          );
        }
        return oauthJson(
          await logic.authOAuth.registerClient({
            body,
            clientAddress: context.get("clientAddress"),
          }),
          { status: 201 },
        );
      }),
    )
    .options("/oauth/register", preflight)
    .post("/oauth/token", (context) =>
      withOAuthErrors(context, async () =>
        oauthJson(
          await logic.authOAuthToken.exchange({
            form: await readFormBody(context.req.raw),
            authorization: context.req.header("authorization") ?? null,
          }),
        ),
      ),
    )
    .options("/oauth/token", preflight)
    .use("/oauth/authorize", resolveSession({ services, logic }))
    .get("/oauth/authorize", (context) =>
      authorizeSafely(context, () =>
        authorize({
          context,
          params: new URL(context.req.url).searchParams,
          decision: null,
        }),
      ),
    )
    .post("/oauth/authorize", (context) =>
      authorizeSafely(context, async () => {
        // Only a page of this site can send the owner's answer.
        if (context.req.header("origin") !== new URL(context.req.url).origin) {
          return renderConnectionErrorPage({
            status: 403,
            message: "The answer must come from the Calocount page.",
          });
        }
        const text = await readSmallText(context.req.raw);
        if (text === null) {
          return renderConnectionErrorPage({
            status: 413,
            message: "The request is too large.",
          });
        }
        const params = new URLSearchParams(text);
        const decision = params.get("decision") === "allow" ? "allow" : "deny";
        params.delete("decision");
        return authorize({ context, params, decision });
      }),
    );
}
