import { isObject, type JsonObject } from "../utils/json-object.js";
import {
  MCP_PROTOCOL_VERSION,
  SERVER_INSTRUCTIONS,
  SUPPORTED_PROTOCOL_VERSIONS,
  TOOL_DEFINITIONS,
} from "../utils/tool-definitions.js";

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type RequestId = string | number | null;

export interface ToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
  isError: boolean;
}

export type CallTool = (input: {
  name: string;
  arguments: JsonObject;
}) => Promise<ToolCallResult | null>;

function failure(id: RequestId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function success(id: RequestId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function isRequestId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Answer one JSON-RPC message of the MCP protocol. A notification or a
 * response from the client has no answer, so the result is `null`.
 */
async function answerMessage({
  message,
  callTool,
}: {
  message: unknown;
  callTool: CallTool;
}) {
  if (!isObject(message) || message["jsonrpc"] !== "2.0") {
    return failure(
      null,
      INVALID_REQUEST,
      "The message is not a JSON-RPC 2.0 message.",
    );
  }
  const method = message["method"];
  if (typeof method !== "string") {
    // A response to a request of the server. This server sends none.
    return "id" in message && !("result" in message || "error" in message)
      ? failure(null, INVALID_REQUEST, "The message has no method.")
      : null;
  }
  if (!("id" in message)) {
    return null;
  }
  const id = message["id"];
  if (!isRequestId(id)) {
    return failure(
      null,
      INVALID_REQUEST,
      "The message id must be a string or a number.",
    );
  }
  const params = isObject(message["params"]) ? message["params"] : {};

  if (method === "initialize") {
    const requested = params["protocolVersion"];
    return success(id, {
      protocolVersion:
        typeof requested === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "calocount", version: "0.1.0" },
      instructions: SERVER_INSTRUCTIONS,
    });
  }
  if (method === "ping") {
    return success(id, {});
  }
  if (method === "tools/list") {
    return success(id, { tools: TOOL_DEFINITIONS });
  }
  if (method === "tools/call") {
    const name = params["name"];
    const toolArguments = params["arguments"];
    if (typeof name !== "string") {
      return failure(id, INVALID_PARAMS, "The tool name is required.");
    }
    if (!isObject(toolArguments)) {
      return failure(id, INVALID_PARAMS, "Tool arguments must be an object.");
    }
    try {
      const result = await callTool({ name, arguments: toolArguments });
      return result
        ? success(id, result)
        : failure(id, INVALID_PARAMS, `Unknown tool: ${name}`);
    } catch {
      return failure(
        id,
        INTERNAL_ERROR,
        "The tool call could not be completed.",
      );
    }
  }
  return failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
}

/**
 * Answer the body of a POST: one message, or a batch. The result is `null`
 * when there is nothing to answer, and the HTTP answer is then 202.
 */
export async function answerBody({
  body,
  callTool,
}: {
  body: unknown;
  callTool: CallTool;
}) {
  if (!Array.isArray(body)) {
    return answerMessage({ message: body, callTool });
  }
  if (body.length === 0) {
    return failure(null, INVALID_REQUEST, "A batch must contain a message.");
  }
  const answers = (
    await Promise.all(
      body.map((message: unknown) => answerMessage({ message, callTool })),
    )
  ).filter((answer) => answer !== null);
  return answers.length > 0 ? answers : null;
}
