import type { APIRequestContext, APIResponse } from "@playwright/test";

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}

/** An MCP client over streamable HTTP, as ChatGPT connects to `/mcp`. */
export class McpClient {
  private nextId = 1;
  /** The protocol version that `initialize` agreed, sent with each later request. */
  private protocolVersion: string | null = null;

  constructor(
    private readonly input: {
      request: APIRequestContext;
      origin: string;
      accessToken: string | null;
    },
  ) {}

  /** Send one JSON-RPC request, and return the raw answer. */
  async send(method: string, params: unknown = {}): Promise<APIResponse> {
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    if (this.protocolVersion !== null) {
      headers["mcp-protocol-version"] = this.protocolVersion;
    }
    if (this.input.accessToken !== null) {
      headers["authorization"] = `Bearer ${this.input.accessToken}`;
    }
    return this.input.request.post(`${this.input.origin}/mcp`, {
      headers,
      data: { jsonrpc: "2.0", id: this.nextId++, method, params },
    });
  }

  /** Agree on a protocol version, as each MCP client does first. */
  async initialize(): Promise<void> {
    const result = await this.result<{ protocolVersion: string }>(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "black-box-agent", version: "1.0.0" },
      },
    );
    this.protocolVersion = result.protocolVersion;
  }

  async listTools(): Promise<Array<{ name: string }>> {
    const body = await this.result<{ tools: Array<{ name: string }> }>(
      "tools/list",
    );
    return body.tools;
  }

  /** Call a tool, and return its result. A tool error is a result too. */
  async callTool(name: string, args: unknown): Promise<ToolResult> {
    return this.result<ToolResult>("tools/call", { name, arguments: args });
  }

  private async result<T>(method: string, params: unknown = {}): Promise<T> {
    const response = await this.send(method, params);
    if (!response.ok()) {
      throw new Error(
        `MCP ${method} failed: ${response.status()} ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      result?: T;
      error?: { message: string };
    };
    if (body.error || body.result === undefined) {
      throw new Error(`MCP ${method} failed: ${body.error?.message}`);
    }
    return body.result;
  }
}
