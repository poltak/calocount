import { Hono, type Context } from "hono";
import { routeBodyLimit } from "../../core/handlers/body-limit.js";
import type { RequestEnvironment } from "../../core/handlers/types.js";
import type {
  AppConfig,
  BackendLogic,
  BackendServices,
} from "../../core/types.js";
import { isObject } from "../utils/json-object.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../utils/tool-definitions.js";
import { answerBody } from "./mcp-protocol.js";
import { createToolCaller } from "./tool-calls.js";

const MAX_BODY_BYTES = 1_000_000;

interface McpHandlerProps {
  logic: Pick<
    BackendLogic,
    "authOAuthToken" | "entries" | "entryReads" | "settings" | "weights"
  >;
  services: Pick<BackendServices, "logger">;
  config: Pick<AppConfig, "blackBox">;
}

type McpContext = Context<RequestEnvironment>;

function httpError(
  status: 400 | 401 | 403 | 405 | 413,
  code: string,
  message: string,
) {
  return Response.json(
    { error: { code, message } },
    { status, headers: noStore() },
  );
}

function noStore(): Record<string, string> {
  return {
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
}

/** A browser page of another site must not call the endpoint with the owner's token. */
function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return true;
  }
  try {
    const parsed = new URL(origin);
    return (
      parsed.origin !== "null" &&
      parsed.origin === origin &&
      parsed.origin === new URL(request.url).origin
    );
  } catch {
    return false;
  }
}

/** The body, or `null` when it is larger than the limit. Nothing larger stays in memory. */
async function readBody(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return null;
  }
  if (!request.body) {
    return new Uint8Array(0);
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
    if (size > MAX_BODY_BYTES) {
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
  return bytes;
}

/** After `initialize`, each request names the protocol version that was agreed. */
function versionError({
  request,
  body,
}: {
  request: Request;
  body?: unknown;
}): Response | null {
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return httpError(
      400,
      "unsupported_protocol_version",
      "The MCP protocol version is not supported.",
    );
  }
  if (version !== null || request.method !== "POST") {
    return null;
  }
  // An unreadable body is left for the parse step to refuse.
  if (body === undefined) {
    return null;
  }
  if (isObject(body) && body["method"] === "initialize") {
    return null;
  }
  return httpError(
    400,
    "unsupported_protocol_version",
    "The MCP protocol version is required after initialization.",
  );
}

/**
 * The MCP endpoint of ChatGPT and other agents, over streamable HTTP without
 * sessions. Every call needs the access token of a connected app. A call
 * without one gets the challenge that starts the OAuth sign-in.
 */
export function createMcpHandlers({
  logic,
  services,
  config,
}: McpHandlerProps) {
  const tools = createToolCaller({ logic, services, config });

  /** The account of the token, or the response that sends the client to sign in. */
  async function authorize(
    context: McpContext,
  ): Promise<{ accountKey: string } | Response> {
    const request = context.req.raw;
    if (!isOriginAllowed(request)) {
      return httpError(
        403,
        "invalid_origin",
        "The Origin header is not allowed.",
      );
    }
    const origin = new URL(request.url).origin;
    const token =
      request.headers
        .get("authorization")
        ?.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i)?.[1] ?? null;
    const identity = token
      ? await logic.authOAuthToken.verifyAccessToken({ token, origin })
      : null;
    if (!identity) {
      return Response.json(
        { error: { code: "unauthorized", message: "Sign-in is required." } },
        {
          status: 401,
          headers: {
            ...noStore(),
            "www-authenticate": logic.authOAuthToken.challenge({
              origin,
              invalidToken: token !== null,
            }),
          },
        },
      );
    }
    return { accountKey: identity.ownerKey };
  }

  return (
    new Hono<RequestEnvironment>()
      .get("/mcp", async (context) => {
        const identity = await authorize(context);
        if (identity instanceof Response) {
          return identity;
        }
        return (
          versionError({ request: context.req.raw }) ??
          httpError(
            405,
            "method_not_allowed",
            "This MCP endpoint does not offer a server event stream.",
          )
        );
      })
      // The default limit is lower than the limit of this endpoint. The check
      // below refuses a body over `MAX_BODY_BYTES` with the code of the old
      // endpoint, so this limit only has to be higher.
      .post("/mcp", routeBodyLimit(MAX_BODY_BYTES * 2), async (context) => {
        const identity = await authorize(context);
        if (identity instanceof Response) {
          return identity;
        }
        const bytes = await readBody(context.req.raw);
        if (bytes === null) {
          return httpError(
            413,
            "payload_too_large",
            "The request is too large.",
          );
        }
        let body: unknown;
        try {
          body = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          const refused = versionError({ request: context.req.raw });
          return (
            refused ??
            Response.json(
              {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: "Parse error" },
              },
              { status: 400, headers: noStore() },
            )
          );
        }
        const refused = versionError({ request: context.req.raw, body });
        if (refused) {
          return refused;
        }
        const answer = await answerBody({
          body,
          callTool: tools.call(identity),
        });
        return answer === null
          ? new Response(null, { status: 202, headers: noStore() })
          : Response.json(answer, { status: 200, headers: noStore() });
      })
  );
}
